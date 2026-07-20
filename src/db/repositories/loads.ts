import { and, desc, eq, isNull, or } from 'drizzle-orm';
import { db } from '@/db/client';
import { newId, now } from '@/db/ids';
import {
  Load,
  LoadVersion,
  loads,
  loadVersions,
  NewLoadVersion,
  rangeSessions,
  workups,
} from '@/db/schema';

export type LoadComponentValues = Omit<
  NewLoadVersion,
  'id' | 'loadId' | 'versionNumber' | 'parentVersionId' | 'createdAt' | 'updatedAt'
>;

export function activeLoadsQuery() {
  return db.select().from(loads).where(isNull(loads.archivedAt)).orderBy(desc(loads.updatedAt));
}

export function loadsForRifleQuery(rifleId: string) {
  return db
    .select()
    .from(loads)
    .where(and(isNull(loads.archivedAt), eq(loads.rifleId, rifleId)))
    .orderBy(desc(loads.updatedAt));
}

export function loadByIdQuery(id: string) {
  return db.select().from(loads).where(eq(loads.id, id));
}

export function versionsForLoadQuery(loadId: string) {
  return db
    .select()
    .from(loadVersions)
    .where(eq(loadVersions.loadId, loadId))
    .orderBy(desc(loadVersions.versionNumber));
}

export function versionByIdQuery(id: string) {
  return db.select().from(loadVersions).where(eq(loadVersions.id, id));
}

export async function getVersionById(id: string): Promise<LoadVersion | undefined> {
  const rows = await db.select().from(loadVersions).where(eq(loadVersions.id, id));
  return rows[0];
}

export async function createLoad(
  meta: { name: string; cartridge: string | null; rifleId: string | null },
  components: LoadComponentValues,
): Promise<Load> {
  const t = now();
  const loadId = newId();
  const versionId = newId();
  await db.insert(loads).values({
    id: loadId,
    name: meta.name,
    cartridge: meta.cartridge,
    rifleId: meta.rifleId,
    currentVersionId: versionId,
    createdAt: t,
    updatedAt: t,
  });
  await db.insert(loadVersions).values({
    ...components,
    id: versionId,
    loadId,
    versionNumber: 1,
    parentVersionId: null,
    createdAt: t,
    updatedAt: t,
  });
  const rows = await db.select().from(loads).where(eq(loads.id, loadId));
  return rows[0]!;
}

/** A version is locked once any session or workup references it. */
export async function isVersionReferenced(versionId: string): Promise<boolean> {
  const [session] = await db
    .select({ id: rangeSessions.id })
    .from(rangeSessions)
    .where(eq(rangeSessions.loadVersionId, versionId))
    .limit(1);
  if (session) return true;
  const [workup] = await db
    .select({ id: workups.id })
    .from(workups)
    .where(
      or(eq(workups.baseVersionId, versionId), eq(workups.resultLoadVersionId, versionId)),
    )
    .limit(1);
  return Boolean(workup);
}

/**
 * Copy-on-write update: if the current version has real history behind it
 * (a session or workup), a new version is created and becomes current;
 * an unreferenced draft is edited in place.
 */
export async function updateLoad(
  loadId: string,
  meta: { name: string; cartridge: string | null; rifleId: string | null },
  components: LoadComponentValues,
): Promise<{ createdNewVersion: boolean }> {
  const t = now();
  const [load] = await db.select().from(loads).where(eq(loads.id, loadId));
  if (!load) throw new Error(`Load ${loadId} not found`);

  await db
    .update(loads)
    .set({ name: meta.name, cartridge: meta.cartridge, rifleId: meta.rifleId, updatedAt: t })
    .where(eq(loads.id, loadId));

  const currentId = load.currentVersionId;
  if (!currentId) {
    const versionId = newId();
    await db.insert(loadVersions).values({
      ...components,
      id: versionId,
      loadId,
      versionNumber: 1,
      parentVersionId: null,
      createdAt: t,
      updatedAt: t,
    });
    await db.update(loads).set({ currentVersionId: versionId }).where(eq(loads.id, loadId));
    return { createdNewVersion: false };
  }

  if (await isVersionReferenced(currentId)) {
    const [current] = await db.select().from(loadVersions).where(eq(loadVersions.id, currentId));
    const versionId = newId();
    await db.insert(loadVersions).values({
      ...components,
      id: versionId,
      loadId,
      versionNumber: (current?.versionNumber ?? 0) + 1,
      parentVersionId: currentId,
      createdAt: t,
      updatedAt: t,
    });
    await db.update(loads).set({ currentVersionId: versionId }).where(eq(loads.id, loadId));
    return { createdNewVersion: true };
  }

  await db
    .update(loadVersions)
    .set({ ...components, updatedAt: t })
    .where(eq(loadVersions.id, currentId));
  return { createdNewVersion: false };
}

export async function archiveLoad(id: string): Promise<void> {
  await db
    .update(loads)
    .set({ archivedAt: now(), updatedAt: now() })
    .where(and(eq(loads.id, id), isNull(loads.archivedAt)));
}
