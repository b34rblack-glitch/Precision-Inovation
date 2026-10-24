import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { getTableColumns } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';

// @/lib/backup reaches the Expo database client; stub the native modules the
// same way backup.test.ts does so BACKUP_SCHEMA_VERSION can be imported.
vi.mock('expo-sqlite', () => ({ openDatabaseSync: vi.fn() }));
vi.mock('drizzle-orm/expo-sqlite', () => ({ drizzle: vi.fn(() => ({})) }));
vi.mock('expo-file-system', () => ({ File: class {}, Paths: { cache: '/tmp' } }));
vi.mock('expo-sharing', () => ({
  isAvailableAsync: vi.fn(async () => false),
  shareAsync: vi.fn(),
}));

import { BACKUP_SCHEMA_VERSION } from '@/lib/backup';
import { solveTrajectory } from '@/lib/ballistics/solver';
import { COLUMNS, DATE_KEYS, TABLE_ORDER, TABLES } from '@/lib/tables';
import { buildWorkspace, IDS } from '../../scripts/workspace-300wm';

// The committed workspace file (docs/range-cards/*.json) must restore into the
// real schema exactly as Settings → Import Backup would do it: every table in
// FK order, foreign keys enforced, dates revived from JSON strings.

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

/** JSON → SQLite value, mirroring what drizzle does for each column mode. */
function toSqlValue(key: string, value: unknown): string | number | null {
  if (value == null) return null;
  if (DATE_KEYS.has(key)) return new Date(value as string).getTime();
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'object') return JSON.stringify(value);
  return value as string | number;
}

function restore(db: DatabaseSync, json: string): Record<string, number> {
  const parsed = JSON.parse(json) as ReturnType<typeof buildWorkspace>;
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

describe('.300 Win Mag workspace import file', () => {
  const workspace = buildWorkspace();
  const json = JSON.stringify(workspace);

  it('is a current-version backup the app will accept', () => {
    expect(workspace.app).toBe('precision-innovation');
    expect(workspace.schemaVersion).toBe(BACKUP_SCHEMA_VERSION);
  });

  it('carries every column of every row, like a real export', () => {
    for (const table of TABLE_ORDER) {
      for (const row of workspace.tables[table] as Record<string, unknown>[]) {
        expect(Object.keys(row).sort()).toEqual([...COLUMNS[table]].sort());
      }
    }
  });

  it('matches the committed docs/range-cards JSON byte for byte', () => {
    const committed = readFileSync(
      path.join(ROOT, 'docs/range-cards/sig-cross-magnum-300wm-workspace.json'),
      'utf8',
    );
    expect(committed).toBe(JSON.stringify(workspace, null, 2) + '\n');
  });

  it('restores into the real schema with foreign keys enforced', () => {
    const db = freshDatabase();
    const counts = restore(db, json);
    expect(counts).toEqual({
      rifles: 1,
      loads: 1,
      loadVersions: 1,
      workups: 0,
      workupSteps: 0,
      rangeSessions: 1,
      shotStrings: 0,
      shots: 0,
      dopeEntries: 1,
      rangeCards: 1,
    });
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);

    const load = db.prepare('SELECT current_version_id AS v FROM loads').get() as { v: string };
    const version = db
      .prepare('SELECT id, muzzle_velocity_fps AS mv, bc_model AS model FROM load_versions WHERE id = ?')
      .get(load.v) as { id: string; mv: number; model: string };
    expect(version).toEqual({ id: IDS.loadVersion, mv: 3030, model: 'G7' });

    const rifle = db
      .prepare('SELECT sight_height_in AS sh, twist_right AS tr, zero_distance AS z FROM rifles')
      .get() as { sh: number; tr: number; z: number };
    expect(rifle).toEqual({ sh: 2.1, tr: 1, z: 100 });

    const dope = db
      .prepare('SELECT distance_yd AS d, elevation_hold AS e, confirmed AS c FROM dope_entries')
      .get() as { d: number; e: number; c: number };
    expect(dope).toEqual({ d: 100, e: 0, c: 1 });
  });

  it('solves to the holds on the published range card', () => {
    const [rifle] = workspace.tables.rifles as [{ sightHeightIn: number; zeroDistance: number }];
    const [v] = workspace.tables.loadVersions as [
      {
        muzzleVelocityFps: number;
        bcValue: number;
        bcModel: 'G1' | 'G7';
        bulletWeightGr: number;
        bulletLengthIn: number;
        bulletDiameterIn: number;
      },
    ];
    const [s] = workspace.tables.rangeSessions as [
      { tempF: number; pressureInHg: number; humidityPct: number },
    ];
    const rows = solveTrajectory({
      mvFps: v.muzzleVelocityFps,
      bc: v.bcValue,
      bcModel: v.bcModel,
      zeroDistanceYd: rifle.zeroDistance,
      sightHeightIn: rifle.sightHeightIn,
      atmo: { tempF: s.tempF, pressureInHg: s.pressureInHg, humidityPct: s.humidityPct },
      windMph: 10,
      maxDistanceYd: 1000,
      stepYd: 100,
      bulletWeightGr: v.bulletWeightGr,
      spin: {
        twistInPerTurn: 9,
        twistRight: true,
        bulletLengthIn: v.bulletLengthIn,
        bulletDiameterIn: v.bulletDiameterIn,
      },
    });
    const mil = (yd: number) => Math.round(rows.find((r) => r.distanceYd === yd)!.dropMil * 10) / 10;
    expect(mil(400)).toBe(1.5);
    expect(mil(600)).toBe(3.1);
    expect(mil(1000)).toBe(7.4);
  });
});
