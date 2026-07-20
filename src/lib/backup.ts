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
const TABLE_ORDER: TableName[] = [
  'rifles',
  'loads',
  'loadVersions',
  'workups',
  'workupSteps',
  'shotStrings',
  'shots',
  'rangeSessions',
  'dopeEntries',
  'rangeCards',
];

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

/** Replaces ALL current data with the backup contents. Caller confirms first. */
export async function restoreBackup(json: string): Promise<{ counts: Record<string, number> }> {
  const parsed = JSON.parse(json) as Backup;
  if (parsed.app !== 'precision-innovation' || !parsed.tables) {
    throw new Error('Not a Precision Innovation backup file.');
  }
  if (parsed.schemaVersion > BACKUP_SCHEMA_VERSION) {
    throw new Error('Backup was made by a newer app version — update the app first.');
  }

  const counts: Record<string, number> = {};
  // Delete children before parents; insert parents before children.
  for (const name of [...TABLE_ORDER].reverse()) {
    await db.delete(TABLES[name] as never);
  }
  for (const name of TABLE_ORDER) {
    const rows = (parsed.tables[name] ?? []) as Record<string, unknown>[];
    counts[name] = rows.length;
    if (rows.length === 0) continue;
    const revived = rows.map((r) => reviveDates(r));
    await db.insert(TABLES[name] as never).values(revived as never);
  }
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
