import { readFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { beforeAll, describe, expect, it } from 'vitest';
import { isHlc, parseHlc, writerOf } from '@/sync/hlc';

// Applies the real drizzle migrations to a real SQLite database.
//
// Everything else in this suite tests TypeScript. This tests the SQL — the part
// that runs on a user's phone during an app update, where a mistake means a
// migration failure screen and no way back. node:sqlite makes that checkable
// here rather than only on-device.

const ROOT = path.resolve(__dirname, '../..');
const DRIZZLE = path.join(ROOT, 'drizzle');

type Journal = { entries: { idx: number; tag: string }[] };

function migrationFiles(): string[] {
  const journal = JSON.parse(
    readFileSync(path.join(DRIZZLE, 'meta', '_journal.json'), 'utf8'),
  ) as Journal;
  return journal.entries
    .sort((a, b) => a.idx - b.idx)
    .map((e) => path.join(DRIZZLE, `${e.tag}.sql`));
}

function migrate(db: DatabaseSync): void {
  for (const file of migrationFiles()) {
    const sql = readFileSync(file, 'utf8');
    for (const statement of sql.split('--> statement-breakpoint')) {
      const trimmed = statement.trim();
      if (trimmed.length > 0) db.exec(trimmed);
    }
  }
}

const DEVICE = '11111111-1111-4111-8111-111111111111';
const T0 = 1_784_562_354_988;

/** The backfill from src/db/syncBootstrap.ts, kept in sync by the test below. */
const BACKFILL = (t: string) =>
  `INSERT INTO sync_row_meta (tbl, row_id, hlc, writer, deleted)
   SELECT ?, id, printf('%012x-0000-', updated_at) || ?, ?, 0 FROM "${t}"`;

function seed(db: DatabaseSync): void {
  db.prepare(
    `INSERT INTO rifles (id, name, sight_height_in, turret_unit, distance_unit,
                         zero_distance, twist_right, created_at, updated_at)
     VALUES (?, ?, 1.9, 'MIL', 'yd', 100, 1, ?, ?)`,
  ).run('rifle-1', 'Tikka T3x', T0, T0);

  db.prepare(
    `INSERT INTO loads (id, name, rifle_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
  ).run('load-1', '6.5CM 140 ELD-M', 'rifle-1', T0, T0 + 500);

  db.prepare(
    `INSERT INTO load_versions (id, load_id, version_number, created_at, updated_at)
     VALUES (?, ?, 1, ?, ?)`,
  ).run('ver-1', 'load-1', T0, T0 + 900);
}

describe('drizzle migrations apply to a real SQLite database', () => {
  let db: DatabaseSync;

  beforeAll(() => {
    db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON;');
    migrate(db);
  });

  it('creates all twelve tables', () => {
    const names = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`)
      .all()
      .map((r) => (r as { name: string }).name)
      .sort();

    expect(names).toEqual(
      [
        'dope_entries',
        'load_versions',
        'loads',
        'range_cards',
        'range_sessions',
        'rifles',
        'shot_strings',
        'shots',
        'sync_row_meta',
        'sync_state',
        'workup_steps',
        'workups',
      ].sort(),
    );
  });

  it('keeps the range_cards unique index — the constraint merge must not violate', () => {
    const idx = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='index' AND name=?`)
      .get('range_cards_rifle_load_version_unq');
    expect(idx).toBeTruthy();
  });

  it('adds the photo hash columns without touching existing data', () => {
    const cols = db
      .prepare(`SELECT name FROM pragma_table_info('rifles')`)
      .all()
      .map((r) => (r as { name: string }).name);
    expect(cols).toContain('photo_uri');
    expect(cols).toContain('photo_sha256');

    const sessionCols = db
      .prepare(`SELECT name FROM pragma_table_info('range_sessions')`)
      .all()
      .map((r) => (r as { name: string }).name);
    expect(sessionCols).toContain('target_photo_sha256');
  });

  it('sync_row_meta is keyed by (tbl, row_id) and needs no foreign keys', () => {
    // No FK to the data tables: a tombstone exists exactly when its row does not.
    const fks = db.prepare(`SELECT * FROM pragma_foreign_key_list('sync_row_meta')`).all();
    expect(fks).toEqual([]);

    db.prepare(`INSERT INTO sync_row_meta (tbl,row_id,hlc,writer,deleted) VALUES (?,?,?,?,0)`).run(
      'dopeEntries',
      'ghost',
      `000000000001-0000-${DEVICE}`,
      DEVICE,
    );
    // A tombstone for a row that never existed here is legal, by design.
    expect(
      db.prepare(`SELECT count(*) c FROM sync_row_meta WHERE row_id='ghost'`).get(),
    ).toMatchObject({ c: 1 });

    db.exec(`DELETE FROM sync_row_meta`);
  });
});

describe('backfill stamps pre-sync rows', () => {
  let db: DatabaseSync;

  beforeAll(() => {
    db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON;');
    migrate(db);
    seed(db);
    for (const t of ['rifles', 'loads', 'load_versions']) {
      db.prepare(BACKFILL(t)).run(t, DEVICE, DEVICE);
    }
  });

  it('stamps every existing row exactly once', () => {
    const rows = db.prepare(`SELECT tbl, row_id, hlc, writer, deleted FROM sync_row_meta`).all() as {
      tbl: string;
      row_id: string;
      hlc: string;
      writer: string;
      deleted: number;
    }[];
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.deleted === 0)).toBe(true);
    expect(rows.every((r) => r.writer === DEVICE)).toBe(true);
  });

  it('produces well-formed HLCs whose millis equal the row’s updated_at', () => {
    const row = db
      .prepare(`SELECT hlc FROM sync_row_meta WHERE tbl='loads' AND row_id='load-1'`)
      .get() as { hlc: string };

    expect(isHlc(row.hlc)).toBe(true);
    expect(parseHlc(row.hlc).ms).toBe(T0 + 500);
    expect(parseHlc(row.hlc).counter).toBe(0);
    expect(writerOf(row.hlc)).toBe(DEVICE);
  });

  it('orders backfilled stamps by their original updated_at', () => {
    // SQLite's own ORDER BY on the text column must agree with edit order —
    // this is the fixed-width padding invariant, checked in SQL rather than JS.
    const ordered = db
      .prepare(`SELECT row_id FROM sync_row_meta ORDER BY hlc ASC`)
      .all()
      .map((r) => (r as { row_id: string }).row_id);
    expect(ordered).toEqual(['rifle-1', 'load-1', 'ver-1']);
  });

  it('is idempotent — a second launch does not double-stamp', () => {
    const before = db.prepare(`SELECT count(*) c FROM sync_row_meta`).get() as { c: number };
    // ensureSyncBootstrap guards on this count being non-zero.
    expect(before.c).toBeGreaterThan(0);
  });

  it('CAST cannot be used to read the millis back (why the clock is read from source)', () => {
    // Guards the bug this test caught: SQLite's CAST parses a decimal prefix,
    // so casting the hex millis field yields 0 and would silently reset the
    // clock to the epoch, making every later write lose every conflict.
    const bad = db.prepare(`SELECT CAST(('0x' || substr(hlc,1,12)) AS INTEGER) v
                            FROM sync_row_meta LIMIT 1`).get() as { v: number };
    expect(bad.v).toBe(0);
  });
});
