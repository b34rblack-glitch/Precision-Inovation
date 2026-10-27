import { describe, expect, it } from 'vitest';
import {
  BACKUP_SCHEMA_VERSION,
  describeBackup,
  parseBackup,
  remapIds,
  selectSubset,
  stripDeviceLocal,
  type BackupTables,
  type Row,
} from '@/lib/share';
import { FK_EDGES, TABLE_ORDER } from '@/lib/tables';

// Two rifles, a load that belongs to no rifle, and every child table filled
// in, so the subset walk has something to keep and something to leave behind.
function fixture(): BackupTables {
  const t = '2026-10-04T17:00:00.000Z';
  const base = { createdAt: t, updatedAt: t };
  const tables: BackupTables = {
    rifles: [
      { id: 'rifle-a', name: 'A', photoUri: 'file:///a.jpg', photoSha256: 'abc', archivedAt: null, ...base },
      { id: 'rifle-b', name: 'B', photoUri: null, photoSha256: null, archivedAt: t, ...base },
    ],
    loads: [
      { id: 'load-a1', name: 'A1', rifleId: 'rifle-a', currentVersionId: 'ver-a1-2', archivedAt: null, ...base },
      { id: 'load-b1', name: 'B1', rifleId: 'rifle-b', currentVersionId: 'ver-b1', archivedAt: null, ...base },
      { id: 'load-x', name: 'X', rifleId: null, currentVersionId: 'ver-x', archivedAt: null, ...base },
    ],
    loadVersions: [
      { id: 'ver-a1-1', loadId: 'load-a1', versionNumber: 1, parentVersionId: null, ...base },
      { id: 'ver-a1-2', loadId: 'load-a1', versionNumber: 2, parentVersionId: 'ver-a1-1', ...base },
      { id: 'ver-b1', loadId: 'load-b1', versionNumber: 1, parentVersionId: null, ...base },
      { id: 'ver-x', loadId: 'load-x', versionNumber: 1, parentVersionId: null, ...base },
    ],
    workups: [
      // Rifle A's own workup.
      { id: 'wk-a', rifleId: 'rifle-a', loadId: 'load-a1', baseVersionId: 'ver-a1-1', resultLoadVersionId: 'ver-a1-2', type: 'ladder', status: 'complete', archivedAt: null, ...base },
      // Fired through rifle A with rifle B's load: cannot survive a rifle-A-only share.
      { id: 'wk-cross', rifleId: 'rifle-a', loadId: 'load-b1', baseVersionId: null, resultLoadVersionId: null, type: 'velocity', status: 'planned', archivedAt: null, ...base },
    ],
    workupSteps: [
      { id: 'step-a', workupId: 'wk-a', seq: 1, chargeGr: 70, ...base },
      { id: 'step-cross', workupId: 'wk-cross', seq: 1, chargeGr: 70, ...base },
    ],
    rangeSessions: [
      { id: 'sess-a', rifleId: 'rifle-a', loadVersionId: 'ver-a1-2', date: t, targetPhotoUri: 'file:///t.jpg', targetPhotoSha256: 'def', archivedAt: null, ...base },
      // Rifle A session shot with the unattached load: kept, load reference blanked.
      { id: 'sess-a-x', rifleId: 'rifle-a', loadVersionId: 'ver-x', date: t, targetPhotoUri: null, targetPhotoSha256: null, archivedAt: null, ...base },
      { id: 'sess-b', rifleId: 'rifle-b', loadVersionId: 'ver-b1', date: t, targetPhotoUri: null, targetPhotoSha256: null, archivedAt: null, ...base },
    ],
    shotStrings: [
      { id: 'str-step', workupStepId: 'step-a', sessionId: null, source: 'manual', ...base },
      { id: 'str-sess', workupStepId: null, sessionId: 'sess-a', source: 'manual', ...base },
      { id: 'str-b', workupStepId: null, sessionId: 'sess-b', source: 'manual', ...base },
    ],
    shots: [
      { id: 'shot-1', stringId: 'str-step', seq: 1, velocityFps: 2800, ...base },
      { id: 'shot-2', stringId: 'str-sess', seq: 1, velocityFps: 2810, ...base },
      { id: 'shot-b', stringId: 'str-b', seq: 1, velocityFps: 2700, ...base },
    ],
    dopeEntries: [
      { id: 'dope-a', sessionId: 'sess-a', distanceYd: 100, confirmed: true, ...base },
      { id: 'dope-b', sessionId: 'sess-b', distanceYd: 100, confirmed: true, ...base },
    ],
    rangeCards: [
      { id: 'card-a', rifleId: 'rifle-a', loadVersionId: 'ver-a1-2', preset: 'bench', archivedAt: null, ...base },
      // Rifle A card built on the unattached load: NOT NULL key outside the subset, dropped.
      { id: 'card-a-x', rifleId: 'rifle-a', loadVersionId: 'ver-x', preset: 'bench', archivedAt: null, ...base },
      { id: 'card-b', rifleId: 'rifle-b', loadVersionId: 'ver-b1', preset: 'bench', archivedAt: null, ...base },
    ],
  };
  return tables;
}

