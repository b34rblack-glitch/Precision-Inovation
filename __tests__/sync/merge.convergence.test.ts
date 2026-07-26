import { describe, expect, it } from 'vitest';
import { TABLE_ORDER, type TableName } from '@/lib/tables';
import { formatHlc, receive, tick, type Hlc, type HlcTick } from '@/sync/hlc';
import { mergeSnapshots } from '@/sync/merge';
import { MIGRATION_TAG, SYNC_PROTOCOL, TABLE_SCHEMA_VERSION } from '@/sync/protocol';
import type { Snapshot, StampedRow, Tombstone } from '@/sync/types';
import { at, DEV_A, DEV_B, DEV_C, row, snapshot, T0 } from './helpers';

// The load-bearing test. Everything else checks one rule in isolation; this
// checks that the rules together actually settle — that three devices editing
// offline, syncing in arbitrary orders, end up agreeing.
//
// A merge engine that is correct rule-by-rule can still fail to converge (see
// Repair Rule R in merge.ts). Only a whole-system simulation catches that.

describe('mergeSnapshots does not mutate its inputs', () => {
  it('leaves the caller’s snapshots untouched', () => {
    // Regression guard: the repair steps assign to row fields, and aliasing the
    // caller's rows made a second call see the first call's repairs — so the
    // result depended on call history.
    const local = snapshot({
      device: DEV_A,
      rows: {
        loads: [row('loads', 'l1', at(1, DEV_A), { rifleId: null, currentVersionId: 'stale' })],
        loadVersions: [row('loadVersions', 'v1', at(1, DEV_A), { loadId: 'l1', versionNumber: 9 })],
      },
    });
    const before = JSON.stringify(local);

    mergeSnapshots(local, [local]);
    mergeSnapshots(local, [local]);

    expect(JSON.stringify(local)).toBe(before);
  });

  it('gives the same answer however many times it is called', () => {
    const local = snapshot({
      device: DEV_A,
      rows: {
        loads: [row('loads', 'l1', at(1, DEV_A), { rifleId: null, currentVersionId: 'stale' })],
        loadVersions: [row('loadVersions', 'v1', at(1, DEV_A), { loadId: 'l1', versionNumber: 1 })],
      },
    });
    const peer = snapshot({ device: DEV_B, rows: local.rows });

    const first = JSON.stringify(mergeSnapshots(local, [peer]).ops);
    const second = JSON.stringify(mergeSnapshots(local, [peer]).ops);
    expect(second).toBe(first);
  });
});

/** A simulated device: local state, its own clock, and a skewed wall clock. */
class Device {
  clock: HlcTick = { ms: T0, counter: 0 };
  rows = new Map<TableName, Map<string, StampedRow>>();
  tombs = new Map<string, Hlc>();

  constructor(
    readonly id: string,
    public wall: number,
  ) {
    for (const t of TABLE_ORDER) this.rows.set(t, new Map());
  }

  private stamp(): Hlc {
    this.clock = tick(this.clock, this.wall);
    return formatHlc(this.clock.ms, this.clock.counter, this.id);
  }

  write(tbl: TableName, id: string, fields: Record<string, unknown>): void {
    const hlc = this.stamp();
    const existing = this.rows.get(tbl)!.get(id);
    this.rows.get(tbl)!.set(tbl === 'shots' ? id : id, {
      ...(existing ?? row(tbl, id, hlc)),
      ...fields,
      id,
      _h: hlc,
    } as StampedRow);
    this.tombs.delete(`${tbl} ${id}`);
  }

  remove(tbl: TableName, id: string): void {
    const hlc = this.stamp();
    this.rows.get(tbl)!.delete(id);
    this.tombs.set(`${tbl} ${id}`, hlc);
  }

  ids(tbl: TableName): string[] {
    return [...this.rows.get(tbl)!.keys()];
  }

  /** What this device publishes: its complete view, so any one file can rebuild everything. */
  snapshot(): Snapshot {
    const rows: Partial<Record<TableName, StampedRow[]>> = {};
    for (const t of TABLE_ORDER) {
      const list = [...this.rows.get(t)!.values()];
      if (list.length > 0) rows[t] = list;
    }
    const tombstones: Tombstone[] = [...this.tombs].map(([k, hlc]) => {
      const sep = k.indexOf(' ');
      return { t: k.slice(0, sep) as TableName, id: k.slice(sep + 1), _h: hlc };
    });
    return {
      protocol: SYNC_PROTOCOL,
      app: 'precision-innovation',
      tableSchemaVersion: TABLE_SCHEMA_VERSION,
      migrationTag: MIGRATION_TAG,
      device: { id: this.id, name: this.id.slice(0, 4), platform: 'test' },
      publishedAt: new Date(this.wall).toISOString(),
      hlc: formatHlc(this.clock.ms, this.clock.counter, this.id),
      rows,
      tombstones,
    };
  }

