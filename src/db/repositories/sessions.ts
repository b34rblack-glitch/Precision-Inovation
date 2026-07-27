import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '@/db/client';
import { newId, now } from '@/db/ids';
import { deleteRow, insertRow, insertRows, mutate, updateRow } from '@/db/mutate';
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
import { autoSessionId } from '@/sync/autoSession';

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
  // r.dope carries dopeEntries.createdAt, the fine tie-break used when several
  // confirmations share a session date (all DOPE in one session does).
  return rows.map((r) => ({ ...r.dope, sessionDate: r.session.date }));
}

/**
 * Atmosphere from the most recent logged session for this load's version
 * lineage — used to seed the range-card solver at build time instead of the
 * ICAO sea-level default. Returns the newest (by date) non-archived session
 * that recorded at least one of temperature / pressure / altitude, or null.
 */
export async function latestSessionAtmo(loadVersionId: string): Promise<{
  tempF: number | null;
  pressureInHg: number | null;
  altitudeFt: number | null;
  humidityPct: number | null;
} | null> {
  const versionIds = await lineageVersionIds(loadVersionId);
  const rows = await db
    .select({
      tempF: rangeSessions.tempF,
      pressureInHg: rangeSessions.pressureInHg,
      altitudeFt: rangeSessions.altitudeFt,
      humidityPct: rangeSessions.humidityPct,
    })
    .from(rangeSessions)
    .where(
      and(inArray(rangeSessions.loadVersionId, versionIds), isNull(rangeSessions.archivedAt)),
    )
    .orderBy(desc(rangeSessions.date));
  for (const r of rows) {
    if (r.tempF != null || r.pressureInHg != null || r.altitudeFt != null) {
      return {
        tempF: r.tempF,
        pressureInHg: r.pressureInHg,
        altitudeFt: r.altitudeFt,
        humidityPct: r.humidityPct,
      };
    }
  }
  return null;
}

/**
 * Wind from the most recent logged session for this load's version lineage —
 * used by range cards with useLoggedWind enabled. Returns the newest (by date)
 * non-archived session that recorded a wind speed, or null.
 */
export async function latestSessionWind(loadVersionId: string): Promise<{
  windSpeedMph: number | null;
  windDirClock: number | null;
} | null> {
  const versionIds = await lineageVersionIds(loadVersionId);
  const rows = await db
    .select({
      windSpeedMph: rangeSessions.windSpeedMph,
      windDirClock: rangeSessions.windDirClock,
    })
    .from(rangeSessions)
    .where(
      and(inArray(rangeSessions.loadVersionId, versionIds), isNull(rangeSessions.archivedAt)),
    )
    .orderBy(desc(rangeSessions.date));
  for (const r of rows) {
    if (r.windSpeedMph != null) {
      return { windSpeedMph: r.windSpeedMph, windDirClock: r.windDirClock };
    }
  }
  return null;
}

