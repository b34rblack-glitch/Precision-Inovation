import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { db } from '@/db/client';
import {
  dopeEntries,
  loads,
  loadVersions,
  rangeCards,
  rangeSessions,
  rifles,
  shots,
  shotStrings,
  workups,
  workupSteps,
} from '@/db/schema';

// Full-database JSON backup. schemaVersion tracks the export shape so future
// versions (and an eventual CSV/cloud importer) can migrate old files.

export const BACKUP_SCHEMA_VERSION = 1;

const TABLES = {
  rifles,
  loads,
  loadVersions,
  workups,
  workupSteps,
  shotStrings,
  shots,
  rangeSessions,
  dopeEntries,
  rangeCards,
} as const;

type TableName = keyof typeof TABLES;

// Parents strictly before children (FK order) so restore can insert in this
// order and delete in exact reverse:
//   loads -> rifles; loadVersions -> loads; workups -> rifles/loads/loadVersions;
//   workupSteps -> workups; rangeSessions -> rifles/loadVersions;
//   shotStrings -> workupSteps/rangeSessions; shots -> shotStrings;
//   dopeEntries -> rangeSessions; rangeCards -> rifles/loadVersions.
export const TABLE_ORDER: readonly TableName[] = [
  'rifles',
  'loads',
  'loadVersions',
  'workups',
  'workupSteps',
  'rangeSessions',
  'shotStrings',
  'shots',
  'dopeEntries',
  'rangeCards',
];

/** Max rows per INSERT .values() call, to stay under SQLite's bind-variable limit. */
export const INSERT_CHUNK_SIZE = 500;

/** Split rows into chunks of at most `size` (pure; exported for tests). */
export function chunkRows<T>(rows: readonly T[], size: number): T[][] {
  if (size < 1) throw new Error(`chunkRows: size must be >= 1, got ${size}`);
  const chunks: T[][] = [];
  for (let i = 0; i < rows.length; i += size) {
    chunks.push(rows.slice(i, i + size));
  }
  return chunks;
}

export type Backup = {
  schemaVersion: number;
  exportedAt: string;
  app: 'precision-innovation';
  tables: Record<TableName, unknown[]>;
};

export async function buildBackup(): Promise<Backup> {
  const tables = {} as Backup['tables'];
  for (const name of TABLE_ORDER) {
    tables[name] = await db.select().from(TABLES[name] as never);
  }
  return {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    app: 'precision-innovation',
    tables,
  };
}

export async function exportBackup(): Promise<void> {
  const backup = await buildBackup();
  const stamp = backup.exportedAt.slice(0, 10);
  const file = new File(Paths.cache, `precision-backup-${stamp}.json`);
  if (file.exists) file.delete();
  file.create();
  file.write(JSON.stringify(backup));
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/json',
      dialogTitle: 'Export backup',
    });
  }
}

/**
 * Replaces ALL current data with the backup contents. Caller confirms first.
 *
 * The wipe + reload runs inside a single synchronous transaction (drizzle's
 * expo-sqlite driver only supports sync transactions), so any failure rolls
 * the database back to its pre-restore state instead of leaving it wiped.
 */
export async function restoreBackup(json: string): Promise<{ counts: Record<string, number> }> {
  const parsed = JSON.parse(json) as Backup;
  if (parsed.app !== 'precision-innovation' || !parsed.tables) {
    throw new Error('Not a Precision Innovation backup file.');
  }
  if (parsed.schemaVersion > BACKUP_SCHEMA_VERSION) {
    throw new Error('Backup was made by a newer app version — update the app first.');
  }

  const counts: Record<string, number> = {};
  db.transaction((tx) => {
    // Delete children before parents; insert parents before children.
    for (const name of [...TABLE_ORDER].reverse()) {
      tx.delete(TABLES[name] as never).run();
    }
    for (const name of TABLE_ORDER) {
      const rows = (parsed.tables[name] ?? []) as Record<string, unknown>[];
      counts[name] = rows.length;
      if (rows.length === 0) continue;
      const revived = rows.map((r) => reviveDates(r));
      for (const chunk of chunkRows(revived, INSERT_CHUNK_SIZE)) {
        tx.insert(TABLES[name] as never)
          .values(chunk as never)
          .run();
      }
    }
  });
  return { counts };
}

const DATE_KEYS = new Set(['createdAt', 'updatedAt', 'archivedAt', 'date']);

function reviveDates(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...row };
  for (const key of Object.keys(out)) {
    const value = out[key];
    if (DATE_KEYS.has(key) && value != null) {
      out[key] = new Date(value as string | number);
    }
  }
  return out;
}
