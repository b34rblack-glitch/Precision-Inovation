import { asc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { now } from '@/db/ids';
import { deleteRow, insertRow, mutate, updateRow } from '@/db/mutate';
import { NewTargetPhoto, TargetPhoto, targetPhotos } from '@/db/schema';

// Database side only. Copying the image onto disk, hashing it and removing the
// file again live in src/features/workups/targetPhotos.ts, which calls these.

export function photosForWorkupQuery(workupId: string) {
  return db
    .select()
    .from(targetPhotos)
    .where(eq(targetPhotos.workupId, workupId))
    .orderBy(asc(targetPhotos.createdAt));
}

/** The caller mints the id, because the file on disk is named after it. */
export async function addTargetPhoto(
  data: Omit<NewTargetPhoto, 'createdAt' | 'updatedAt'>,
): Promise<TargetPhoto> {
  const t = now();
  const row: NewTargetPhoto = { ...data, createdAt: t, updatedAt: t };
  mutate((tx) => insertRow(tx, 'targetPhotos', row));
  return row as TargetPhoto;
}

export async function updateTargetPhoto(
  id: string,
  patch: { caption?: string | null; workupStepId?: string | null },
): Promise<void> {
  mutate((tx) => updateRow(tx, 'targetPhotos', id, patch));
}

/** Hard delete plus a tombstone, so the row cannot return from another device. */
export async function deleteTargetPhoto(id: string): Promise<void> {
  mutate((tx) => deleteRow(tx, 'targetPhotos', id));
}
