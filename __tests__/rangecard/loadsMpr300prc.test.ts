import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { getTableColumns } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';

// @/lib/backup reaches the Expo database client; stub the native modules the
// same way workspacePhoenix.test.ts does so BACKUP_SCHEMA_VERSION can be imported.
vi.mock('expo-sqlite', () => ({ openDatabaseSync: vi.fn() }));
vi.mock('drizzle-orm/expo-sqlite', () => ({ drizzle: vi.fn(() => ({})) }));
vi.mock('expo-file-system', () => ({ File: class {}, Paths: { cache: '/tmp' } }));
vi.mock('expo-sharing', () => ({
  isAvailableAsync: vi.fn(async () => false),
  shareAsync: vi.fn(),
}));

import { BACKUP_SCHEMA_VERSION } from '@/lib/backup';
import { describeBackup, remapIds, selectSubset } from '@/lib/share';
import { COLUMNS, DATE_KEYS, TABLE_ORDER, TABLES } from '@/lib/tables';
import { buildLoads, BULLETS, pickTouch, seatingCbtoIn } from '../../scripts/loads-mpr-300prc';
import { buildWorkspace, IDS } from '../../scripts/workspace-phoenix';

// The committed file (docs/range-cards/mpr-300prc-handloads.json) must add
// into an app that already holds the MPR exactly as Settings → Add from Backup
// does it: unattached loads only, fresh ids, foreign keys enforced.

const ROOT = path.resolve(__dirname, '../..');

function freshDatabase(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  const dir = path.join(ROOT, 'drizzle');
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of files) {
    const sql = readFileSync(path.join(dir, file), 'utf8');
    for (const statement of sql.split('--> statement-breakpoint')) {
      if (statement.trim()) db.exec(statement);
    }
  }
  return db;
}

function toSqlValue(key: string, value: unknown): string | number | null {
  if (value == null) return null;
  if (DATE_KEYS.has(key)) return new Date(value as string).getTime();
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'object') return JSON.stringify(value);
  return value as string | number;
}

function restore(db: DatabaseSync, json: string): Record<string, number> {
  const parsed = JSON.parse(json) as ReturnType<typeof buildLoads>;
  const counts: Record<string, number> = {};
  for (const table of TABLE_ORDER) {
    const rows = (parsed.tables[table] ?? []) as Record<string, unknown>[];
    counts[table] = rows.length;
    const columns = getTableColumns(TABLES[table] as never) as Record<string, { name: string }>;
    const sqlTable = (TABLES[table] as unknown as { [k: symbol]: string })[
      Object.getOwnPropertySymbols(TABLES[table]).find((s) => s.description === 'drizzle:Name')!
    ];
    for (const row of rows) {
      const keys = Object.keys(row);
      const stmt = db.prepare(
        `INSERT INTO "${sqlTable}" (${keys.map((k) => `"${columns[k]!.name}"`).join(', ')}) VALUES (${keys
          .map(() => '?')
          .join(', ')})`,
      );
      stmt.run(...keys.map((k) => toSqlValue(k, row[k])));
    }
  }
  return counts;
}

describe('touch-the-lands pick', () => {
  it('takes the most common reading when one repeats', () => {
    expect(pickTouch([2.931, 2.939, 2.931])).toEqual({ value: 2.931, rule: 'most common' });
    expect(pickTouch([2.934, 2.948, 2.949, 2.949])).toEqual({ value: 2.949, rule: 'most common' });
  });

  it('falls back to the mean, to 0.001 in, when nothing repeats', () => {
    expect(pickTouch([2.986, 2.983])).toEqual({ value: 2.985, rule: 'mean' });
    expect(pickTouch([2.94, 2.95, 2.94, 2.95])).toEqual({ value: 2.945, rule: 'mean' });
  });
});

