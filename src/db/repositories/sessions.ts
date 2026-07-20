import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '@/db/client';
import { newId, now } from '@/db/ids';
import {
  DopeEntry,
  dopeEntries,
  loadVersions,
  NewDopeEntry,
  NewRangeSession,
  RangeSession,
  rangeSessions,
  shots,
  shotStrings,
} from '@/db/schema';
import { sampleSd } from '@/lib/workup/stats';

export function activeSessionsQuery() {
  return db
    .select()
    .from(rangeSessions)
    .where(isNull(rangeSessions.archivedAt))
    .orderBy(desc(rangeSessions.date));
}

export function recentSessionsForRifleQuery(rifleId: string, limit: number) {
  return db
    .select()
    .from(rangeSessions)
    .where(and(isNull(rangeSessions.archivedAt), eq(rangeSessions.rifleId, rifleId)))
    .orderBy(desc(rangeSessions.date))
    .limit(limit);
}

export function sessionByIdQuery(id: string) {
  return db.select().from(rangeSessions).where(eq(rangeSessions.id, id));
}

export function dopeForSessionQuery(sessionId: string) {
  return db
    .select()
    .from(dopeEntries)
    .where(eq(dopeEntries.sessionId, sessionId))
    .orderBy(asc(dopeEntries.distanceYd));
}

export function stringsForSessionQuery(sessionId: string) {
  return db
    .select()
    .from(shotStrings)
    .where(eq(shotStrings.sessionId, sessionId))
    .orderBy(asc(shotStrings.createdAt));
}

/**
 * All load-version ids in the same lineage as the given version.
 *
 * Loads are copy-on-write: every edit creates a new loadVersion linked to its
 * predecessor via parentVersionId, so sessions/DOPE recorded against an older
 * version would be orphaned if we filtered by the exact version id. Since
 * every version of a load descends from that load's v1, all versions with the
 * same loadId form one parent-link chain — so "all versions of the loadId" is
 * exactly the lineage (ancestors + descendants) and far simpler than walking
 * parentVersionId in both directions. Falls back to just the given id if the
 * version row is missing.
 */
async function lineageVersionIds(loadVersionId: string): Promise<string[]> {
  const [version] = await db
    .select({ loadId: loadVersions.loadId })
    .from(loadVersions)
    .where(eq(loadVersions.id, loadVersionId));
  if (!version) return [loadVersionId];
  const siblings = await db
    .select({ id: loadVersions.id })
    .from(loadVersions)
    .where(eq(loadVersions.loadId, version.loadId));
  return siblings.map((s) => s.id);
}

/**
 * All confirmed DOPE for a rifle + load version — feeds the range card merge.
 * Aggregates across the whole version lineage (see lineageVersionIds) so a
 * load edit doesn't make previously confirmed DOPE vanish from the card.
 */
export async function confirmedDopeForRifleLoad(
  rifleId: string,
  loadVersionId: string,
): Promise<(DopeEntry & { sessionDate: Date })[]> {
  const versionIds = await lineageVersionIds(loadVersionId);
  const rows = await db
    .select({ dope: dopeEntries, session: rangeSessions })
    .from(dopeEntries)
    .innerJoin(rangeSessions, eq(dopeEntries.sessionId, rangeSessions.id))
    .where(
      and(
        eq(rangeSessions.rifleId, rifleId),
        inArray(rangeSessions.loadVersionId, versionIds),
        eq(dopeEntries.confirmed, true),
        isNull(rangeSessions.archivedAt),
      ),
    );
  return rows.map((r) => ({ ...r.dope, sessionDate: r.session.date }));
}

