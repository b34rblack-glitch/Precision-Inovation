// Rules that hang off the rifle profile's chamber, optic and zero fields.
// Pure (no React Native, no database) so each one is tested on fixtures and
// the screens only render what comes back.

import type { LandsMeasurement } from '@/db/schema';

export type BulletRef = {
  make: string | null | undefined;
  model: string | null | undefined;
  weightGr: number | null | undefined;
};

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();

/** Same bullet: make and model match ignoring case and spacing, weight within 0.5 gr. */
export function sameBullet(a: BulletRef, b: BulletRef): boolean {
  if (norm(a.make) !== norm(b.make) || norm(a.model) !== norm(b.model)) return false;
  if (a.weightGr == null || b.weightGr == null) return a.weightGr == b.weightGr;
  return Math.abs(a.weightGr - b.weightGr) < 0.5;
}

const ms = (d: Date | number) => (d instanceof Date ? d.getTime() : Number(d));

/** The newest touch-the-lands reading for this bullet in this rifle, if any. */
export function latestLandsForBullet(
  entries: readonly LandsMeasurement[],
  bullet: BulletRef,
): LandsMeasurement | null {
  let best: LandsMeasurement | null = null;
  for (const e of entries) {
    if (!sameBullet({ make: e.bulletMake, model: e.bulletModel, weightGr: e.bulletWeightGr }, bullet)) continue;
    if (!best || ms(e.measuredAt) > ms(best.measuredAt)) best = e;
  }
  return best;
}

const thou = (x: number) => Math.round(x * 1000) / 1000;

/** Jump off the lands for a round seated to `seatedCbtoIn`; negative is a jam. */
export const jumpFromTouch = (touchCbtoIn: number, seatedCbtoIn: number): number =>
  thou(touchCbtoIn - seatedCbtoIn);

/** Where to seat for a given jump (negative jump = jam). */
export const cbtoForJump = (touchCbtoIn: number, jumpIn: number): number => thou(touchCbtoIn - jumpIn);

/**
 * The comparator reading a sized case should show after this shoulder bump.
 * Headspace is read to the half-thousandth, so this keeps four decimals.
 */
export const sizedHeadspace = (firedHeadspaceIn: number, bumpIn: number): number =>
  Math.round((firedHeadspaceIn - bumpIn) * 10000) / 10000;

/** True when a loaded round is longer than the magazine allows. */
export const exceedsMagazine = (coalIn: number | null, magazineMaxCoalIn: number | null): boolean =>
  coalIn != null && magazineMaxCoalIn != null && coalIn > magazineMaxCoalIn + 1e-9;

/**
 * Rounds fired: the baseline the user entered plus every recorded shot count
 * on this rifle's chronograph strings (sessions and workups alike). Shots
 * fired without a chronograph are not counted; the baseline is where to add
 * them.
 */
export function roundCount(baseline: number | null | undefined, shotCounts: readonly (number | null)[]): number {
  let total = baseline ?? 0;
  for (const n of shotCounts) if (n != null && n > 0) total += n;
  return total;
}

/** Whole days since the zero was last confirmed; null when it never was. */
export function zeroAgeDays(zeroVerifiedAt: Date | number | null | undefined, now: Date | number): number | null {
  if (zeroVerifiedAt == null) return null;
  return Math.max(0, Math.floor((ms(now) - ms(zeroVerifiedAt)) / 86_400_000));
}

/**
 * Whether a DOPE entry at `distanceYd` counts as confirming the zero: it is
 * confirmed, and within 2% of the rifle's zero distance (the same window the
 * range card uses to match an observation to a row).
 */
export function confirmsZero(
  entry: { distanceYd: number; confirmed: boolean },
  zeroDistanceYd: number,
): boolean {
  if (!entry.confirmed || !(zeroDistanceYd > 0)) return false;
  return Math.abs(entry.distanceYd - zeroDistanceYd) <= zeroDistanceYd * 0.02;
}

/**
 * Snap a hold to the turret's click. Null click (not recorded) returns the
 * value unchanged, so the card keeps its full-precision holds until the
 * scope's click value is entered.
 */
export function roundToClick(value: number, clickValue: number | null | undefined): number {
  if (clickValue == null || !(clickValue > 0)) return value;
  return Math.round(value / clickValue) * clickValue;
}
