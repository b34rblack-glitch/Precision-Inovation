import { describe, expect, it } from 'vitest';
import { TABLE_ORDER, type TableName } from '@/lib/tables';
import { createDriveClient, ROOT_FOLDER_NAME } from '@/sync/drive';
import { formatHlc, receive, tick, type Hlc, type HlcTick } from '@/sync/hlc';
import { MIGRATION_TAG, SYNC_PROTOCOL, TABLE_SCHEMA_VERSION } from '@/sync/protocol';
import { syncOnce, type SyncStateValues, type SyncStore } from '@/sync/syncOnce';
import type { MintedTombstone, Operation, Snapshot, StampedRow, Tombstone } from '@/sync/types';
import { FakeDrive, noSleep } from './fakeDrive';
import { DEV_A, DEV_B, DEV_C, row, T0 } from './helpers';

// End-to-end sync against an in-memory Drive.
//
// This is the closest thing to the real thing that can run without a Google
// account: the real syncOnce, the real merge engine, the real Drive client,
// and the real wire format. What is faked is HTTP and the local database.

class MemoryStore implements SyncStore {
  clock: HlcTick = { ms: T0, counter: 0 };
  rows = new Map<TableName, Map<string, StampedRow>>();
  tombs = new Map<string, Hlc>();
  backups = 0;
  state: SyncStateValues & Record<string, unknown>;

  constructor(
    readonly deviceId: string,
    public wall = T0,
  ) {
    for (const t of TABLE_ORDER) this.rows.set(t, new Map());
    this.state = {
      deviceId,
      deviceName: `Device ${deviceId.slice(0, 4)}`,
      platform: 'test',
      rootFolderId: null,
      devicesFolderId: null,
      blobsFolderId: null,
      myFileId: null,
      peerCacheJson: null,
    };
  }

  private stamp(): Hlc {
    this.clock = tick(this.clock, this.wall);
    return formatHlc(this.clock.ms, this.clock.counter, this.deviceId);
  }

