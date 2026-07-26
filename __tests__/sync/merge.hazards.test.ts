import { describe, expect, it } from 'vitest';
import { mergeSnapshots } from '@/sync/merge';
import type { Operation } from '@/sync/types';
import { applyOps, at, DEV_A, DEV_B, EMPTY, row, snapshot, tomb } from './helpers';

const upserts = (ops: readonly Operation[]) => ops.filter((o) => o.kind === 'upsert');
const deletes = (ops: readonly Operation[]) => ops.filter((o) => o.kind === 'delete');
const rowOf = (ops: readonly Operation[], tbl: string, id: string) =>
  upserts(ops).find((o) => o.tbl === tbl && (o.row as { id: string }).id === id)?.row as
    | Record<string, unknown>
    | undefined;

// ---------------------------------------------------------------------------
// Hazard 1 — hard deletes used to resurrect
// ---------------------------------------------------------------------------
describe('tombstones', () => {
  it('a deleted row stays deleted when the peer only has an older copy', () => {
    // The bug this whole mechanism exists to prevent: delete a DOPE row on the
    // desktop, sync, and watch it come back from the phone.
    const local = snapshot({
      device: DEV_A,
      rows: { rangeSessions: [row('rangeSessions', 's1', at(1, DEV_A), { rifleId: null })] },
      tombstones: [tomb('dopeEntries', 'd1', at(10, DEV_A))],
    });
    const peerStillHasIt = snapshot({
      device: DEV_B,
      rows: {
        rangeSessions: [row('rangeSessions', 's1', at(1, DEV_A), { rifleId: null })],
        dopeEntries: [row('dopeEntries', 'd1', at(5, DEV_B), { sessionId: 's1' })],
      },
    });

    const result = mergeSnapshots(local, [peerStillHasIt]);
    expect(rowOf(result.ops, 'dopeEntries', 'd1')).toBeUndefined();
  });

  it('a newer edit does resurrect the row — correct last-writer-wins, not a bug', () => {
    // Documented behaviour: editing a row after someone deleted it means you
    // wanted it. The alternative (delete always wins) loses real work.
    const local = snapshot({
      device: DEV_A,
      rows: { rangeSessions: [row('rangeSessions', 's1', at(1, DEV_A), { rifleId: null })] },
      tombstones: [tomb('dopeEntries', 'd1', at(5, DEV_A))],
    });
    const peerEditedItLater = snapshot({
      device: DEV_B,
      rows: {
        rangeSessions: [row('rangeSessions', 's1', at(1, DEV_A), { rifleId: null })],
        dopeEntries: [row('dopeEntries', 'd1', at(20, DEV_B), { sessionId: 's1' })],
      },
    });

    const result = mergeSnapshots(local, [peerEditedItLater]);
    expect(rowOf(result.ops, 'dopeEntries', 'd1')).toBeDefined();
  });

  it('a tombstone beats a live row at an identical timestamp', () => {
    const stamp = at(7, DEV_A);
    const local = snapshot({ device: DEV_A, tombstones: [tomb('rifles', 'r1', stamp)] });
    const peer = snapshot({ device: DEV_B, rows: { rifles: [row('rifles', 'r1', stamp)] } });

    expect(rowOf(mergeSnapshots(local, [peer]).ops, 'rifles', 'r1')).toBeUndefined();
  });

  it('deletes a local row when a peer tombstoned it', () => {
    const local = snapshot({ device: DEV_A, rows: { rifles: [row('rifles', 'r1', at(1, DEV_A))] } });
    const peer = snapshot({ device: DEV_B, tombstones: [tomb('rifles', 'r1', at(9, DEV_B))] });

    expect(deletes(mergeSnapshots(local, [peer]).ops)).toMatchObject([
      { kind: 'delete', tbl: 'rifles', id: 'r1' },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Hazard 3 — range_cards unique index; a naive upsert throws
// ---------------------------------------------------------------------------
describe('duplicate range cards', () => {
  const base = {
    rifles: [row('rifles', 'r1', at(1, DEV_A))],
    loads: [row('loads', 'l1', at(1, DEV_A), { rifleId: 'r1', currentVersionId: 'v1' })],
    loadVersions: [row('loadVersions', 'v1', at(1, DEV_A), { loadId: 'l1' })],
  };

  it('keeps exactly one card per rifle and load version', () => {
    // Both devices opened the range card offline, so both minted a row against
    // the schema's only unique index.
    const local = snapshot({
      device: DEV_A,
      rows: {
        ...base,
        rangeCards: [
          row('rangeCards', 'c-a', at(5, DEV_A), { rifleId: 'r1', loadVersionId: 'v1' }),
        ],
      },
    });
    const peer = snapshot({
      device: DEV_B,
      rows: {
        ...base,
        rangeCards: [
          row('rangeCards', 'c-b', at(9, DEV_B), { rifleId: 'r1', loadVersionId: 'v1' }),
        ],
      },
    });

    const result = mergeSnapshots(local, [peer]);
    const cards = upserts(result.ops).filter((o) => o.tbl === 'rangeCards');
    expect(cards).toHaveLength(1);
    expect((cards[0]!.row as { id: string }).id).toBe('c-b');

    // The loser needs a real tombstone: a device that never saw the conflict
    // cannot re-derive its absence.
    expect(result.mintTombstones).toContainEqual(
      expect.objectContaining({ tbl: 'rangeCards', id: 'c-a' }),
    );
    expect(deletes(result.ops)).toContainEqual({ kind: 'delete', tbl: 'rangeCards', id: 'c-a' });
    expect(result.warnings.map((w) => w.code)).toContain('duplicate-range-card');
  });

  it('never emits two cards with the same key, so the apply cannot throw', () => {
    const cards = ['c-a', 'c-b', 'c-c'].map((id, i) =>
      row('rangeCards', id, at(5 + i, DEV_A), { rifleId: 'r1', loadVersionId: 'v1' }),
    );
    const result = mergeSnapshots(EMPTY(), [
      snapshot({ device: DEV_B, rows: { ...base, rangeCards: cards } }),
    ]);

    const keys = upserts(result.ops)
      .filter((o) => o.tbl === 'rangeCards')
      .map((o) => {
        const r = o.row as unknown as { rifleId: string; loadVersionId: string };
        return `${r.rifleId}/${r.loadVersionId}`;
      });
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toHaveLength(1);
  });

  it('leaves cards for different load versions alone', () => {
    const result = mergeSnapshots(EMPTY(), [
      snapshot({
        device: DEV_B,
        rows: {
          ...base,
          loadVersions: [
            row('loadVersions', 'v1', at(1, DEV_A), { loadId: 'l1', versionNumber: 1 }),
            row('loadVersions', 'v2', at(2, DEV_A), { loadId: 'l1', versionNumber: 2 }),
          ],
          rangeCards: [
            row('rangeCards', 'c1', at(5, DEV_B), { rifleId: 'r1', loadVersionId: 'v1' }),
            row('rangeCards', 'c2', at(6, DEV_B), { rifleId: 'r1', loadVersionId: 'v2' }),
          ],
        },
      }),
    ]);
    expect(upserts(result.ops).filter((o) => o.tbl === 'rangeCards')).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Hazard 8 — foreign keys are enforced, so orphans abort the apply
// ---------------------------------------------------------------------------
describe('orphan sweep', () => {
  it('drops a row whose required parent did not survive', () => {
    // dopeEntries.sessionId is NOT NULL, so there is no way to keep the row.
    const result = mergeSnapshots(EMPTY(), [
      snapshot({
        device: DEV_B,
        rows: { dopeEntries: [row('dopeEntries', 'd1', at(2, DEV_B), { sessionId: 'missing' })] },
      }),
    ]);
    expect(upserts(result.ops)).toHaveLength(0);
    expect(result.warnings.map((w) => w.code)).toContain('orphan-dropped');
  });

  it('clears the link instead when the column is nullable', () => {
    // loads.rifleId is nullable — an unassigned load is a legitimate state, so
    // the recipe survives with its rifle link blanked rather than being deleted.
    const result = mergeSnapshots(EMPTY(), [
      snapshot({
        device: DEV_B,
        rows: { loads: [row('loads', 'l1', at(2, DEV_B), { rifleId: 'missing' })] },
      }),
    ]);
    expect(rowOf(result.ops, 'loads', 'l1')).toMatchObject({ rifleId: null });
    expect(result.warnings.map((w) => w.code)).toContain('orphan-unlinked');
  });

  it('cascades to any depth in one pass', () => {
    // rifle -> load -> version -> session -> dope, with the rifle missing.
    const result = mergeSnapshots(EMPTY(), [
      snapshot({
        device: DEV_B,
        rows: {
          loads: [row('loads', 'l1', at(1, DEV_B), { rifleId: null })],
          loadVersions: [row('loadVersions', 'v1', at(1, DEV_B), { loadId: 'l1' })],
          rangeSessions: [
            row('rangeSessions', 's1', at(1, DEV_B), {
              rifleId: 'gone',
              loadVersionId: 'v1',
            }),
          ],
          dopeEntries: [row('dopeEntries', 'd1', at(1, DEV_B), { sessionId: 's1' })],
        },
      }),
    ]);

    const ids = upserts(result.ops).map((o) => (o.row as { id: string }).id);
    // The session's rifle is NOT NULL, so session and its dope both go.
    expect(ids).toContain('l1');
    expect(ids).toContain('v1');
    expect(ids).not.toContain('s1');
    expect(ids).not.toContain('d1');
  });

  it('drops a shot string that lost both of its possible owners', () => {
    // shotStrings is owned by exactly one of a workup step or a session; both
    // links are nullable, so unlinking alone would leave it owned by nothing.
    const result = mergeSnapshots(EMPTY(), [
      snapshot({
        device: DEV_B,
        rows: {
          shotStrings: [
            row('shotStrings', 'str1', at(1, DEV_B), {
              sessionId: 'gone',
              workupStepId: 'also-gone',
            }),
          ],
          shots: [row('shots', 'sh1', at(1, DEV_B), { stringId: 'str1' })],
        },
      }),
    ]);

    const ids = upserts(result.ops).map((o) => (o.row as { id: string }).id);
    expect(ids).not.toContain('str1');
    expect(ids).not.toContain('sh1');
  });
});

// ---------------------------------------------------------------------------
// Hazard 4 — colliding version numbers from offline edits
// ---------------------------------------------------------------------------
describe('load version numbering', () => {
  const load = row('loads', 'l1', at(1, DEV_A), { rifleId: null, currentVersionId: 'v1' });

  it('renumbers when two devices both minted the same version number', () => {
    const local = snapshot({
      device: DEV_A,
      rows: {
        loads: [load],
        loadVersions: [
          row('loadVersions', 'v1', at(1, DEV_A), { loadId: 'l1', versionNumber: 1 }),
          row('loadVersions', 'v2a', at(5, DEV_A), {
            loadId: 'l1',
            versionNumber: 2,
            createdAt: new Date(1_784_562_355_000),
          }),
        ],
      },
    });
    const peer = snapshot({
      device: DEV_B,
      rows: {
        loads: [load],
        loadVersions: [
          row('loadVersions', 'v1', at(1, DEV_A), { loadId: 'l1', versionNumber: 1 }),
          row('loadVersions', 'v2b', at(6, DEV_B), {
            loadId: 'l1',
            versionNumber: 2,
            createdAt: new Date(1_784_562_356_000),
          }),
        ],
      },
    });

    const result = mergeSnapshots(local, [peer]);
    const settled = applyOps(local, result, DEV_A);

    // Every version survives; the collision is resolved by renumbering in
    // creation order, which both devices compute identically.
    const versions = (settled.rows.loadVersions ?? [])
      .slice()
      .sort((a, b) => Number(a.versionNumber) - Number(b.versionNumber));
    expect(versions.map((v) => v.id)).toEqual(['v1', 'v2a', 'v2b']);
    expect(versions.map((v) => v.versionNumber)).toEqual([1, 2, 3]);
    expect(result.warnings.map((w) => w.code)).toContain('version-renumbered');
  });

  it('leaves correctly numbered versions untouched', () => {
    // Renumbering a shooter's "v3" into "v2" for no reason is its own data loss.
    const rows = {
      loads: [load],
      loadVersions: [
        row('loadVersions', 'v1', at(1, DEV_A), { loadId: 'l1', versionNumber: 1 }),
        row('loadVersions', 'v2', at(2, DEV_A), { loadId: 'l1', versionNumber: 2 }),
        row('loadVersions', 'v3', at(3, DEV_A), { loadId: 'l1', versionNumber: 3 }),
      ],
    };
    const result = mergeSnapshots(snapshot({ device: DEV_A, rows }), [
      snapshot({ device: DEV_B, rows }),
    ]);
    expect(result.warnings.map((w) => w.code)).not.toContain('version-renumbered');
  });
});

// ---------------------------------------------------------------------------
// Hazard 5 — currentVersionId has no foreign key behind it
// ---------------------------------------------------------------------------
describe('currentVersionId repair', () => {
  it('repoints a load at its newest surviving version', () => {
    const result = mergeSnapshots(EMPTY(), [
      snapshot({
        device: DEV_B,
        rows: {
          loads: [
            row('loads', 'l1', at(1, DEV_B), { rifleId: null, currentVersionId: 'deleted-long-ago' }),
          ],
          loadVersions: [
            row('loadVersions', 'v1', at(1, DEV_B), { loadId: 'l1', versionNumber: 1 }),
            row('loadVersions', 'v2', at(2, DEV_B), { loadId: 'l1', versionNumber: 2 }),
          ],
        },
      }),
    ]);
    expect(rowOf(result.ops, 'loads', 'l1')).toMatchObject({ currentVersionId: 'v2' });
    expect(result.warnings.map((w) => w.code)).toContain('current-version-repaired');
  });

  it('nulls the pointer when a load has no versions left', () => {
    const result = mergeSnapshots(EMPTY(), [
      snapshot({
        device: DEV_B,
        rows: {
          loads: [row('loads', 'l1', at(1, DEV_B), { rifleId: null, currentVersionId: 'ghost' })],
        },
      }),
    ]);
    expect(rowOf(result.ops, 'loads', 'l1')).toMatchObject({ currentVersionId: null });
  });

  it('both devices compute the same pointer independently', () => {
    const rows = {
      loads: [row('loads', 'l1', at(1, DEV_A), { rifleId: null, currentVersionId: 'v1' })],
      loadVersions: [
        row('loadVersions', 'v1', at(1, DEV_A), { loadId: 'l1', versionNumber: 1 }),
        row('loadVersions', 'v2', at(2, DEV_B), { loadId: 'l1', versionNumber: 2 }),
      ],
    };
    const fromA = mergeSnapshots(snapshot({ device: DEV_A, rows }), [
      snapshot({ device: DEV_B, rows }),
    ]);
    const fromB = mergeSnapshots(snapshot({ device: DEV_B, rows }), [
      snapshot({ device: DEV_A, rows }),
    ]);
    expect(rowOf(fromA.ops, 'loads', 'l1')?.currentVersionId).toBe(
      rowOf(fromB.ops, 'loads', 'l1')?.currentVersionId,
    );
  });
});

// ---------------------------------------------------------------------------
// Hazard 6 — cached shot statistics go stale when shots arrive from a peer
// ---------------------------------------------------------------------------
describe('derived shot-string statistics', () => {
  const session = row('rangeSessions', 's1', at(1, DEV_A), { rifleId: null });

  it('recomputes average, SD, ES and count from the merged shots', () => {
    const result = mergeSnapshots(EMPTY(), [
      snapshot({
        device: DEV_B,
        rows: {
          rangeSessions: [session],
          shotStrings: [
            row('shotStrings', 'str1', at(2, DEV_B), {
              sessionId: 's1',
              avgFps: 9999,
              sdFps: 9999,
              esFps: 9999,
              shotCount: 1,
            }),
          ],
          shots: [
            row('shots', 'sh1', at(3, DEV_B), { stringId: 'str1', seq: 1, velocityFps: 2700 }),
            row('shots', 'sh2', at(4, DEV_B), { stringId: 'str1', seq: 2, velocityFps: 2710 }),
            row('shots', 'sh3', at(5, DEV_B), { stringId: 'str1', seq: 3, velocityFps: 2690 }),
          ],
        },
      }),
    ]);

    expect(rowOf(result.ops, 'shotStrings', 'str1')).toMatchObject({
      shotCount: 3,
      avgFps: 2700,
      esFps: 20,
    });
    expect(rowOf(result.ops, 'shotStrings', 'str1')?.sdFps).toBeCloseTo(10, 6);
  });

  it('leaves a hand-entered summary alone when there are no shot rows', () => {
    // addShotString explicitly supports a summary-only string; recomputing it
    // to null would erase numbers the user typed in.
    const result = mergeSnapshots(EMPTY(), [
      snapshot({
        device: DEV_B,
        rows: {
          rangeSessions: [session],
          shotStrings: [
            row('shotStrings', 'str1', at(2, DEV_B), {
              sessionId: 's1',
              avgFps: 2705,
              sdFps: 6.2,
              esFps: 18,
              shotCount: null,
            }),
          ],
        },
      }),
    ]);
    expect(rowOf(result.ops, 'shotStrings', 'str1')).toMatchObject({ avgFps: 2705, esFps: 18 });
  });

  it('reports null SD for a single shot rather than zero', () => {
    const result = mergeSnapshots(EMPTY(), [
      snapshot({
        device: DEV_B,
        rows: {
          rangeSessions: [session],
          shotStrings: [row('shotStrings', 'str1', at(2, DEV_B), { sessionId: 's1' })],
          shots: [row('shots', 'sh1', at(3, DEV_B), { stringId: 'str1', velocityFps: 2700 })],
        },
      }),
    ]);
    expect(rowOf(result.ops, 'shotStrings', 'str1')).toMatchObject({ sdFps: null, shotCount: 1 });
  });
});

// ---------------------------------------------------------------------------
// Repair Rule R — deterministic repairs must not mint timestamps
// ---------------------------------------------------------------------------
describe('repair rule R: deterministic repairs do not replicate', () => {
  it('re-merging after a repair produces no further data changes', () => {
    // If a repair minted a new timestamp, the peer would see a change, repair
    // again, mint again, and the two devices would never settle.
    const local = snapshot({
      device: DEV_A,
      rows: {
        loads: [row('loads', 'l1', at(1, DEV_A), { rifleId: null, currentVersionId: 'stale' })],
        loadVersions: [row('loadVersions', 'v1', at(1, DEV_A), { loadId: 'l1', versionNumber: 1 })],
      },
    });
    const peer = snapshot({
      device: DEV_B,
      rows: {
        loads: [row('loads', 'l1', at(1, DEV_A), { rifleId: null, currentVersionId: 'stale' })],
        loadVersions: [row('loadVersions', 'v1', at(1, DEV_A), { loadId: 'l1', versionNumber: 1 })],
      },
    });

    const first = mergeSnapshots(local, [peer]);
    expect(first.ops.some((o) => o.kind === 'upsert')).toBe(true);

    const settled = applyOps(local, first, DEV_A);
    const second = mergeSnapshots(settled, [peer]);
    expect(second.ops.filter((o) => o.kind === 'upsert' || o.kind === 'delete')).toEqual([]);
  });

  it('repairs never appear as minted tombstones', () => {
    const result = mergeSnapshots(EMPTY(), [
      snapshot({
        device: DEV_B,
        rows: {
          loads: [row('loads', 'l1', at(1, DEV_B), { rifleId: null, currentVersionId: 'ghost' })],
          loadVersions: [
            row('loadVersions', 'v1', at(1, DEV_B), { loadId: 'l1', versionNumber: 7 }),
          ],
        },
      }),
    ]);
    // Renumbering and repointing remove nothing, so nothing is tombstoned.
    expect(result.mintTombstones).toEqual([]);
  });
});
