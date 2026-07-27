import { eq, getTableColumns, type Column } from 'drizzle-orm';
import { db, sqlite } from '@/db/client';
import { now } from '@/db/ids';
import { syncRowMeta, syncState } from '@/db/schema';
import { chunkRows, chunkSizeFor, TABLES, type TableName } from '@/lib/tables';
import { formatHlc, receive, tick, type Hlc, type HlcTick } from '@/sync/hlc';

// The single write funnel. Every insert, update and delete of user data goes
// through here so that:
//
//   1. every row gets a logical timestamp, without which sync cannot order
//      concurrent edits;
//   2. deletes leave a tombstone, without which a row deleted on one device
//      simply reappears from the other;
//   3. the clock is persisted in the same transaction as the write it stamps,
//      so a crash cannot rewind it and reissue a timestamp.
//
// __tests__/sync/funnel.test.ts fails the build if a write appears anywhere
// outside this module, which is what keeps the guarantee true as the app grows.

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type InsertOf<T extends TableName> = (typeof TABLES)[T]['$inferInsert'];

/** Every table is keyed by a TEXT `id`; reflection keeps this generic. */
function idColumn(tbl: TableName): Column {
  const columns = getTableColumns(TABLES[tbl] as never) as Record<string, Column>;
  const column = columns.id;
  if (!column) throw new Error(`table ${tbl} has no id column`);
  return column;
}

let clock: HlcTick | null = null;
let deviceId: string | null = null;

function ensureClock(): void {
  if (clock !== null && deviceId !== null) return;
  const row = sqlite.getFirstSync<{
    device_id: string;
    hlc_millis: number;
    hlc_counter: number;
  }>('SELECT device_id, hlc_millis, hlc_counter FROM sync_state WHERE id = 1');
  if (!row) {
    // ensureSyncBootstrap runs before the UI mounts (app/_layout.tsx), so this
    // only fires if that was skipped — a programming error, not a user state.
    throw new Error('sync_state is empty: ensureSyncBootstrap has not run');
  }
  deviceId = row.device_id;
  clock = { ms: row.hlc_millis, counter: row.hlc_counter };
}

/** This device's id. */
export function currentDeviceId(): string {
  ensureClock();
  return deviceId!;
}

/** Next logical timestamp, advancing the in-memory clock. */
function nextHlc(): Hlc {
  clock = tick(clock!, Date.now());
  return formatHlc(clock.ms, clock.counter, deviceId!);
}

/**
 * Fold an observed remote timestamp into the local clock, so that everything we
 * write afterwards outranks it. Called by the sync engine once per merge with
 * the highest timestamp it saw.
 */
export function observeRemoteHlc(remote: Hlc): void {
  ensureClock();
  clock = receive(clock!, remote, Date.now());
  sqlite.runSync('UPDATE sync_state SET hlc_millis = ?, hlc_counter = ? WHERE id = 1', [
    clock.ms,
    clock.counter,
  ]);
}

function stamp(tx: Tx, tbl: TableName, rowId: string, deleted: boolean): void {
  const hlc = nextHlc();
  tx.insert(syncRowMeta)
    .values({ tbl, rowId, hlc, writer: deviceId!, deleted })
    .onConflictDoUpdate({
      target: [syncRowMeta.tbl, syncRowMeta.rowId],
      set: { hlc, writer: deviceId!, deleted },
    })
    .run();
}

/**
 * Record that a row was written, when the insert itself had to be issued
 * directly — currently only getOrCreateCard, which needs onConflictDoNothing to
 * stay race-free against the range_cards unique index. Prefer insertRow.
 */
export function stampRow(tx: Tx, tbl: TableName, id: string): void {
  stamp(tx, tbl, id, false);
}

export function insertRow<T extends TableName>(tx: Tx, tbl: T, row: InsertOf<T>): void {
  tx.insert(TABLES[tbl] as never)
    .values(row as never)
    .run();
  stamp(tx, tbl, (row as { id: string }).id, false);
}

export function insertRows<T extends TableName>(tx: Tx, tbl: T, rows: readonly InsertOf<T>[]): void {
  if (rows.length === 0) return;
  for (const chunk of chunkRows(rows, chunkSizeFor(tbl))) {
    tx.insert(TABLES[tbl] as never)
      .values(chunk as never)
      .run();
  }
  for (const row of rows) stamp(tx, tbl, (row as { id: string }).id, false);
}

/** Updates the row and refreshes updatedAt; callers must not set it themselves. */
export function updateRow<T extends TableName>(
  tx: Tx,
  tbl: T,
  id: string,
  patch: Partial<InsertOf<T>>,
): void {
  tx.update(TABLES[tbl] as never)
    .set({ ...patch, updatedAt: now() } as never)
    .where(eq(idColumn(tbl), id))
    .run();
  stamp(tx, tbl, id, false);
}

/**
 * Hard delete plus a tombstone. The row genuinely goes away — foreign keys and
 * the range_cards unique index stay clean, and every isNull(archivedAt) query
 * in the app keeps working — while sync_row_meta remembers that it existed and
 * when it died.
 */
export function deleteRow<T extends TableName>(tx: Tx, tbl: T, id: string): void {
  tx.delete(TABLES[tbl] as never)
    .where(eq(idColumn(tbl), id))
    .run();
  stamp(tx, tbl, id, true);
}

/**
 * Runs `fn` in a single transaction, persisting the clock alongside it.
 *
 * If `fn` throws, the transaction rolls back and the in-memory clock is left
 * advanced past values that were never committed. That is safe — the clock only
 * ever moves forward, and skipping timestamps costs nothing.
 */
export function mutate<T>(fn: (tx: Tx) => T): T {
  ensureClock();
  return db.transaction((tx) => {
    const before = clock!;
    const result = fn(tx);
    if (clock!.ms !== before.ms || clock!.counter !== before.counter) {
      tx.update(syncState)
        .set({ hlcMillis: clock!.ms, hlcCounter: clock!.counter })
        .where(eq(syncState.id, 1))
        .run();
    }
    return result;
  });
}

/** Test seam: forget the cached clock so a fresh sync_state is picked up. */
export function resetClockCache(): void {
  clock = null;
  deviceId = null;
}