  pull(peers: Snapshot[]): void {
    const result = mergeSnapshots(this.snapshot(), peers);

    for (const op of result.ops) {
      if (op.kind === 'delete') {
        this.rows.get(op.tbl)!.delete(op.id);
      } else if (op.kind === 'upsert') {
        const existing = this.rows.get(op.tbl)!.get(op.row.id);
        this.rows.get(op.tbl)!.set(op.row.id, {
          ...op.row,
          _h: existing?._h ?? '',
        } as StampedRow);
      } else {
        const k = `${op.tbl} ${op.id}`;
        if (op.deleted) {
          this.tombs.set(k, op.hlc);
          this.rows.get(op.tbl)!.delete(op.id);
        } else {
          this.tombs.delete(k);
          const r = this.rows.get(op.tbl)!.get(op.id);
          if (r) this.rows.get(op.tbl)!.set(op.id, { ...r, _h: op.hlc });
        }
      }
    }

    // Rows removed by a repair (a losing duplicate, an orphan) need real
    // tombstones — a peer that never saw the conflict cannot re-derive them.
    for (const t of result.mintTombstones) {
      this.rows.get(t.tbl)!.delete(t.id);
      this.tombs.set(`${t.tbl} ${t.id}`, this.stamp());
    }

    if (result.maxObservedHlc) {
      this.clock = receive(this.clock, result.maxObservedHlc, this.wall);
    }
  }

  fingerprint(): string {
    const parts: string[] = [];
    for (const t of TABLE_ORDER) {
      const list = [...this.rows.get(t)!.values()].sort((a, b) => (a.id < b.id ? -1 : 1));
      for (const r of list) {
        const keys = Object.keys(r)
          .filter((k) => k !== '_h')
          .sort();
        parts.push(
          `${t}/${r.id}:${keys
            .map((k) => `${k}=${r[k] instanceof Date ? (r[k] as Date).getTime() : String(r[k])}`)
            .join(',')}`,
        );
      }
    }
    return parts.join('\n');
  }
}

function makeRng(seed: number): () => number {
  let s = seed || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return Math.abs(s) / 0x7fffffff;
  };
}

/** Random edit on a device, biased towards realistic app usage. */
function randomEdit(d: Device, rnd: () => number, seq: { n: number }): void {
  const pick = rnd();
  const nextId = () => `x${seq.n++}`;

  if (pick < 0.16 || d.ids('rifles').length === 0) {
    d.write('rifles', nextId(), { name: `Rifle ${seq.n}` });
    return;
  }
  const rifle = d.ids('rifles')[Math.floor(rnd() * d.ids('rifles').length)]!;

  if (pick < 0.32) {
    // Mirrors createLoad: the load points at its first version immediately.
    const loadId = nextId();
    const versionId = nextId();
    d.write('loads', loadId, { rifleId: rifle, currentVersionId: versionId });
    d.write('loadVersions', versionId, { loadId, versionNumber: 1 });
    return;
  }
  if (pick < 0.44 && d.ids('loads').length > 0) {
    // Mirrors updateLoad's copy-on-write: a new version becomes current. This
    // is exactly how two offline devices collide on versionNumber.
    const loadId = d.ids('loads')[Math.floor(rnd() * d.ids('loads').length)]!;
    const siblings = [...d.rows.get('loadVersions')!.values()].filter((v) => v.loadId === loadId);
    const versionId = nextId();
    d.write('loadVersions', versionId, {
      loadId,
      versionNumber: siblings.length + 1,
      chargeGr: 40 + rnd() * 4,
    });
    d.write('loads', loadId, {
      ...d.rows.get('loads')!.get(loadId),
      currentVersionId: versionId,
    });
    return;
  }
  if (pick < 0.58) {
    d.write('rangeSessions', nextId(), { rifleId: rifle, loadVersionId: null });
    return;
  }
  if (pick < 0.74 && d.ids('rangeSessions').length > 0) {
    const s = d.ids('rangeSessions')[Math.floor(rnd() * d.ids('rangeSessions').length)]!;
    d.write('dopeEntries', nextId(), { sessionId: s, distanceYd: 100 + Math.floor(rnd() * 900) });
    return;
  }
  if (pick < 0.84 && d.ids('loadVersions').length > 0) {
    // Mirrors getOrCreateCard, which the unique index on
    // (rifleId, loadVersionId) forces: one card per pair, per device. Two
    // devices doing this offline still collide — which is the case the merge
    // engine has to resolve — but neither device holds a violation locally.
    const v = d.ids('loadVersions')[Math.floor(rnd() * d.ids('loadVersions').length)]!;
    const exists = [...d.rows.get('rangeCards')!.values()].some(
      (c) => c.rifleId === rifle && c.loadVersionId === v,
    );
    if (!exists) d.write('rangeCards', nextId(), { rifleId: rifle, loadVersionId: v });
    return;
  }
  if (pick < 0.92 && d.ids('dopeEntries').length > 0) {
    const id = d.ids('dopeEntries')[Math.floor(rnd() * d.ids('dopeEntries').length)]!;
    d.remove('dopeEntries', id);
    return;
  }
  if (d.ids('rifles').length > 0) {
    d.write('rifles', rifle, { name: `Renamed ${seq.n}` });
  }
}

