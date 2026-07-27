import type { Snapshot } from '@/sync/types';

// Version gates for the sync wire format.
//
// Three things can drift independently between two devices, and conflating
// them makes for confusing failures:
//
//   SYNC_PROTOCOL      the envelope shape (device block, tombstone list, ...)
//   TABLE_SCHEMA       the row shape, tracking BACKUP_SCHEMA_VERSION
//   MIGRATION_TAG      the newest drizzle migration applied
//
// PURE.

export const SYNC_PROTOCOL = 1;

/** Kept equal to BACKUP_SCHEMA_VERSION — the rows are the same rows. */
export const TABLE_SCHEMA_VERSION = 1;

/**
 * Newest migration this build knows. Bump when adding a migration; a peer
 * publishing a tag that sorts after ours is running a newer app, and merging
 * its rows could drop columns this build cannot represent.
 */
export const MIGRATION_TAG = '0006_perpetual_vengeance';

export const APP_MARKER = 'precision-innovation' as const;

export type SnapshotRejection = {
  reason: 'not-ours' | 'malformed' | 'newer-protocol' | 'newer-schema' | 'newer-migration';
  detail: string;
};

/**
 * Validates a decoded peer snapshot. Returns null when it is safe to merge.
 *
 * Never throws: one corrupt or too-new device file must not stop the others
 * from merging. The caller turns a rejection into a user-visible warning.
 */
export function rejectSnapshot(value: unknown): SnapshotRejection | null {
  if (typeof value !== 'object' || value === null) {
    return { reason: 'malformed', detail: 'not an object' };
  }
  const s = value as Partial<Snapshot>;

  if (s.app !== APP_MARKER) {
    return { reason: 'not-ours', detail: `app marker was ${JSON.stringify(s.app)}` };
  }
  if (typeof s.protocol !== 'number' || typeof s.tableSchemaVersion !== 'number') {
    return { reason: 'malformed', detail: 'missing protocol or tableSchemaVersion' };
  }
  if (typeof s.device !== 'object' || s.device === null || typeof s.device.id !== 'string') {
    return { reason: 'malformed', detail: 'missing device id' };
  }
  if (typeof s.rows !== 'object' || s.rows === null) {
    return { reason: 'malformed', detail: 'missing rows' };
  }
  if (!Array.isArray(s.tombstones)) {
    return { reason: 'malformed', detail: 'missing tombstones' };
  }

  if (s.protocol > SYNC_PROTOCOL) {
    return {
      reason: 'newer-protocol',
      detail: `written with sync protocol ${s.protocol}, this app speaks ${SYNC_PROTOCOL}`,
    };
  }
  if (s.tableSchemaVersion > TABLE_SCHEMA_VERSION) {
    return {
      reason: 'newer-schema',
      detail: `row format ${s.tableSchemaVersion} is newer than ${TABLE_SCHEMA_VERSION}`,
    };
  }
  if (typeof s.migrationTag === 'string' && s.migrationTag > MIGRATION_TAG) {
    // Migration tags are zero-padded and ordered, so a plain string compare is
    // the same comparison drizzle's journal makes.
    return {
      reason: 'newer-migration',
      detail: `another device is on ${s.migrationTag}, this app is on ${MIGRATION_TAG}`,
    };
  }

  return null;
}

/** Human-readable explanation for the sync warnings panel. */
export function explainRejection(deviceLabel: string, r: SnapshotRejection): string {
  switch (r.reason) {
    case 'newer-protocol':
    case 'newer-schema':
    case 'newer-migration':
      return `Skipped ${deviceLabel}: update this app to sync with it (${r.detail}).`;
    case 'not-ours':
      return `Skipped a file in the sync folder that is not Precision Innovation data.`;
    case 'malformed':
      return `Skipped ${deviceLabel}: its sync file could not be read (${r.detail}).`;
  }
}
