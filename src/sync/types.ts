import type { TableName } from '@/lib/tables';
import type { Hlc } from '@/sync/hlc';

// Wire and merge types, shared verbatim with the desktop app.
// PURE: types plus the table/clock types they reference.

/** A row of user data. Every table is keyed by a TEXT `id`. */
export type Row = Record<string, unknown> & { id: string };

/**
 * A row with its logical timestamp inlined. `_h` is the only reserved key; no
 * schema column starts with an underscore (asserted in serialize.test.ts).
 */
export type StampedRow = Row & { _h: Hlc };

export type Tombstone = { t: TableName; id: string; _h: Hlc };

/** One device's complete view of the data, as published to Drive. */
export type Snapshot = {
  protocol: number;
  app: 'precision-innovation';
  /** Row shape, tracking BACKUP_SCHEMA_VERSION. */
  tableSchemaVersion: number;
  /** Newest drizzle migration this snapshot's writer had applied. */
  migrationTag: string;
  device: { id: string; name: string; platform: string };
  publishedAt: string;
  /** The writer's clock at publish time. */
  hlc: Hlc;
  rows: Partial<Record<TableName, StampedRow[]>>;
  tombstones: Tombstone[];
};

/**
 * A single change to apply. The platform driver executes these in order inside
 * ONE transaction:
 *   - every `delete` comes first, in reverse TABLE_ORDER (children first);
 *   - then every `upsert`, in TABLE_ORDER (parents first);
 *   - then `meta`, which touches only sync_row_meta.
 *
 * The ordering is not cosmetic. Foreign keys are enforced (PRAGMA foreign_keys
 * = ON), and SQLite checks unique indexes immediately rather than at commit, so
 * the range_cards swap only works if the losing row is gone before the winner
 * lands.
 */
export type Operation =
  | { kind: 'delete'; tbl: TableName; id: string }
  | { kind: 'upsert'; tbl: TableName; row: Row }
  | { kind: 'meta'; tbl: TableName; id: string; hlc: Hlc; writer: string; deleted: boolean };

export type MergeWarningCode =
  | 'peer-skipped'
  | 'peer-newer-protocol'
  | 'peer-newer-schema'
  | 'peer-newer-migration'
  | 'clock-skew'
  | 'duplicate-range-card'
  | 'orphan-dropped'
  | 'orphan-unlinked'
  | 'version-renumbered'
  | 'current-version-repaired';

/** Surfaced to the user after a sync — never thrown. */
export type MergeWarning = {
  code: MergeWarningCode;
  message: string;
  count?: number;
};

export type MintedTombstone = { tbl: TableName; id: string; reason: string };

export type MergeStats = {
  peers: number;
  peersSkipped: number;
  incomingRows: number;
  upserts: number;
  deletes: number;
  conflicts: number;
};

export type MergeResult = {
  ops: Operation[];
  /**
   * Rows the merge removed for reasons a peer cannot re-derive (a losing
   * duplicate range card, an orphan). These need real tombstones with fresh
   * timestamps, so the caller stamps them through the write funnel.
   */
  mintTombstones: MintedTombstone[];
  /** Highest timestamp seen anywhere, for the local clock to advance past. */
  maxObservedHlc: Hlc | null;
  stats: MergeStats;
  warnings: MergeWarning[];
};

/** Thrown only for a local programming error; peer problems become warnings. */
export class ProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProtocolError';
  }
}
