import { describe, expect, it } from 'vitest';
import { TABLE_ORDER } from '@/lib/tables';
import { mergeSnapshots } from '@/sync/merge';
import { SYNC_PROTOCOL } from '@/sync/protocol';
import type { Operation } from '@/sync/types';
import { at, DEV_A, DEV_B, EMPTY, row, snapshot, tomb } from './helpers';

const upsertsOf = (ops: readonly Operation[]) => ops.filter((o) => o.kind === 'upsert');
const deletesOf = (ops: readonly Operation[]) => ops.filter((o) => o.kind === 'delete');

describe('last-writer-wins fold', () => {
  it('merging nothing into nothing does nothing', () => {
    const result = mergeSnapshots(EMPTY(), []);
    expect(result.ops).toEqual([]);
    expect(result.maxObservedHlc).toBeNull();
  });

  it('keeps local rows when there are no peers', () => {
    const local = snapshot({
      device: DEV_A,
      rows: { rifles: [row('rifles', 'r1', at(1, DEV_A))] },
    });
    const result = mergeSnapshots(local, []);
    // Nothing changed, so nothing to write.
    expect(result.ops).toEqual([]);
  });

  it('pulls in a row the local device has never seen', () => {
    const local = EMPTY();
    const remote = snapshot({
      device: DEV_B,
      rows: { rifles: [row('rifles', 'r1', at(1, DEV_B), { name: 'Bergara' })] },
    });

    const result = mergeSnapshots(local, [remote]);
    const upserts = upsertsOf(result.ops);
    expect(upserts).toHaveLength(1);
    expect(upserts[0]).toMatchObject({ tbl: 'rifles', row: { id: 'r1', name: 'Bergara' } });
    expect(result.stats.incomingRows).toBe(1);
  });

  it('the newer edit wins, whichever device made it', () => {
    const older = row('rifles', 'r1', at(1, DEV_A), { name: 'Old name' });
    const newer = row('rifles', 'r1', at(9, DEV_B), { name: 'New name' });

    const remoteWins = mergeSnapshots(
      snapshot({ device: DEV_A, rows: { rifles: [older] } }),
      [snapshot({ device: DEV_B, rows: { rifles: [newer] } })],
    );
    expect(upsertsOf(remoteWins.ops)[0]).toMatchObject({ row: { name: 'New name' } });

    const localWins = mergeSnapshots(
      snapshot({ device: DEV_A, rows: { rifles: [newer] } }),
      [snapshot({ device: DEV_B, rows: { rifles: [older] } })],
    );
    // Local already holds the winner, so there is nothing to write.
    expect(upsertsOf(localWins.ops)).toHaveLength(0);
  });

  it('keeps both edits when they touch different rows — the whole point', () => {
    // The scenario the user cares about: DOPE added on the phone, recipe edited
    // on the desktop, neither synced in between.
    const rifle = row('rifles', 'r1', at(1, DEV_A));
    const session = row('rangeSessions', 's1', at(2, DEV_A), { rifleId: 'r1' });

    const local = snapshot({
      device: DEV_A,
      rows: {
        rifles: [rifle],
        rangeSessions: [session],
        dopeEntries: [row('dopeEntries', 'd1', at(5, DEV_A), { sessionId: 's1', distanceYd: 600 })],
      },
    });
    const remote = snapshot({
      device: DEV_B,
      rows: {
        rifles: [rifle],
        rangeSessions: [session],
        loads: [row('loads', 'l1', at(6, DEV_B), { name: 'Edited on desktop' })],
      },
    });

    const result = mergeSnapshots(local, [remote]);
    const upserts = upsertsOf(result.ops);
    expect(upserts.map((o) => o.tbl)).toContain('loads');
    // The local DOPE row is untouched and still present.
    expect(deletesOf(result.ops)).toHaveLength(0);
  });

  it('reports the highest timestamp it saw, so the local clock can pass it', () => {
    const result = mergeSnapshots(EMPTY(), [
      snapshot({ device: DEV_B, rows: { rifles: [row('rifles', 'r1', at(500, DEV_B))] } }),
    ]);
    expect(result.maxObservedHlc).toBe(at(500, DEV_B));
  });
});

describe('algebraic properties that make convergence possible', () => {
  const local = snapshot({
    device: DEV_A,
    rows: {
      rifles: [row('rifles', 'r1', at(1, DEV_A), { name: 'A' })],
      loads: [row('loads', 'l1', at(2, DEV_A))],
    },
  });
  const remoteB = snapshot({
    device: DEV_B,
    rows: {
      rifles: [row('rifles', 'r1', at(7, DEV_B), { name: 'B' })],
      loads: [row('loads', 'l2', at(3, DEV_B))],
    },
  });
  const remoteC = snapshot({
    device: DEV_A,
    rows: { rifles: [row('rifles', 'r2', at(4, DEV_A))] },
  });

  it('is idempotent — merging the same peer twice changes nothing the second time', () => {
    const first = mergeSnapshots(local, [remoteB]);
    const applied = snapshot({
      device: DEV_A,
      rows: {
        rifles: [row('rifles', 'r1', at(7, DEV_B), { name: 'B' })],
        loads: [row('loads', 'l1', at(2, DEV_A)), row('loads', 'l2', at(3, DEV_B))],
      },
    });
    const second = mergeSnapshots(applied, [remoteB]);
    expect(first.ops.length).toBeGreaterThan(0);
    expect(second.ops.filter((o) => o.kind !== 'meta')).toEqual([]);
  });

  it('is order-independent — peer order cannot change the outcome', () => {
    const ab = mergeSnapshots(local, [remoteB, remoteC]);
    const ba = mergeSnapshots(local, [remoteC, remoteB]);

    const normalise = (ops: readonly Operation[]) =>
      ops
        .filter((o) => o.kind === 'upsert')
        .map((o) => JSON.stringify(o))
        .sort();

    expect(normalise(ab.ops)).toEqual(normalise(ba.ops));
  });
});