const ids = (rows: Row[]) => rows.map((r) => r.id).sort();

/** Every foreign key in `tables` must point at a row that is in `tables`. */
function expectIntegrity(tables: BackupTables): void {
  const present = Object.fromEntries(
    TABLE_ORDER.map((t) => [t, new Set(tables[t].map((r) => String(r.id)))]),
  ) as Record<string, Set<string>>;
  for (const edge of FK_EDGES) {
    for (const row of tables[edge.tbl]) {
      const v = row[edge.col];
      if (v == null) continue;
      expect(present[edge.parent]!.has(String(v)), `${edge.tbl}.${edge.col} -> ${String(v)}`).toBe(true);
    }
  }
  for (const load of tables.loads) {
    if (load.currentVersionId != null) expect(present.loadVersions!.has(String(load.currentVersionId))).toBe(true);
  }
}

describe('selectSubset', () => {
  it('keeps one rifle with everything that belongs to it, and nothing else', () => {
    const sub = selectSubset(fixture(), { rifleIds: ['rifle-a'], includeUnattachedLoads: false });
    expect(ids(sub.rifles)).toEqual(['rifle-a']);
    expect(ids(sub.loads)).toEqual(['load-a1']);
    expect(ids(sub.loadVersions)).toEqual(['ver-a1-1', 'ver-a1-2']);
    expect(ids(sub.workups)).toEqual(['wk-a']); // wk-cross needs rifle B's load
    expect(ids(sub.workupSteps)).toEqual(['step-a']);
    expect(ids(sub.rangeSessions)).toEqual(['sess-a', 'sess-a-x']);
    expect(ids(sub.shotStrings)).toEqual(['str-sess', 'str-step']);
    expect(ids(sub.shots)).toEqual(['shot-1', 'shot-2']);
    expect(ids(sub.dopeEntries)).toEqual(['dope-a']);
    expect(ids(sub.rangeCards)).toEqual(['card-a']); // card-a-x points at an excluded version
    expectIntegrity(sub);
  });

  it('blanks a nullable reference that points outside the subset', () => {
    const sub = selectSubset(fixture(), { rifleIds: ['rifle-a'], includeUnattachedLoads: false });
    const session = sub.rangeSessions.find((s) => s.id === 'sess-a-x')!;
    expect(session.loadVersionId).toBeNull();
  });

  it('can take the loads assigned to no rifle, which pulls their dependants back in', () => {
    const sub = selectSubset(fixture(), { rifleIds: ['rifle-a'], includeUnattachedLoads: true });
    expect(ids(sub.loads)).toEqual(['load-a1', 'load-x']);
    expect(ids(sub.loadVersions)).toEqual(['ver-a1-1', 'ver-a1-2', 'ver-x']);
    expect(ids(sub.rangeCards)).toEqual(['card-a', 'card-a-x']);
    expect(sub.rangeSessions.find((s) => s.id === 'sess-a-x')!.loadVersionId).toBe('ver-x');
    expectIntegrity(sub);
  });

  it('selects several rifles at once', () => {
    const sub = selectSubset(fixture(), { rifleIds: ['rifle-a', 'rifle-b'], includeUnattachedLoads: false });
    expect(ids(sub.rifles)).toEqual(['rifle-a', 'rifle-b']);
    expect(ids(sub.workups)).toEqual(['wk-a', 'wk-cross']);
    expect(ids(sub.rangeCards)).toEqual(['card-a', 'card-b']);
    expectIntegrity(sub);
  });

  it('returns empty tables for an unknown rifle', () => {
    const sub = selectSubset(fixture(), { rifleIds: ['nope'], includeUnattachedLoads: false });
    for (const t of TABLE_ORDER) expect(sub[t]).toEqual([]);
  });

  it('does not mutate its input', () => {
    const tables = fixture();
    const snapshot = JSON.stringify(tables);
    selectSubset(tables, { rifleIds: ['rifle-a'], includeUnattachedLoads: false });
    expect(JSON.stringify(tables)).toBe(snapshot);
  });
});