export async function createSession(
  data: Omit<NewRangeSession, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<RangeSession> {
  const t = now();
  const row: NewRangeSession = { ...data, id: newId(), createdAt: t, updatedAt: t };
  mutate((tx) => insertRow(tx, 'rangeSessions', row));
  return row as RangeSession;
}

export async function updateSession(
  id: string,
  data: Partial<Omit<NewRangeSession, 'id' | 'createdAt' | 'updatedAt'>>,
): Promise<void> {
  mutate((tx) => updateRow(tx, 'rangeSessions', id, data));
}

export async function archiveSession(id: string): Promise<void> {
  mutate((tx) => {
    // Guarded like every other archiver, so re-archiving no longer moves
    // archivedAt forward (this one was missing the check).
    const [existing] = tx
      .select({ id: rangeSessions.id })
      .from(rangeSessions)
      .where(and(eq(rangeSessions.id, id), isNull(rangeSessions.archivedAt)))
      .all();
    if (!existing) return;
    updateRow(tx, 'rangeSessions', id, { archivedAt: now() });
  });
}

export async function addDopeEntry(
  data: Omit<NewDopeEntry, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<DopeEntry> {
  const t = now();
  const row: NewDopeEntry = { ...data, id: newId(), createdAt: t, updatedAt: t };
  mutate((tx) => insertRow(tx, 'dopeEntries', row));
  return row as DopeEntry;
}

/**
 * Hard delete, plus a tombstone so the row cannot come back from another
 * device on the next sync.
 */
export async function deleteDopeEntry(id: string): Promise<void> {
  mutate((tx) => deleteRow(tx, 'dopeEntries', id));
}

/**
 * Log a confirmed hold straight from the range card, without making the
 * shooter go create a session first. Reuses today's session for this rifle +
 * load if one exists (so a day's confirmations group naturally); otherwise
 * opens one silently. Returns the session used.
 */
export async function quickAddDope(params: {
  rifleId: string;
  loadVersionId: string | null;
  distanceYd: number;
  elevationHold: number | null;
  windageHold: number | null;
  holdUnit: 'MIL' | 'MOA';
  confirmed: boolean;
  notes?: string | null;
}): Promise<{ sessionId: string; createdSession: boolean }> {
  const t = now();
  const startOfDay = new Date(t);
  startOfDay.setHours(0, 0, 0, 0);

  return mutate((tx) => {
    const candidates = tx
      .select()
      .from(rangeSessions)
      .where(
        and(
          eq(rangeSessions.rifleId, params.rifleId),
          isNull(rangeSessions.archivedAt),
          params.loadVersionId == null
            ? isNull(rangeSessions.loadVersionId)
            : eq(rangeSessions.loadVersionId, params.loadVersionId),
        ),
      )
      .orderBy(desc(rangeSessions.date))
      .limit(1)
      .all();

    // Prefer a session the user already has open today, auto-created or not.
    const todays = candidates.find((s) => s.date >= startOfDay);
    let sessionId = todays?.id;
    let createdSession = false;

    if (!sessionId) {
      // Derived, not random: two devices at the same bench on the same day
      // converge on one session instead of creating one each. See autoSession.ts.
      sessionId = autoSessionId(params.rifleId, params.loadVersionId, t);

      const [already] = tx
        .select({ id: rangeSessions.id })
        .from(rangeSessions)
        .where(eq(rangeSessions.id, sessionId))
        .all();

      if (!already) {
        insertRow(tx, 'rangeSessions', {
          id: sessionId,
          rifleId: params.rifleId,
          loadVersionId: params.loadVersionId,
          date: t,
          location: null,
          tempF: null,
          pressureInHg: null,
          altitudeFt: null,
          humidityPct: null,
          windSpeedMph: null,
          windDirClock: null,
          targetPhotoUri: null,
          notes: 'Started from the range card',
          createdAt: t,
          updatedAt: t,
        });
        createdSession = true;
      }
    }

    insertRow(tx, 'dopeEntries', {
      id: newId(),
      sessionId,
      distanceYd: params.distanceYd,
      elevationHold: params.elevationHold,
      windageHold: params.windageHold,
      holdUnit: params.holdUnit,
      groupSizeIn: null,
      poiUpIn: null,
      poiRightIn: null,
      confirmed: params.confirmed,
      notes: params.notes ?? null,
      createdAt: t,
      updatedAt: t,
    });

    return { sessionId, createdSession };
  });
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

  // One transaction so a string can never be committed without its shots — the
  // cached avg/sd/es on the string row would otherwise describe data that is
  // not there.
  mutate((tx) => {
    insertRow(tx, 'shotStrings', {
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
      insertRows(
        tx,
        'shots',
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
  });

  return stringId;
}

/**
 * Deletes a string and its shots, tombstoning each row.
 *
 * The shots are deleted one at a time rather than with a single
 * `WHERE stringId = ?`: a bulk delete leaves no per-row tombstone, so every
 * shot would be resurrected from another device on the next sync while the
 * string that owned them stayed deleted.
 */
export async function deleteShotString(id: string): Promise<void> {
  mutate((tx) => {
    const children = tx.select({ id: shots.id }).from(shots).where(eq(shots.stringId, id)).all();
    for (const child of children) deleteRow(tx, 'shots', child.id);
    deleteRow(tx, 'shotStrings', id);
  });
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