describe('three devices editing offline always converge', () => {
  const SEEDS = [
    1, 2, 3, 7, 11, 42, 99, 137, 512, 1337, 4096, 9001, 20260, 90210, 271828, 314159, 662607,
    1618033, 8675309, 99999989,
  ];

  it.each(SEEDS)('converges for seed %i', (seed) => {
    const rnd = makeRng(seed);
    const seq = { n: 0 };

    // Deliberately skewed wall clocks: one device is a minute behind, one is
    // five minutes ahead. Without the logical clock the fast device would win
    // every conflict regardless of what actually happened later.
    const devices = [
      new Device(DEV_A, T0),
      new Device(DEV_B, T0 - 60_000),
      new Device(DEV_C, T0 + 300_000),
    ];

    for (let round = 0; round < 12; round++) {
      // Everyone works offline for a while.
      for (const d of devices) {
        const edits = 1 + Math.floor(rnd() * 4);
        for (let i = 0; i < edits; i++) {
          d.wall += Math.floor(rnd() * 50);
          randomEdit(d, rnd, seq);
        }
      }
      // Then a random subset syncs with a random subset, in a random order.
      const syncs = 1 + Math.floor(rnd() * 3);
      for (let i = 0; i < syncs; i++) {
        const puller = devices[Math.floor(rnd() * devices.length)]!;
        const peers = devices.filter((d) => d !== puller && rnd() < 0.7).map((d) => d.snapshot());
        if (peers.length > 0) puller.pull(peers);
      }
    }

    // Now let everyone see everyone, twice, which is what eventual consistency
    // is allowed to require.
    for (let round = 0; round < 3; round++) {
      for (const d of devices) {
        d.pull(devices.filter((o) => o !== d).map((o) => o.snapshot()));
      }
    }

    const [a, b, c] = devices.map((d) => d.fingerprint());
    expect(b).toBe(a);
    expect(c).toBe(a);
    // And the simulation actually did something.
    expect(a.length).toBeGreaterThan(0);
  });

  it('a device restored from nothing rebuilds the full dataset', () => {
    const rnd = makeRng(99);
    const seq = { n: 0 };
    const source = new Device(DEV_A, T0);
    for (let i = 0; i < 40; i++) randomEdit(source, rnd, seq);

    const blank = new Device(DEV_B, T0);
    blank.pull([source.snapshot()]);

    expect(blank.fingerprint()).toBe(source.fingerprint());
  });

  it('losing one device’s file loses nothing the others still hold', () => {
    // Every device publishes its complete view, so any single file can rebuild
    // the world. This is why snapshots are full rather than only owned rows.
    const rnd = makeRng(2024);
    const seq = { n: 0 };
    const a = new Device(DEV_A, T0);
    const b = new Device(DEV_B, T0);

    for (let i = 0; i < 25; i++) randomEdit(a, rnd, seq);
    b.pull([a.snapshot()]);
    for (let i = 0; i < 15; i++) randomEdit(b, rnd, seq);
    a.pull([b.snapshot()]);

    // A's file is deleted from Drive. C syncs against B alone.
    const c = new Device(DEV_C, T0);
    c.pull([b.snapshot()]);

    expect(c.fingerprint()).toBe(b.fingerprint());
    expect(c.ids('rifles').length).toBeGreaterThan(0);
  });
});
