import { getTableName } from 'drizzle-orm';
import type { SQLiteDatabase } from 'expo-sqlite';
import { newId } from '@/db/ids';
import { TABLE_ORDER, TABLES } from '@/lib/tables';

// Runs once after migrations, on every launch. Idempotent.
//
// Migration 0006 creates sync_row_meta and sync_state but cannot populate them:
// the device identity is minted at runtime, not at schema time. This does that,
// and backfills a logical timestamp for every row that already existed before
// sync shipped.
//
// Backfilled rows are stamped with *this* device as their writer, which is
// correct — on the upgrade path this device is genuinely the only source of
// that data, so it should be the one to publish it.

/** Derived from each row's existing updated_at, with a zero counter. */
function backfillSql(sqlTable: string): string {
  return `INSERT INTO sync_row_meta (tbl, row_id, hlc, writer, deleted)
          SELECT ?, id, printf('%012x-0000-', updated_at) || ?, ?, 0
          FROM "${sqlTable}"`;
}

export type DeviceIdentity = { deviceName: string; platform: string };

export function ensureSyncBootstrap(sqlite: SQLiteDatabase, identity: DeviceIdentity): void {
  const existing = sqlite.getFirstSync<{ device_id: string }>(
    'SELECT device_id FROM sync_state WHERE id = 1',
  );

  const deviceId = existing?.device_id ?? newId();

  if (!existing) {
    sqlite.runSync(
      `INSERT INTO sync_state (id, device_id, device_name, platform, hlc_millis, hlc_counter)
       VALUES (1, ?, ?, ?, 0, 0)`,
      [deviceId, identity.deviceName, identity.platform],
    );
  } else {
    // Keep the label fresh if the user renamed their machine.
    sqlite.runSync('UPDATE sync_state SET device_name = ?, platform = ? WHERE id = 1', [
      identity.deviceName,
      identity.platform,
    ]);
  }

  const stamped = sqlite.getFirstSync<{ c: number }>('SELECT count(*) AS c FROM sync_row_meta');
  if ((stamped?.c ?? 0) > 0) return;

  sqlite.withTransactionSync(() => {
    // One INSERT..SELECT per table rather than a row-by-row JS loop: a heavy
    // user can have tens of thousands of shots, and this runs on the launch
    // that installs the update.
    for (const table of TABLE_ORDER) {
      const sqlTable = getTableName(TABLES[table] as never);
      sqlite.runSync(backfillSql(sqlTable), [table, deviceId, deviceId]);
    }

    // Advance the persisted clock past everything we just stamped, so the first
    // real write after the upgrade outranks the backfill.
    //
    // Read the maximum from the source columns rather than parsing it back out
    // of sync_row_meta.hlc: SQLite's CAST parses a decimal prefix, so casting
    // the hex millis field would silently yield 0 and reset the clock.
    let maxUpdatedAt = 0;
    for (const table of TABLE_ORDER) {
      const sqlTable = getTableName(TABLES[table] as never);
      const row = sqlite.getFirstSync<{ m: number | null }>(
        `SELECT MAX(updated_at) AS m FROM "${sqlTable}"`,
      );
      if (row?.m != null && row.m > maxUpdatedAt) maxUpdatedAt = row.m;
    }
    sqlite.runSync('UPDATE sync_state SET hlc_millis = ?, hlc_counter = 0 WHERE id = 1', [
      maxUpdatedAt,
    ]);
  });
}
