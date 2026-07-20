import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '@/db/client';
import { newId, now } from '@/db/ids';
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
  await db.insert(rifles).values(row);
  return row as Rifle;
}

export async function updateRifle(
  id: string,
  data: Partial<Omit<NewRifle, 'id' | 'createdAt' | 'updatedAt'>>,
): Promise<void> {
  await db.update(rifles).set({ ...data, updatedAt: now() }).where(eq(rifles.id, id));
}

export async function archiveRifle(id: string): Promise<void> {
  await db
    .update(rifles)
    .set({ archivedAt: now(), updatedAt: now() })
    .where(and(eq(rifles.id, id), isNull(rifles.archivedAt)));
}