export async function createSession(
  data: Omit<NewRangeSession, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<RangeSession> {
  const t = now();
  const row: NewRangeSession = { ...data, id: newId(), createdAt: t, updatedAt: t };
  await db.insert(rangeSessions).values(row);
  return row as RangeSession;
}

export async function updateSession(
  id: string,
  data: Partial<Omit<NewRangeSession, 'id' | 'createdAt' | 'updatedAt'>>,
): Promise<void> {
  await db.update(rangeSessions).set({ ...data, updatedAt: now() }).where(eq(rangeSessions.id, id));
}

export async function archiveSession(id: string): Promise<void> {
  await db
    .update(rangeSessions)
    .set({ archivedAt: now(), updatedAt: now() })
    .where(eq(rangeSessions.id, id));
}

export async function addDopeEntry(
  data: Omit<NewDopeEntry, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<DopeEntry> {
  const t = now();
  const row: NewDopeEntry = { ...data, id: newId(), createdAt: t, updatedAt: t };
  await db.insert(dopeEntries).values(row);
  return row as DopeEntry;
}

export async function deleteDopeEntry(id: string): Promise<void> {
  await db.delete(dopeEntries).where(eq(dopeEntries.id, id));
}

/**
 * Create a chronograph string. With per-shot velocities the summary stats are
 * computed here (sample SD, n-1) and cached on the string row; without them
 * the manually entered summary is stored as-is.
 */
export async function addShotString(owner: {
  sessionId?: string;
  workupStepId?: string;
  velocitiesFps?: number[];
  summary?: { avgFps: number | null; sdFps: number | null; esFps: number | null };
  notes?: string | null;
}): Promise<string> {
  const t = now();
  const stringId = newId();
  const velocities = owner.velocitiesFps?.filter((v) => Number.isFinite(v) && v > 0) ?? [];

  let avgFps: number | null = owner.summary?.avgFps ?? null;
  let sdFps: number | null = owner.summary?.sdFps ?? null;
  let esFps: number | null = owner.summary?.esFps ?? null;
  if (velocities.length > 0) {
    avgFps = velocities.reduce((a, b) => a + b, 0) / velocities.length;
    sdFps = velocities.length > 1 ? sampleSd(velocities) : null;
    esFps = Math.max(...velocities) - Math.min(...velocities);
  }

  await db.insert(shotStrings).values({
    id: stringId,
    sessionId: owner.sessionId ?? null,
    workupStepId: owner.workupStepId ?? null,
    avgFps,
    sdFps,
    esFps,
    shotCount: velocities.length > 0 ? velocities.length : null,
    source: 'manual',
    notes: owner.notes ?? null,
    createdAt: t,
    updatedAt: t,
  });

  if (velocities.length > 0) {
    await db.insert(shots).values(
      velocities.map((v, i) => ({
        id: newId(),
        stringId,
        seq: i + 1,
        velocityFps: v,
        createdAt: t,
        updatedAt: t,
      })),
    );
  }
  return stringId;
}

export async function deleteShotString(id: string): Promise<void> {
  await db.delete(shots).where(eq(shots.stringId, id));
  await db.delete(shotStrings).where(eq(shotStrings.id, id));
}

/**
 * Latest measured average MV (fps) for a load version, newest string first.
 * Searches the whole version lineage (see lineageVersionIds) so chrono data
 * logged before a load edit still seeds the range card.
 */
export async function latestMeasuredMv(loadVersionId: string): Promise<number | null> {
  const versionIds = await lineageVersionIds(loadVersionId);
  const sessions = await db
    .select({ id: rangeSessions.id })
    .from(rangeSessions)
    .where(inArray(rangeSessions.loadVersionId, versionIds));
  if (sessions.length === 0) return null;
  const strings = await db
    .select()
    .from(shotStrings)
    .where(inArray(shotStrings.sessionId, sessions.map((s) => s.id)))
    .orderBy(desc(shotStrings.createdAt))
    .limit(1);
  return strings[0]?.avgFps ?? null;
}

export async function loadVersionLabel(versionId: string): Promise<string> {
  const [v] = await db.select().from(loadVersions).where(eq(loadVersions.id, versionId));
  if (!v) return 'Unknown load';
  const parts = [
    v.bulletWeightGr ? `${v.bulletWeightGr}gr` : null,
    v.bulletModel,
    v.powderName && v.chargeGr ? `${v.chargeGr}gr ${v.powderName}` : null,
  ].filter(Boolean);
  return parts.join(' · ') || `v${v.versionNumber}`;
}
