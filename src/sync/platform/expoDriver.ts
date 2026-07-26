import { eq, getTableColumns, type Column } from 'drizzle-orm';
import { db } from '@/db/client';
import { currentDeviceId, deleteRow, mutate, observeRemoteHlc } from '@/db/mutate';
import { syncRowMeta, syncState } from '@/db/schema';
import { buildBackup } from '@/lib/backup';
import { TABLE_ORDER, TABLES, type TableName } from '@/lib/tables';
import { formatHlc, type Hlc } from '@/sync/hlc';
import { decodeRow } from '@/sync/serialize';
import type { SyncStateValues, SyncStore } from '@/sync/syncOnce';
import type { MintedTombstone, Operation, Snapshot, StampedRow, Tombstone } from '@/sync/types';
import { MIGRATION_TAG, SYNC_PROTOCOL, TABLE_SCHEMA_VERSION } from '@/sync/protocol';

// The Expo/SQLite half of sync: reads local state into a snapshot, and applies
// merge operations back.
//
// This is the one module besides the write funnel that writes rows directly.
// That is deliberate and allowlisted in __tests__/sync/funnel.test.ts: merge
// operations arrive already carrying their logical timestamps, so re-stamping
// them here would overwrite the very information that decided the merge.

function idColumn(tbl: TableName): Column {
  const columns = getTableColumns(TABLES[tbl] as never) as Record<string, Column>;
  return columns.id!;
}

/** Reads every row plus its logical timestamp, as one snapshot. */
async function readSnapshot(): Promise<Snapshot> {
  const meta = await db
    .select({
      tbl: syncRowMeta.tbl,
      rowId: syncRowMeta.rowId,
      hlc: syncRowMeta.hlc,
      deleted: syncRowMeta.deleted,
    })
    .from(syncRowMeta);

  const stamps = new Map<string, string>();
  const tombstones: Tombstone[] = [];
  for (const m of meta) {
    const key = `${m.tbl} ${m.rowId}`;
    if (m.deleted) tombstones.push({ t: m.tbl as TableName, id: m.rowId, _h: m.hlc });
    else stamps.set(key, m.hlc);
  }

  const rows: Partial<Record<TableName, StampedRow[]>> = {};
  for (const tbl of TABLE_ORDER) {
    const list = (await db.select().from(TABLES[tbl] as never)) as Record<string, unknown>[];
    const stamped: StampedRow[] = [];
    for (const r of list) {
      const hlc = stamps.get(`${tbl} ${String(r.id)}`);
      // Should never happen: ensureSyncBootstrap stamps every pre-existing row
      // and the write funnel stamps every new one. If it does, the row is
      // simply not published rather than shipped with a fabricated timestamp
      // that could outrank a real edit on another device.
      if (!hlc) continue;
      stamped.push({ ...r, _h: hlc } as StampedRow);
    }
    if (stamped.length > 0) rows[tbl] = stamped;
  }

  const [state] = await db.select().from(syncState).where(eq(syncState.id, 1));

  return {
    protocol: SYNC_PROTOCOL,
    app: 'precision-innovation',
    tableSchemaVersion: TABLE_SCHEMA_VERSION,
    migrationTag: MIGRATION_TAG,
    device: {
      id: state?.deviceId ?? currentDeviceId(),
      name: state?.deviceName ?? 'This device',
      platform: state?.platform ?? 'unknown',
    },
    publishedAt: new Date().toISOString(),
    hlc: formatHlc(
      state?.hlcMillis ?? 0,
      state?.hlcCounter ?? 0,
      state?.deviceId ?? currentDeviceId(),
    ),
    rows,
    tombstones,
  };
}

export const expoSyncStore: SyncStore = {
  async readState(): Promise<SyncStateValues> {
    const [state] = await db.select().from(syncState).where(eq(syncState.id, 1));
    if (!state) throw new Error('sync_state is empty: ensureSyncBootstrap has not run');
    return {
      deviceId: state.deviceId,
      deviceName: state.deviceName,
      platform: state.platform,
      rootFolderId: state.rootFolderId,
      devicesFolderId: state.devicesFolderId,
      blobsFolderId: state.blobsFolderId,
      myFileId: state.myFileId,
      peerCacheJson: state.peerCacheJson,
    };
  },

  async writeState(patch): Promise<void> {
    await db.update(syncState).set(patch as never).where(eq(syncState.id, 1));
  },

  readSnapshot,

  /**
   * Applies every operation in ONE transaction, in the order the merge engine
   * emitted them: deletes (children first), then upserts (parents first), then
   * bookkeeping. Foreign keys are enforced and SQLite checks unique indexes
   * immediately, so the order is what keeps the apply from throwing.
   */
  async applyOps(ops: readonly Operation[]): Promise<void> {
    if (ops.length === 0) return;

    mutate((tx) => {
      for (const op of ops) {
        if (op.kind === 'delete') {
          tx.delete(TABLES[op.tbl] as never)
            .where(eq(idColumn(op.tbl), op.id))
            .run();
          continue;
        }

        if (op.kind === 'upsert') {
          // decodeRow has already revived dates and filled absent columns with
          // null, so this both inserts and clears fields the peer cleared.
          const row = decodeRow(op.tbl, op.row as Record<string, unknown>) as Record<
            string,
            unknown
          >;
          delete row._h;
          tx.insert(TABLES[op.tbl] as never)
            .values(row as never)
            .onConflictDoUpdate({ target: idColumn(op.tbl) as never, set: row as never })
            .run();
          continue;
        }

        tx.insert(syncRowMeta)
          .values({
            tbl: op.tbl,
            rowId: op.id,
            hlc: op.hlc,
            writer: op.writer,
            deleted: op.deleted,
          })
          .onConflictDoUpdate({
            target: [syncRowMeta.tbl, syncRowMeta.rowId],
            set: { hlc: op.hlc, writer: op.writer, deleted: op.deleted },
          })
          .run();
      }
    });
  },

  /**
   * Rows the merge removed for reasons a peer cannot re-derive. These need real
   * timestamps from this device's clock, so they go through the write funnel.
   */
  async mintTombstones(list: readonly MintedTombstone[]): Promise<void> {
    if (list.length === 0) return;
    mutate((tx) => {
      for (const t of list) deleteRow(tx, t.tbl, t.id);
    });
  },

  async observeRemote(hlc: Hlc): Promise<void> {
    observeRemoteHlc(hlc);
  },

  /**
   * A safety copy before the first change of any sync. Reuses the existing
   * backup format, so the file can be restored through Settings like any other.
   */
  async backupBeforeApply(): Promise<void> {
    const { File, Paths } = await import('expo-file-system');
    const backup = await buildBackup();
    const file = new File(Paths.cache, 'precision-presync-backup.json');
    if (file.exists) file.delete();
    file.create();
    file.write(JSON.stringify(backup));
  },
};
