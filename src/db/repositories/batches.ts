import { desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import { newId, now } from '@/db/ids';
import { deleteRow, insertRow, mutate, updateRow } from '@/db/mutate';
import { LoadBatch, loadBatches, loadVersions, NewLoadBatch, rangeSessions } from '@/db/schema';
import { runoutStats } from '@/lib/batches/model';

// Batches: the rounds built from a load version on one day.

export const allBatchesQuery = () => db.select().from(loadBatches).orderBy(desc(loadBatches.date));

/** Every batch of any version of the load, newest first, with its version number. */
export function batchesForLoadQuery(loadId: string) {
  return db
    .select({ batch: loadBatches, versionNumber: loadVersions.versionNumber })
    .from(loadBatches)
    .innerJoin(loadVersions, eq(loadBatches.loadVersionId, loadVersions.id))
    .where(eq(loadVersions.loadId, loadId))
    .orderBy(desc(loadBatches.date), desc(loadBatches.createdAt));
}

export async function batchesForLoad(loadId: string): Promise<LoadBatch[]> {
  const versions = await db.select({ id: loadVersions.id }).from(loadVersions).where(eq(loadVersions.loadId, loadId));
  if (versions.length === 0) return [];
  return db
    .select()
    .from(loadBatches)
    .where(inArray(loadBatches.loadVersionId, versions.map((v) => v.id)))
    .orderBy(desc(loadBatches.date));
}

export type BatchInput = Omit<NewLoadBatch, 'id' | 'createdAt' | 'updatedAt' | 'runoutAvgIn' | 'runoutMaxIn'> & {
  /** When given, the average and max are computed from these. */
  runoutReadingsIn?: number[] | null;
  runoutAvgIn?: number | null;
  runoutMaxIn?: number | null;
};

function summarised(input: BatchInput): Pick<NewLoadBatch, 'runoutAvgIn' | 'runoutMaxIn'> {
  const readings = input.runoutReadingsIn ?? null;
  if (readings && readings.length > 0) {
    const st = runoutStats(readings)!;
    return { runoutAvgIn: st.avgIn, runoutMaxIn: st.maxIn };
  }
  return { runoutAvgIn: input.runoutAvgIn ?? null, runoutMaxIn: input.runoutMaxIn ?? null };
}

export async function addBatch(input: BatchInput): Promise<LoadBatch> {
  const t = now();
  const row: NewLoadBatch = {
    ...input,
    ...summarised(input),
    runoutReadingsIn: input.runoutReadingsIn ?? null,
    id: newId(),
    createdAt: t,
    updatedAt: t,
  };
  mutate((tx) => insertRow(tx, 'loadBatches', row));
  return row as LoadBatch;
}

export async function setBatchFired(id: string, fired: boolean): Promise<void> {
  mutate((tx) => updateRow(tx, 'loadBatches', id, { firedAt: fired ? now() : null }));
}

/** Hard delete plus a tombstone; sessions that pointed at it keep running with the link cleared. */
export async function deleteBatch(id: string): Promise<void> {
  mutate((tx) => {
    const sessions = tx.select({ id: rangeSessions.id }).from(rangeSessions).where(eq(rangeSessions.batchId, id)).all();
    for (const s of sessions) updateRow(tx, 'rangeSessions', s.id, { batchId: null });
    deleteRow(tx, 'loadBatches', id);
  });
}
