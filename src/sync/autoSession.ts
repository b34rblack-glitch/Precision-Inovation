// Deterministic id for the range session that `quickAddDope` opens on the
// shooter's behalf.
//
// Logging a hold straight from the range card silently creates "today's
// session" if one does not exist. With two devices at the same bench that would
// mint two different session UUIDs for the same afternoon, and the merge engine
// has no way to tell they are the same thing — the user would end up with two
// half-populated sessions for one range trip.
//
// Deriving the id from (rifle, load version, calendar day) makes both devices
// arrive at the same id independently, so the rows merge into a single session
// with no coordination. The id is plain TEXT like every other primary key in
// the schema, so nothing else needs to change.
//
// Known limit: this uses the device's local calendar day, so two devices in
// different time zones shooting across local midnight still split. That is rare
// and harmless — two real sessions is a cosmetic problem, not a data-loss one.
//
// PURE: no imports. Vendored verbatim by the desktop app, which must produce
// byte-identical ids.

export const AUTO_SESSION_PREFIX = 'auto:';

function yyyymmdd(d: Date): string {
  const y = d.getFullYear().toString().padStart(4, '0');
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}${m}${day}`;
}

export function autoSessionId(
  rifleId: string,
  loadVersionId: string | null,
  when: Date,
): string {
  return `${AUTO_SESSION_PREFIX}${rifleId}:${loadVersionId ?? 'none'}:${yyyymmdd(when)}`;
}

/** True for sessions the app opened itself rather than the user creating one. */
export function isAutoSessionId(id: string): boolean {
  return id.startsWith(AUTO_SESSION_PREFIX);
}
