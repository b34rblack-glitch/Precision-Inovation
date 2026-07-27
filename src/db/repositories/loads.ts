import { and, desc, eq, isNull, or } from 'drizzle-orm';
import { db } from '@/db/client';
import { newId, now } from '@/db/ids';
import { deleteRow, insertRow, mutate, updateRow } from '@/db/mutate';
import {
  Load,
  LoadVersion,
  loads,
  loadVersions,
  NewLoadVersion,
  rangeSessions,
  workups,
} from '@/db/schema';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

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

  const row: Load = {
    id: loadId,
    name: meta.name,
    cartridge: meta.cartridge,
    rifleId: meta.rifleId,
    currentVersionId: versionId,
    createdAt: t,
    updatedAt: t,
    archivedAt: null,
  };

  // One transaction: a crash between these two inserts used to leave a load
  // pointing at a version that does not exist.
  mutate((tx) => {
    insertRow(tx, 'loads', row);
    insertRow(tx, 'loadVersions', {
      ...components,
      id: versionId,
      loadId,
      versionNumber: 1,
      parentVersionId: null,
      createdAt: t,
      updatedAt: t,
    });
  });

  return row;
}

/** A version is locked once any session or workup references it. */
function isVersionReferencedSync(tx: Tx, versionId: string): boolean {
  const session = tx
    .select({ id: rangeSessions.id })
    .from(rangeSessions)
    .where(eq(rangeSessions.loadVersionId, versionId))
    .limit(1)
    .all();
  if (session.length > 0) return true;

  const workup = tx
    .select({ id: workups.id })
    .from(workups)
    .where(or(eq(workups.baseVersionId, versionId), eq(workups.resultLoadVersionId, versionId)))
    .limit(1)
    .all();
  return workup.length > 0;
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
    .where(or(eq(workups.baseVersionId, versionId), eq(workups.resultLoadVersionId, versionId)))
    .limit(1);
  return Boolean(workup);
}

/**
 * Copy-on-write update: if the current version has real history behind it
 * (a session or workup), a new version is created and becomes current;
 * an unreferenced draft is edited in place.
 *
 * The whole decision now runs inside one transaction, so the referenced-ness
 * check cannot race a concurrent write and the version insert can no longer be
 * committed without the currentVersionId bump that points at it.
 */
export async function updateLoad(
  loadId: string,
  meta: { name: string; cartridge: string | null; rifleId: string | null },
  components: LoadComponentValues,
): Promise<{ createdNewVersion: boolean }> {
  const t = now();

  return mutate((tx) => {
    const [load] = tx.select().from(loads).where(eq(loads.id, loadId)).all();
    if (!load) throw new Error(`Load ${loadId} not found`);

    updateRow(tx, 'loads', loadId, {
      name: meta.name,
      cartridge: meta.cartridge,
      rifleId: meta.rifleId,
    });

    const currentId = load.currentVersionId;

    if (!currentId) {
      const versionId = newId();
      insertRow(tx, 'loadVersions', {
        ...components,
        id: versionId,
        loadId,
        versionNumber: 1,
        parentVersionId: null,
        createdAt: t,
        updatedAt: t,
      });
      updateRow(tx, 'loads', loadId, { currentVersionId: versionId });
      return { createdNewVersion: false };
    }

    if (isVersionReferencedSync(tx, currentId)) {
      const [current] = tx
        .select()
        .from(loadVersions)
        .where(eq(loadVersions.id, currentId))
        .all();
      const versionId = newId();
      insertRow(tx, 'loadVersions', {
        ...components,
        id: versionId,
        loadId,
        versionNumber: (current?.versionNumber ?? 0) + 1,
        parentVersionId: currentId,
        createdAt: t,
        updatedAt: t,
      });
      updateRow(tx, 'loads', loadId, { currentVersionId: versionId });
      return { createdNewVersion: true };
    }

    updateRow(tx, 'loadVersions', currentId, components);
    return { createdNewVersion: false };
  });
}

export async function archiveLoad(id: string): Promise<void> {
  mutate((tx) => {
    const [existing] = tx
      .select({ id: loads.id })
      .from(loads)
      .where(and(eq(loads.id, id), isNull(loads.archivedAt)))
      .all();
    if (!existing) return;
    updateRow(tx, 'loads', id, { archivedAt: now() });
  });
}

/** See deleteRifle — exists for the sync engine, not the UI. */
export async function deleteLoad(id: string): Promise<void> {
  mutate((tx) => deleteRow(tx, 'loads', id));
}
