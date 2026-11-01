import { describe, expect, it } from 'vitest';
import type { LandsMeasurement } from '@/db/schema';
import {
  cbtoForJump,
  confirmsZero,
  exceedsMagazine,
  jumpFromTouch,
  latestLandsForBullet,
  roundCount,
  roundToClick,
  sameBullet,
  sizedHeadspace,
  zeroAgeDays,
} from '@/lib/rifle/profile';

const entry = (o: Partial<LandsMeasurement>): LandsMeasurement =>
  ({ bulletMake: 'Hornady', bulletModel: 'ELD-X', bulletWeightGr: 212, cbtoIn: 2.931, measuredAt: new Date('2026-10-29'), ...o }) as LandsMeasurement;

describe('sameBullet and latestLandsForBullet', () => {
  it('matches make and model ignoring case and spacing, weight within half a grain', () => {
    const a = { make: 'Hornady', model: 'ELD-X', weightGr: 212 };
    expect(sameBullet(a, { make: ' hornady ', model: 'eld-x', weightGr: 212.2 })).toBe(true);
    expect(sameBullet(a, { make: 'Hornady', model: 'ELD-M', weightGr: 212 })).toBe(false);
    expect(sameBullet(a, { make: 'Hornady', model: 'ELD-X', weightGr: 208 })).toBe(false);
    expect(sameBullet({ ...a, weightGr: null }, { ...a, weightGr: null })).toBe(true);
    expect(sameBullet({ ...a, weightGr: null }, a)).toBe(false);
  });

  it('returns the newest reading for the bullet, or null', () => {
    const entries = [
      entry({ id: 'old', cbtoIn: 2.925, measuredAt: new Date('2026-06-01') }),
      entry({ id: 'new', cbtoIn: 2.931, measuredAt: new Date('2026-10-29') }),
      entry({ id: 'other', bulletModel: 'ELD-M', cbtoIn: 2.9 }),
    ];
    expect(latestLandsForBullet(entries, { make: 'hornady', model: 'ELD-X', weightGr: 212 })?.id).toBe('new');
    expect(latestLandsForBullet(entries, { make: 'Berger', model: 'Elite Hunter', weightGr: 205 })).toBeNull();
  });
});

describe('seating and sizing arithmetic', () => {
  it('derives jump from touch and CBTO, and CBTO from jump, to a thousandth', () => {
    expect(jumpFromTouch(2.931, 2.911)).toBe(0.02);
    expect(jumpFromTouch(2.931, 2.941)).toBe(-0.01);
    expect(cbtoForJump(2.931, 0.02)).toBe(2.911);
    expect(cbtoForJump(2.931, -0.005)).toBe(2.936);
  });

  it('sizes headspace by the bump and flags magazine overruns', () => {
    expect(sizedHeadspace(1.6185, 0.002)).toBe(1.617);
    expect(exceedsMagazine(3.72, 3.7)).toBe(true);
    expect(exceedsMagazine(3.7, 3.7)).toBe(false);
    expect(exceedsMagazine(null, 3.7)).toBe(false);
    expect(exceedsMagazine(3.9, null)).toBe(false);
  });
});

describe('round count, zero age and clicks', () => {
  it('adds every recorded shot count to the baseline', () => {
    expect(roundCount(250, [5, null, 10, 0])).toBe(265);
    expect(roundCount(null, [])).toBe(0);
  });

  it('reports whole days since the zero was confirmed', () => {
    const now = new Date('2026-11-01T12:00:00Z');
    expect(zeroAgeDays(null, now)).toBeNull();
    expect(zeroAgeDays(new Date('2026-10-29T08:00:00Z'), now)).toBe(3);
    expect(zeroAgeDays(now, now)).toBe(0);
  });

  it('counts a confirmed hold within 2% of the zero distance as a zero check', () => {
    expect(confirmsZero({ distanceYd: 100, confirmed: true }, 100)).toBe(true);
    expect(confirmsZero({ distanceYd: 101.5, confirmed: true }, 100)).toBe(true);
    expect(confirmsZero({ distanceYd: 105, confirmed: true }, 100)).toBe(false);
    expect(confirmsZero({ distanceYd: 100, confirmed: false }, 100)).toBe(false);
    expect(confirmsZero({ distanceYd: 100, confirmed: true }, 0)).toBe(false);
  });

  it('snaps to the click only when one is recorded', () => {
    expect(roundToClick(2.43, 0.1)).toBeCloseTo(2.4, 9);
    expect(roundToClick(8.6, 0.25)).toBe(8.5);
    expect(roundToClick(8.63, 0.25)).toBe(8.75);
    expect(roundToClick(2.43, null)).toBe(2.43);
    expect(roundToClick(2.43, 0)).toBe(2.43);
  });
});