describe('MPR .300 PRC handload import file', () => {
  const file = buildLoads();
  const json = JSON.stringify(file);

  it('is a current-version backup the app will accept', () => {
    expect(file.app).toBe('precision-innovation');
    expect(file.schemaVersion).toBe(BACKUP_SCHEMA_VERSION);
  });

  it('carries every column of every row, like a real export', () => {
    for (const table of TABLE_ORDER) {
      for (const row of file.tables[table] as Record<string, unknown>[]) {
        expect(Object.keys(row).sort()).toEqual([...COLUMNS[table]].sort());
      }
    }
  });

  it('uses distinct ids everywhere, none shared with the phoenix workspace', () => {
    const ids = TABLE_ORDER.flatMap((t) => (file.tables[t] as { id: string }[]).map((r) => r.id));
    expect(new Set(ids).size).toBe(ids.length);
    const phoenix = buildWorkspace();
    const taken = new Set(TABLE_ORDER.flatMap((t) => (phoenix.tables[t] as { id: string }[]).map((r) => r.id)));
    for (const id of ids) expect(taken.has(id)).toBe(false);
  });

  it('matches the committed docs/range-cards JSON byte for byte', () => {
    const committed = readFileSync(path.join(ROOT, 'docs/range-cards/mpr-300prc-handloads.json'), 'utf8');
    expect(committed).toBe(JSON.stringify(file, null, 2) + '\n');
  });

  it('holds one unattached .300 PRC load per bullet, seated off the measured touch length', () => {
    expect(file.tables.rifles).toEqual([]);
    expect(file.tables.loads).toHaveLength(BULLETS.length);
    for (const [i, b] of BULLETS.entries()) {
      const load = file.tables.loads[i]!;
      const version = file.tables.loadVersions[i]!;
      expect(load.rifleId).toBeNull();
      expect(load.cartridge).toBe('.300 PRC');
      expect(load.currentVersionId).toBe(version.id);
      expect(version.loadId).toBe(load.id);
      expect(version.bulletWeightGr).toBe(b.bulletWeightGr);
      expect(version.jumpToLandsIn).toBe(b.startJumpIn);
      expect(version.cbtoIn).toBe(seatingCbtoIn(b));
      expect((version.cbtoIn as number) + (version.jumpToLandsIn as number)).toBeCloseTo(b.touchCbtoIn, 3);
      // Nothing is loaded yet: the workup fills these in.
      expect(version.powderName).toBeNull();
      expect(version.chargeGr).toBeNull();
      expect(version.muzzleVelocityFps).toBeNull();
    }
    const byName = Object.fromEntries(file.tables.loadVersions.map((v) => [v.bulletModel, v.cbtoIn]));
    expect(byName).toEqual({
      'ELD-X': 2.911,
      'LRX BT': 2.89,
      'Elite Hunter': 2.929,
      'AccuBond Long Range': 2.929,
      'Hammer Hunter': 2.935,
    });
  });

  it('shows up in the Add from Backup sheet as unassigned loads', () => {
    expect(describeBackup(file.tables, file.share)).toEqual({ rifles: [], unattachedLoads: 5, share: null });
  });

  it('adds next to the phoenix workspace with fresh ids and foreign keys enforced', () => {
    const db = freshDatabase();
    restore(db, JSON.stringify(buildWorkspace()));

    // Unticked: the file contributes nothing.
    const nothing = selectSubset(file.tables, { rifleIds: [], includeUnattachedLoads: false });
    expect(nothing.loads).toEqual([]);

    const picked = selectSubset(file.tables, { rifleIds: [], includeUnattachedLoads: true });
    let n = 0;
    const added = remapIds(picked, () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`, new Date());
    const counts = restore(db, JSON.stringify({ ...file, tables: added }));
    expect(counts).toMatchObject({ rifles: 0, loads: 5, loadVersions: 5 });
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    expect(db.prepare('SELECT count(*) AS c FROM loads').get()).toEqual({ c: 7 });
    expect(db.prepare('SELECT count(*) AS c FROM rifles').get()).toEqual({ c: 2 });

    // Assigning a load to the MPR is what the user does next; the FK allows it.
    db.prepare('UPDATE loads SET rifle_id = ? WHERE rifle_id IS NULL').run(IDS.mpr.rifle);
    expect(db.prepare('SELECT count(*) AS c FROM loads WHERE rifle_id = ?').get(IDS.mpr.rifle)).toEqual({ c: 6 });
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  });
});
