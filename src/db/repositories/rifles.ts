import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '@/db/client';
import { newId, now } from '@/db/ids';
import { deleteRow, insertRow, mutate, updateRow } from '@/db/mutate';
import { NewRifle, Rifle, rifles } from '@/db/schema';

export function activeRiflesQuery() {
  return db.select().from(rifles).where(isNull(rifles.archivedAt)).orderBy(desc(rifles.updatedAt));
}

export function rifleByIdQuery(id: string) {
  return db.select().from(rifles).where(eq(rifles.id, id));
}

export async function createRifle(
  data: Omit<NewRifle, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<Rifle> {
  const t = now();
  const row: NewRifle = { ...data, id: newId(), createdAt: t, updatedAt: t };
  mutate((tx) => insertRow(tx, 'rifles', row));
  return row as Rifle;
}

export async function updateRifle(
  id: string,
  data: Partial<Omit<NewRifle, 'id' | 'createdAt' | 'updatedAt'>>,
): Promise<void> {
  mutate((tx) => updateRow(tx, 'rifles', id, data));
}

export async function archiveRifle(id: string): Promise<void> {
  mutate((tx) => {
    // Guarded so re-archiving is idempotent and does not restamp archivedAt.
    const [existing] = tx
      .select({ id: rifles.id })
      .from(rifles)
      .where(and(eq(rifles.id, id), isNull(rifles.archivedAt)))
      .all();
    if (!existing) return;
    updateRow(tx, 'rifles', id, { archivedAt: now() });
  });
}

/**
 * Permanently removes a rifle. Not reachable from the UI — archiving is the
 * user-facing action — but the sync engine needs a tombstoning delete for
 * conflict resolution, and routing it through here keeps the funnel intact.
 */
export async function deleteRifle(id: string): Promise<void> {
  mutate((tx) => deleteRow(tx, 'rifles', id));
}
