import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/db/client';
import { dopeEntries, loadVersions, rangeSessions, shotStrings, workups, workupSteps } from '@/db/schema';

// Read-only queries behind the load comparison screen. Everything a rifle's
// loads ever produced is a few hundred rows on a personal device, so the
// child tables come back whole and the pure model joins them.

export function sessionsForRifleQuery(rifleId: string) {
  return db
    .select()
    .from(rangeSessions)
    .where(and(eq(rangeSessions.rifleId, rifleId), isNull(rangeSessions.archivedAt)));
}

export function workupsForRifleQuery(rifleId: string) {
  return db.select().from(workups).where(and(eq(workups.rifleId, rifleId), isNull(workups.archivedAt)));
}

export const allLoadVersionsQuery = () => db.select().from(loadVersions);
export const allShotStringsQuery = () => db.select().from(shotStrings);
export const allDopeEntriesQuery = () => db.select().from(dopeEntries);
export const allWorkupStepsQuery = () => db.select().from(workupSteps);