describe('operation ordering', () => {
  it('emits every delete before every upsert', () => {
    // SQLite checks unique indexes immediately, so a row being replaced must be
    // gone before its replacement lands.
    const local = snapshot({
      device: DEV_A,
      rows: {
        rifles: [row('rifles', 'r1', at(1, DEV_A))],
        loads: [row('loads', 'l1', at(1, DEV_A), { rifleId: 'r1' })],
      },
      tombstones: [],
    });
    const remote = snapshot({
      device: DEV_B,
      rows: { rifles: [row('rifles', 'r2', at(5, DEV_B))] },
      tombstones: [tomb('rifles', 'r1', at(9, DEV_B))],
    });

    const result = mergeSnapshots(local, [remote]);
    const kinds = result.ops.map((o) => o.kind);
    const lastDelete = kinds.lastIndexOf('delete');
    const firstUpsert = kinds.indexOf('upsert');
    if (lastDelete !== -1 && firstUpsert !== -1) expect(lastDelete).toBeLessThan(firstUpsert);
  });

  it('deletes children before parents and upserts parents before children', () => {
    const local = snapshot({
      device: DEV_A,
      rows: {
        rifles: [row('rifles', 'r1', at(1, DEV_A))],
        loads: [row('loads', 'l1', at(1, DEV_A), { rifleId: 'r1' })],
        loadVersions: [row('loadVersions', 'v1', at(1, DEV_A), { loadId: 'l1' })],
      },
    });
    const remote = snapshot({
      device: DEV_B,
      tombstones: [
        tomb('rifles', 'r1', at(9, DEV_B)),
        tomb('loads', 'l1', at(9, DEV_B)),
        tomb('loadVersions', 'v1', at(9, DEV_B)),
      ],
    });

    const result = mergeSnapshots(local, [remote]);
    const deleteOrder = result.ops
      .filter((o) => o.kind === 'delete')
      .map((o) => TABLE_ORDER.indexOf(o.tbl));

    // Reverse TABLE_ORDER: indices must be non-increasing.
    for (let i = 1; i < deleteOrder.length; i++) {
      expect(deleteOrder[i]!).toBeLessThanOrEqual(deleteOrder[i - 1]!);
    }
  });

  it('upserts follow TABLE_ORDER so a parent always exists first', () => {
    const remote = snapshot({
      device: DEV_B,
      rows: {
        loadVersions: [row('loadVersions', 'v1', at(3, DEV_B), { loadId: 'l1' })],
        rifles: [row('rifles', 'r1', at(1, DEV_B))],
        loads: [row('loads', 'l1', at(2, DEV_B), { rifleId: 'r1' })],
      },
    });

    const order = mergeSnapshots(EMPTY(), [remote])
      .ops.filter((o) => o.kind === 'upsert')
      .map((o) => TABLE_ORDER.indexOf(o.tbl));

    for (let i = 1; i < order.length; i++) {
      expect(order[i]!).toBeGreaterThanOrEqual(order[i - 1]!);
    }
  });
});

describe('peer validation never breaks the whole sync', () => {
  it('skips a peer speaking a newer protocol but still merges the others', () => {
    const good = snapshot({
      device: DEV_B,
      rows: { rifles: [row('rifles', 'r1', at(1, DEV_B))] },
    });
    const future = snapshot({
      device: DEV_A,
      rows: { rifles: [row('rifles', 'r9', at(2, DEV_A))] },
      overrides: { protocol: SYNC_PROTOCOL + 1 },
    });

    const result = mergeSnapshots(EMPTY(), [future, good]);
    expect(result.stats.peersSkipped).toBe(1);
    expect(result.warnings.map((w) => w.code)).toContain('peer-newer-protocol');
    expect(upsertsOf(result.ops).map((o) => (o.row as { id: string }).id)).toEqual(['r1']);
  });

  it('skips a file that is not ours at all', () => {
    const alien = { app: 'something-else', rows: {}, tombstones: [] } as never;
    const result = mergeSnapshots(EMPTY(), [alien]);
    expect(result.stats.peersSkipped).toBe(1);
    expect(result.ops).toEqual([]);
  });

  it('skips a peer on a newer migration rather than dropping columns it cannot represent', () => {
    const newer = snapshot({
      device: DEV_B,
      rows: { rifles: [row('rifles', 'r1', at(1, DEV_B))] },
      overrides: { migrationTag: '9999_far_future' },
    });
    const result = mergeSnapshots(EMPTY(), [newer]);
    expect(result.warnings.map((w) => w.code)).toContain('peer-newer-migration');
    expect(result.ops).toEqual([]);
  });
});
