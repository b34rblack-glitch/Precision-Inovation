import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { newId, now } from '@/db/ids';
import { deleteRow, insertRow, mutate } from '@/db/mutate';
import { LandsMeasurement, landsMeasurements, NewLandsMeasurement } from '@/db/schema';

// Distance-to-lands log: one row per bullet per measurement in one rifle.

export function landsForRifleQuery(rifleId: string) {
  return db
    .select()
    .from(landsMeasurements)
    .where(eq(landsMeasurements.rifleId, rifleId))
    .orderBy(desc(landsMeasurements.measuredAt), desc(landsMeasurements.createdAt));
}

export function landsForRifleBulletQuery(rifleId: string, bulletMake: string, bulletModel: string) {
  return db
    .select()
    .from(landsMeasurements)
    .where(
      and(
        eq(landsMeasurements.rifleId, rifleId),
        eq(landsMeasurements.bulletMake, bulletMake),
        eq(landsMeasurements.bulletModel, bulletModel),
      ),
    )
    .orderBy(desc(landsMeasurements.measuredAt));
}

export async function addLandsMeasurement(
  data: Omit<NewLandsMeasurement, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<LandsMeasurement> {
  const t = now();
  const row: NewLandsMeasurement = { ...data, id: newId(), createdAt: t, updatedAt: t };
  mutate((tx) => insertRow(tx, 'landsMeasurements', row));
  return row as LandsMeasurement;
}

/** Hard delete plus a tombstone, like every other delete in the app. */
export async function deleteLandsMeasurement(id: string): Promise<void> {
  mutate((tx) => deleteRow(tx, 'landsMeasurements', id));
}
