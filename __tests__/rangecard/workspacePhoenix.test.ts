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
import { parseTwistRate } from '@/lib/units';
import { buildWorkspace, CROSS, IDS, MPR, ZERO_DATE, ZERO_RANGE } from '../../scripts/workspace-phoenix';

// The committed workspace file (docs/range-cards/phoenix-workspace.json) must
// restore into the real schema exactly as Settings → Import Backup would do
// it: every table in FK order, foreign keys enforced, dates revived from JSON.

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

describe('Phoenix workspace import file', () => {
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

  it('uses distinct ids everywhere', () => {
    const ids = TABLE_ORDER.flatMap((t) =>
      (workspace.tables[t] as { id: string }[]).map((r) => r.id),
    );
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('matches the committed docs/range-cards JSON byte for byte', () => {
    const committed = readFileSync(path.join(ROOT, 'docs/range-cards/phoenix-workspace.json'), 'utf8');
    expect(committed).toBe(JSON.stringify(workspace, null, 2) + '\n');
  });

  it('restores into the real schema with foreign keys enforced', () => {
    const db = freshDatabase();
    const counts = restore(db, json);
    expect(counts).toEqual({
      rifles: 2,
      loads: 2,
      loadVersions: 2,
      workups: 0,
      workupSteps: 0,
      rangeSessions: 2,
      shotStrings: 0,
      shots: 0,
      dopeEntries: 2,
      rangeCards: 2,
    });
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);

    for (const [spec, mv, unit] of [
      [CROSS, 3030, 'MIL'],
      [MPR, 2860, 'MOA'],
    ] as const) {
      const load = db
        .prepare('SELECT current_version_id AS v FROM loads WHERE rifle_id = ?')
        .get(spec.ids.rifle) as { v: string };
      const version = db
        .prepare('SELECT id, muzzle_velocity_fps AS mv, bc_model AS model FROM load_versions WHERE id = ?')
        .get(load.v) as { id: string; mv: number; model: string };
      expect(version).toEqual({ id: spec.ids.loadVersion, mv, model: 'G7' });

      const rifle = db
        .prepare('SELECT turret_unit AS u, twist_right AS tr, zero_distance AS z FROM rifles WHERE id = ?')
        .get(spec.ids.rifle) as { u: string; tr: number; z: number };
      expect(rifle).toEqual({ u: unit, tr: 1, z: 100 });

      const session = db
        .prepare('SELECT date AS d, location AS l, temp_f AS t FROM range_sessions WHERE id = ?')
        .get(spec.ids.session) as { d: number; l: string; t: number };
      expect(session).toEqual({ d: ZERO_DATE.getTime(), l: ZERO_RANGE.location, t: ZERO_RANGE.tempF });

      const dope = db
        .prepare('SELECT distance_yd AS d, elevation_hold AS e, hold_unit AS u, confirmed AS c FROM dope_entries WHERE session_id = ?')
        .get(spec.ids.session) as { d: number; e: number; u: string; c: number };
      expect(dope).toEqual({ d: 100, e: 0, u: unit, c: 1 });
    }
    expect(IDS.cross.rifle).not.toBe(IDS.mpr.rifle);
  });

  it('solves to the holds on the published range cards', () => {
    const holdsAt = (spec: typeof CROSS) => {
      const rows = solveTrajectory({
        mvFps: spec.version.muzzleVelocityFps!,
        bc: spec.version.bcValue!,
        bcModel: spec.version.bcModel!,
        zeroDistanceYd: spec.rifle.zeroDistance,
        sightHeightIn: spec.rifle.sightHeightIn,
        atmo: {
          tempF: ZERO_RANGE.tempF,
          pressureInHg: ZERO_RANGE.pressureInHg,
          humidityPct: ZERO_RANGE.humidityPct,
        },
        windMph: 10,
        maxDistanceYd: 1000,
        stepYd: 100,
        bulletWeightGr: spec.version.bulletWeightGr,
        spin: {
          twistInPerTurn: parseTwistRate(spec.rifle.twistRate!)!,
          twistRight: true,
          bulletLengthIn: spec.version.bulletLengthIn!,
          bulletDiameterIn: spec.version.bulletDiameterIn!,
        },
      });
      const at = (yd: number) => rows.find((r) => r.distanceYd === yd)!;
      return {
        mil400: Math.round(at(400).dropMil * 10) / 10,
        mil1000: Math.round(at(1000).dropMil * 10) / 10,
        moa400: Math.round(at(400).dropMoa * 4) / 4,
        moa1000: Math.round(at(1000).dropMoa * 4) / 4,
      };
    };
    const cross = holdsAt(CROSS);
    expect(cross.mil400).toBe(1.5);
    expect(cross.mil1000).toBeCloseTo(7.3, 1);
    const mpr = holdsAt(MPR);
    expect(mpr.moa400).toBeGreaterThan(5);
    expect(mpr.moa400).toBeLessThan(6.5);
    expect(mpr.moa1000).toBeGreaterThan(22);
    expect(mpr.moa1000).toBeLessThan(27);
  });
});