  /** A local edit, as the write funnel would perform it. */
  write(tbl: TableName, id: string, fields: Record<string, unknown> = {}): void {
    const hlc = this.stamp();
    const existing = this.rows.get(tbl)!.get(id);
    this.rows.get(tbl)!.set(id, {
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

  has(tbl: TableName, id: string): boolean {
    return this.rows.get(tbl)!.has(id);
  }

  get(tbl: TableName, id: string): StampedRow | undefined {
    return this.rows.get(tbl)!.get(id);
  }

  async readState(): Promise<SyncStateValues> {
    return { ...this.state };
  }

  async writeState(patch: Partial<SyncStateValues> & Record<string, unknown>): Promise<void> {
    this.state = { ...this.state, ...patch };
  }

  async readSnapshot(): Promise<Snapshot> {
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
      device: { id: this.deviceId, name: this.state.deviceName, platform: 'test' },
      publishedAt: new Date(this.wall).toISOString(),
      hlc: formatHlc(this.clock.ms, this.clock.counter, this.deviceId),
      rows,
      tombstones,
    };
  }

  async applyOps(ops: readonly Operation[]): Promise<void> {
    for (const op of ops) {
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
  }

  async mintTombstones(list: readonly MintedTombstone[]): Promise<void> {
    for (const t of list) {
      this.rows.get(t.tbl)!.delete(t.id);
      this.tombs.set(`${t.tbl} ${t.id}`, this.stamp());
    }
  }

  async observeRemote(hlc: Hlc): Promise<void> {
    this.clock = receive(this.clock, hlc, this.wall);
  }

  async backupBeforeApply(): Promise<void> {
    this.backups += 1;
  }

  fingerprint(): string {
    const parts: string[] = [];
    for (const t of TABLE_ORDER) {
      for (const r of [...this.rows.get(t)!.values()].sort((a, b) => (a.id < b.id ? -1 : 1))) {
        parts.push(`${t}/${r.id}`);
      }
    }
    return parts.join(',');
  }
}

function deviceOn(fake: FakeDrive, id: string, wall = T0) {
  const store = new MemoryStore(id, wall);
  const drive = createDriveClient({
    fetchImpl: fake.fetch,
    getAccessToken: async () => fake.validToken,
    sleep: noSleep,
  });
  return { store, sync: () => syncOnce({ store, drive }) };
}

describe('first sync on a fresh Google account', () => {
  it('creates the folder the user will actually see, and explains itself', async () => {
    const fake = new FakeDrive();
    const a = deviceOn(fake, DEV_A);
    a.store.write('rifles', 'r1', { name: 'Tikka T3x' });

    const report = await a.sync();

    expect(fake.byName(ROOT_FOLDER_NAME)).toBeTruthy();
    expect(fake.byName('devices')).toBeTruthy();
    expect(fake.byName('README.txt')?.content).toContain('Precision Innovation');
    expect(fake.byName(`${DEV_A}.json`)).toBeTruthy();
    expect(report.published).toBe(true);
    expect(report.peers).toBe(0);
  });

  it('caches the folder ids, because Drive listings are eventually consistent', async () => {
    const fake = new FakeDrive();
    const a = deviceOn(fake, DEV_A);
    await a.sync();

    const state = await a.store.readState();
    expect(state.rootFolderId).toBeTruthy();
    expect(state.devicesFolderId).toBeTruthy();
    expect(state.myFileId).toBeTruthy();

    // A second sync must not create a second folder.
    await a.sync();
    const folders = [...fake.nodes.values()].filter((n) => n.name === ROOT_FOLDER_NAME);
    expect(folders).toHaveLength(1);
  });

  it('does not write a safety backup when nothing changed', async () => {
    const fake = new FakeDrive();
    const a = deviceOn(fake, DEV_A);
    await a.sync();
    const after = a.store.backups;

    await a.sync();
    expect(a.store.backups).toBe(after);
  });
});

describe('a second device', () => {
  it('pulls the whole dataset into an empty database', async () => {
    const fake = new FakeDrive();
    const a = deviceOn(fake, DEV_A);
    a.store.write('rifles', 'r1', { name: 'Tikka T3x' });
    a.store.write('loads', 'l1', { rifleId: 'r1', currentVersionId: 'v1' });
    a.store.write('loadVersions', 'v1', { loadId: 'l1', versionNumber: 1 });
    await a.sync();

    const b = deviceOn(fake, DEV_B);
    const report = await b.sync();

    expect(report.peers).toBe(1);
    expect(b.store.fingerprint()).toBe(a.store.fingerprint());
    expect(b.store.backups).toBe(1);
  });

  it('publishes its own file even with nothing of its own to contribute', async () => {
    const fake = new FakeDrive();
    const a = deviceOn(fake, DEV_A);
    a.store.write('rifles', 'r1');
    await a.sync();

    const b = deviceOn(fake, DEV_B);
    await b.sync();

    expect(fake.byName(`${DEV_B}.json`)).toBeTruthy();
  });

  it('publishes what it knows after merging, not before', async () => {
    // B's file must contain A's rifle: otherwise a third device syncing only
    // against B would not see it.
    const fake = new FakeDrive();
    const a = deviceOn(fake, DEV_A);
    a.store.write('rifles', 'r1', { name: 'Tikka T3x' });
    await a.sync();

    const b = deviceOn(fake, DEV_B);
    await b.sync();

    expect(fake.byName(`${DEV_B}.json`)!.content).toContain('r1');
  });
});

describe('the case this feature exists for', () => {
  it('keeps both devices’ work when each edited offline', async () => {
    const fake = new FakeDrive();
    const a = deviceOn(fake, DEV_A);
    const b = deviceOn(fake, DEV_B, T0 - 60_000); // B's clock runs a minute slow

    a.store.write('rifles', 'r1', { name: 'Tikka T3x' });
    a.store.write('loads', 'l1', { rifleId: 'r1', currentVersionId: 'v1' });
    a.store.write('loadVersions', 'v1', { loadId: 'l1', versionNumber: 1 });
    await a.sync();
    await b.sync();

    // Now both go offline. Phone logs DOPE; desktop edits the recipe.
    a.store.write('rangeSessions', 's1', { rifleId: 'r1', loadVersionId: 'v1' });
    a.store.write('dopeEntries', 'd1', { sessionId: 's1', distanceYd: 600 });
    b.store.write('loadVersions', 'v1', { loadId: 'l1', versionNumber: 1, chargeGr: 41.8 });

    await a.sync();
    await b.sync();
    await a.sync();

    // The desktop's recipe edit survived...
    expect(a.store.get('loadVersions', 'v1')?.chargeGr).toBe(41.8);
    expect(b.store.get('loadVersions', 'v1')?.chargeGr).toBe(41.8);
    // ...and so did the phone's range data.
    expect(b.store.has('dopeEntries', 'd1')).toBe(true);
    expect(a.store.has('dopeEntries', 'd1')).toBe(true);
  });

  it('a deleted row does not come back', async () => {
    const fake = new FakeDrive();
    const a = deviceOn(fake, DEV_A);
    const b = deviceOn(fake, DEV_B);

    a.store.write('rifles', 'r1');
    a.store.write('rangeSessions', 's1', { rifleId: 'r1' });
    a.store.write('dopeEntries', 'd1', { sessionId: 's1' });
    await a.sync();
    await b.sync();
    expect(b.store.has('dopeEntries', 'd1')).toBe(true);

    a.store.remove('dopeEntries', 'd1');
    await a.sync();
    await b.sync();

    expect(b.store.has('dopeEntries', 'd1')).toBe(false);

    // And it stays gone on the next round, from either direction.
    await a.sync();
    await b.sync();
    expect(a.store.has('dopeEntries', 'd1')).toBe(false);
    expect(b.store.has('dopeEntries', 'd1')).toBe(false);
  });

  it('three devices reach the same state', async () => {
    const fake = new FakeDrive();
    const a = deviceOn(fake, DEV_A);
    const b = deviceOn(fake, DEV_B, T0 - 90_000);
    const c = deviceOn(fake, DEV_C, T0 + 300_000);

    a.store.write('rifles', 'r1');
    b.store.write('rifles', 'r2');
    c.store.write('rifles', 'r3');

    for (const d of [a, b, c]) await d.sync();
    for (const d of [a, b, c]) await d.sync();

    expect(b.store.fingerprint()).toBe(a.store.fingerprint());
    expect(c.store.fingerprint()).toBe(a.store.fingerprint());
    expect(a.store.fingerprint()).toContain('rifles/r3');
  });
});

describe('recovering from things going wrong', () => {
  it('skips an unreadable peer file and merges the rest', async () => {
    const fake = new FakeDrive();
    const a = deviceOn(fake, DEV_A);
    a.store.write('rifles', 'r1');
    await a.sync();

    const devices = fake.byName('devices')!;
    fake.put(`${DEV_C}.json`, devices.id, 'this is not json at all');

    const b = deviceOn(fake, DEV_B);
    const report = await b.sync();

    expect(b.store.has('rifles', 'r1')).toBe(true);
    expect(report.peersSkipped).toBeGreaterThan(0);
    expect(report.warnings.some((w) => w.code === 'peer-skipped')).toBe(true);
  });

  it('recreates this device’s file if it was deleted from Drive', async () => {
    const fake = new FakeDrive();
    const a = deviceOn(fake, DEV_A);
    a.store.write('rifles', 'r1');
    await a.sync();

    const mine = fake.byName(`${DEV_A}.json`)!;
    fake.nodes.delete(mine.id);

    const report = await a.sync();
    expect(report.published).toBe(true);
    expect(fake.byName(`${DEV_A}.json`)).toBeTruthy();
  });

  it('rebuilds a device whose local database was wiped', async () => {
    const fake = new FakeDrive();
    const a = deviceOn(fake, DEV_A);
    a.store.write('rifles', 'r1', { name: 'Tikka T3x' });
    a.store.write('loads', 'l1', { rifleId: 'r1', currentVersionId: 'v1' });
    a.store.write('loadVersions', 'v1', { loadId: 'l1', versionNumber: 1 });
    await a.sync();

    const b = deviceOn(fake, DEV_B);
    await b.sync();

    // A is reinstalled: same Drive account, brand new device id and empty data.
    const reinstalled = deviceOn(fake, 'dddddddd-dddd-4ddd-8ddd-dddddddddddd');
    await reinstalled.sync();

    expect(reinstalled.store.has('rifles', 'r1')).toBe(true);
    expect(reinstalled.store.has('loadVersions', 'v1')).toBe(true);
  });

  it('losing one device’s file loses nothing the others still hold', async () => {
    // Every device publishes its complete view, which is what makes this true.
    const fake = new FakeDrive();
    const a = deviceOn(fake, DEV_A);
    a.store.write('rifles', 'r1');
    await a.sync();

    const b = deviceOn(fake, DEV_B);
    await b.sync();

    fake.nodes.delete(fake.byName(`${DEV_A}.json`)!.id);

    const c = deviceOn(fake, DEV_C);
    await c.sync();
    expect(c.store.has('rifles', 'r1')).toBe(true);
  });
});

describe('bandwidth', () => {
  it('does not re-download a peer whose checksum has not changed', async () => {
    const fake = new FakeDrive();
    const a = deviceOn(fake, DEV_A);
    a.store.write('rifles', 'r1');
    await a.sync();

    const b = deviceOn(fake, DEV_B);
    const first = await b.sync();
    expect(first.pulled).toBe(1);

    const second = await b.sync();
    expect(second.pulled).toBe(0);
    expect(b.store.has('rifles', 'r1')).toBe(true);
  });

  it('does re-download once the peer actually changes', async () => {
    const fake = new FakeDrive();
    const a = deviceOn(fake, DEV_A);
    a.store.write('rifles', 'r1');
    await a.sync();

    const b = deviceOn(fake, DEV_B);
    await b.sync();
    await b.sync();

    a.store.write('rifles', 'r2');
    await a.sync();

    const report = await b.sync();
    expect(report.pulled).toBe(1);
    expect(b.store.has('rifles', 'r2')).toBe(true);
  });

  it('never downloads its own file', async () => {
    const fake = new FakeDrive();
    const a = deviceOn(fake, DEV_A);
    a.store.write('rifles', 'r1');
    await a.sync();
    fake.calls.length = 0;

    await a.sync();
    const myFileId = fake.byName(`${DEV_A}.json`)!.id;
    const downloadedSelf = fake.calls.some(
      (c) => c.method === 'GET' && c.url.includes(myFileId) && c.url.includes('alt=media'),
    );
    expect(downloadedSelf).toBe(false);
  });
});