describe('remapIds', () => {
  const sub = () => selectSubset(fixture(), { rifleIds: ['rifle-a'], includeUnattachedLoads: false });
  let n = 0;
  const newId = () => `new-${++n}`;

  it('gives every row a fresh, unique id and rewrites every reference', () => {
    const out = remapIds(sub(), newId);
    const all = TABLE_ORDER.flatMap((t) => out[t].map((r) => String(r.id)));
    expect(new Set(all).size).toBe(all.length);
    for (const id of all) expect(id).toMatch(/^new-\d+$/);
    expectIntegrity(out);

    const load = out.loads[0]!;
    const versions = out.loadVersions;
    expect(versions.map((v) => v.id)).toContain(load.currentVersionId);
    const v2 = versions.find((v) => v.versionNumber === 2)!;
    const v1 = versions.find((v) => v.versionNumber === 1)!;
    expect(v2.parentVersionId).toBe(v1.id);
    expect(v1.parentVersionId).toBeNull();
    const workup = out.workups[0]!;
    expect(workup.baseVersionId).toBe(v1.id);
    expect(workup.resultLoadVersionId).toBe(v2.id);
  });

  it('is different every time, so the same file can be added twice without a collision', () => {
    const a = remapIds(sub(), newId);
    const b = remapIds(sub(), newId);
    const idsOf = (t: BackupTables) => new Set(TABLE_ORDER.flatMap((n) => t[n].map((r) => String(r.id))));
    for (const id of idsOf(a)) expect(idsOf(b).has(id)).toBe(false);
  });

  it('drops photo references and stamps updatedAt', () => {
    const now = new Date('2026-10-27T00:00:00Z');
    const out = remapIds(sub(), newId, now);
    expect(out.rifles[0]!.photoUri).toBeNull();
    expect(out.rifles[0]!.photoSha256).toBeNull();
    // Order is preserved, so the first session is sess-a, the one with a target photo.
    expect(out.rangeSessions[0]!.targetPhotoUri).toBeNull();
    expect(out.rangeSessions[0]!.targetPhotoSha256).toBeNull();
    for (const t of TABLE_ORDER) for (const row of out[t]) expect(row.updatedAt).toBe(now);
    // createdAt and the session date are history and stay.
    expect(out.rifles[0]!.createdAt).toBe('2026-10-04T17:00:00.000Z');
    expect(out.rangeSessions[0]!.date).toBe('2026-10-04T17:00:00.000Z');
  });

  it('blanks a soft reference whose target is not in the file', () => {
    const tables = sub();
    tables.loads[0]!.currentVersionId = 'ver-elsewhere';
    const out = remapIds(tables, newId);
    expect(out.loads[0]!.currentVersionId).toBeNull();
  });
});

describe('stripDeviceLocal', () => {
  it('blanks only photo paths and hashes, leaving other rows untouched by reference', () => {
    const tables = fixture();
    const out = stripDeviceLocal(tables);
    expect(out.rifles[0]!.photoUri).toBeNull();
    expect(out.rifles[1]).toBe(tables.rifles[1]); // nothing to strip: same object
    expect(out.loads[0]).toBe(tables.loads[0]);
  });
});

describe('describeBackup', () => {
  it('counts loads and sessions per rifle and the loads with no rifle', () => {
    const summary = describeBackup(fixture(), { rifleNames: ['A', 'B'] });
    expect(summary.rifles).toEqual([
      { id: 'rifle-a', name: 'A', archived: false, loads: 1, sessions: 2 },
      { id: 'rifle-b', name: 'B', archived: true, loads: 1, sessions: 1 },
    ]);
    expect(summary.unattachedLoads).toBe(1);
    expect(summary.share).toEqual({ rifleNames: ['A', 'B'] });
  });
});

describe('parseBackup', () => {
  const good = () =>
    JSON.stringify({ schemaVersion: BACKUP_SCHEMA_VERSION, exportedAt: 'x', app: 'precision-innovation', tables: { rifles: [{ id: 'r' }] } });

  it('accepts a current file and fills in missing tables', () => {
    const parsed = parseBackup(good());
    expect(parsed.tables.rifles).toEqual([{ id: 'r' }]);
    for (const t of TABLE_ORDER) expect(Array.isArray(parsed.tables[t])).toBe(true);
    expect(parsed.share).toBeUndefined();
  });

  it('rejects a file from another app', () => {
    expect(() => parseBackup(JSON.stringify({ app: 'other', tables: {} }))).toThrow(
      'Not a Precision Innovation backup file.',
    );
  });

  it('rejects a file from a newer app', () => {
    expect(() =>
      parseBackup(JSON.stringify({ app: 'precision-innovation', schemaVersion: BACKUP_SCHEMA_VERSION + 1, tables: {} })),
    ).toThrow('Backup was made by a newer app version — update the app first.');
  });

  it('keeps share metadata when present', () => {
    const parsed = parseBackup(JSON.stringify({ ...JSON.parse(good()), share: { rifleNames: ['A'] } }));
    expect(parsed.share).toEqual({ rifleNames: ['A'] });
  });
});
