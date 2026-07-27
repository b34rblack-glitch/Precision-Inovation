import { COLUMNS, DATE_KEYS, TABLE_ORDER, type TableName } from '@/lib/tables';
import type { Row, Snapshot, StampedRow } from '@/sync/types';

// JSON encoding for snapshots.
//
// Deliberately the same conventions as src/lib/backup.ts — camelCase keys,
// Dates as ISO-8601 strings, JSON columns as nested values — so a snapshot and
// a backup describe rows identically and one importer can grow to read both.
//
// Two differences:
//   - null-valued keys are omitted. load_versions has 60 columns and a typical
//     row fills a handful, so this roughly halves the payload for free. Decode
//     puts every known column back as null, which matters: an upsert has to
//     clear a field the other device cleared, not silently keep the old value.
//   - each row carries `_h`, its logical timestamp.
//
// PURE.

const HLC_KEY = '_h';

/**
 * Encodes a row with its keys in schema order, always.
 *
 * Deterministic output is not cosmetic: Drive returns an md5Checksum for every
 * file, and sync uses it to skip downloading a peer whose data has not changed.
 * If the same data could encode to different bytes depending on how the row
 * object happened to be built, every device would look changed to every other
 * device on every sync.
 */
export function encodeRow(table: TableName, row: StampedRow): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const column of COLUMNS[table]) {
    const value = row[column];
    if (value === null || value === undefined) continue;
    out[column] = value instanceof Date ? value.toISOString() : value;
  }
  out[HLC_KEY] = row[HLC_KEY];
  return out;
}

/**
 * Rebuilds a row, restoring omitted columns as null and reviving date columns.
 * Unknown keys are dropped: a peer on a newer migration may carry columns this
 * build has no place to put, and passing them to an INSERT would throw.
 */
export function decodeRow(table: TableName, encoded: Record<string, unknown>): StampedRow {
  const known = COLUMNS[table];
  const out: Record<string, unknown> = {};

  for (const column of known) {
    const value = encoded[column];
    if (value === undefined || value === null) {
      out[column] = null;
      continue;
    }
    out[column] = DATE_KEYS.has(column) ? new Date(value as string | number) : value;
  }

  out[HLC_KEY] = encoded[HLC_KEY];
  return out as StampedRow;
}

/** Drops `_h` so the row can be handed to an INSERT. */
export function stripMeta(row: StampedRow | Row): Row {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (key === HLC_KEY) continue;
    out[key] = value;
  }
  return out as Row;
}

export function encodeSnapshot(snapshot: Snapshot): string {
  const rows: Record<string, unknown[]> = {};
  for (const table of TABLE_ORDER) {
    const list = snapshot.rows[table];
    if (!list || list.length === 0) continue;
    // Sorted by id so two devices holding the same rows produce the same bytes.
    rows[table] = [...list]
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .map((r) => encodeRow(table, r));
  }

  return JSON.stringify({
    protocol: snapshot.protocol,
    app: snapshot.app,
    tableSchemaVersion: snapshot.tableSchemaVersion,
    migrationTag: snapshot.migrationTag,
    device: snapshot.device,
    publishedAt: snapshot.publishedAt,
    hlc: snapshot.hlc,
    rows,
    tombstones: [...snapshot.tombstones].sort((a, b) =>
      a.t === b.t ? (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) : a.t < b.t ? -1 : 1,
    ),
  });
}

/**
 * Parses JSON into a snapshot without validating it — call rejectSnapshot on
 * the result before merging. Throws only on malformed JSON.
 */
export function decodeSnapshot(json: string): Snapshot {
  const parsed = JSON.parse(json) as Snapshot & { rows?: Record<string, unknown[]> };

  const rows: Partial<Record<TableName, StampedRow[]>> = {};
  const rawRows = (parsed.rows ?? {}) as Record<string, Record<string, unknown>[]>;
  for (const table of TABLE_ORDER) {
    const list = rawRows[table];
    if (!Array.isArray(list)) continue;
    rows[table] = list.map((r) => decodeRow(table, r));
  }

  return {
    protocol: parsed.protocol,
    app: parsed.app,
    tableSchemaVersion: parsed.tableSchemaVersion,
    migrationTag: parsed.migrationTag,
    device: parsed.device,
    publishedAt: parsed.publishedAt,
    hlc: parsed.hlc,
    rows,
    tombstones: Array.isArray(parsed.tombstones) ? parsed.tombstones : [],
  };
}
