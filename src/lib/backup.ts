import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { db } from '@/db/client';
import {
  BACKUP_SCHEMA_VERSION,
  parseBackup,
  reviveDates,
  selectSubset,
  stripDeviceLocal,
  type BackupFile,
} from '@/lib/share';
import { chunkRows, chunkSizeFor, TABLE_ORDER, TABLES } from '@/lib/tables';

// Full-database JSON backup. schemaVersion tracks the export shape so future
// versions (and an eventual CSV/cloud importer) can migrate old files.
//
// The file shape, its validation and the pure subset/merge logic live in
// @/lib/share so they can be tested without a database; this module is the
// Expo side: reading the database, writing files, the share sheet.

export { BACKUP_SCHEMA_VERSION };

// Table metadata moved to @/lib/tables so the sync merge engine and the desktop
// app share exactly one definition of the FK ordering. Re-exported here so
// existing importers of @/lib/backup are unaffected.
export { chunkRows, INSERT_CHUNK_SIZE, TABLE_ORDER } from '@/lib/tables';
export type { TableName } from '@/lib/tables';

export type Backup = BackupFile;

export async function buildBackup(): Promise<Backup> {
  const tables = {} as Backup['tables'];
  for (const name of TABLE_ORDER) {
    tables[name] = (await db.select().from(TABLES[name] as never)) as Backup['tables'][typeof name];
  }
  return {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    app: 'precision-innovation',
    tables,
  };
}

async function writeAndShare(name: string, backup: Backup, dialogTitle: string): Promise<void> {
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  file.write(JSON.stringify(backup));
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle });
  }
}

export async function exportBackup(): Promise<void> {
  const backup = await buildBackup();
  const stamp = backup.exportedAt.slice(0, 10);
  await writeAndShare(`precision-backup-${stamp}.json`, backup, 'Export backup');
}

/**
 * A backup file holding only the given rifles: each with its loads and their
 * versions, workups, range sessions, chronograph strings, DOPE and range
 * cards. Same file format as a full backup, so the receiving phone can either
 * add it next to its own data (Settings → Add from Backup) or, if it is
 * empty, restore it outright. Photos stay on this device.
 */
export async function buildShareBackup(rifleIds: readonly string[]): Promise<Backup> {
  const full = await buildBackup();
  const tables = stripDeviceLocal(
    selectSubset(full.tables, { rifleIds, includeUnattachedLoads: false }),
  );
  const rifleNames = tables.rifles.map((r) => String(r.name));
  return { ...full, tables, share: { rifleNames } };
}

/** Hand one rifle, with everything that belongs to it, to the share sheet. */
export async function shareRifle(rifle: { id: string; name: string }): Promise<void> {
  const backup = await buildShareBackup([rifle.id]);
  const slug =
    rifle.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'rifle';
  const stamp = backup.exportedAt.slice(0, 10);
  await writeAndShare(`precision-rifle-${slug}-${stamp}.json`, backup, `Share ${rifle.name}`);
}

/**
 * Replaces ALL current data with the backup contents. Caller confirms first.
 *
 * The wipe + reload runs inside a single synchronous transaction (drizzle's
 * expo-sqlite driver only supports sync transactions), so any failure rolls
 * the database back to its pre-restore state instead of leaving it wiped.
 */
export async function restoreBackup(json: string): Promise<{ counts: Record<string, number> }> {
  const parsed = parseBackup(json);

  const counts: Record<string, number> = {};
  db.transaction((tx) => {
    // Delete children before parents; insert parents before children.
    for (const name of [...TABLE_ORDER].reverse()) {
      tx.delete(TABLES[name] as never).run();
    }
    for (const name of TABLE_ORDER) {
      const rows = parsed.tables[name];
      counts[name] = rows.length;
      if (rows.length === 0) continue;
      const revived = rows.map((r) => reviveDates(r));
      for (const chunk of chunkRows(revived, chunkSizeFor(name))) {
        tx.insert(TABLES[name] as never)
          .values(chunk as never)
          .run();
      }
    }
  });
  return { counts };
}
