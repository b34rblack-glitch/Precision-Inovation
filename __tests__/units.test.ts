import { describe, expect, it } from 'vitest';
import {
  fpsToMps,
  grainsToKg,
  holdToUnit,
  inchesToMilAtRange,
  inchesToMoaAtRange,
  inHgToPa,
  milToInchesAtRange,
  milToMoa,
  moaToInchesAtRange,
  moaToMil,
  mpsToFps,
  mToYd,
  roundHold,
  ydToM,
} from '@/lib/units';

describe('units', () => {
  it('1 MIL subtends 3.6 inches at 100 yards', () => {
    expect(milToInchesAtRange(1, 100)).toBeCloseTo(3.6, 10);
  });

  it('1 MOA subtends ~1.047 inches at 100 yards', () => {
    expect(moaToInchesAtRange(1, 100)).toBeCloseTo(1.0471996, 5);
  });

  it('MIL/MOA round-trips', () => {
    expect(moaToMil(milToMoa(2.7))).toBeCloseTo(2.7, 12);
    expect(milToMoa(1)).toBeCloseTo(3.43774677, 6);
  });

  it('inches at range inverts', () => {
    expect(inchesToMilAtRange(milToInchesAtRange(1.8, 650), 650)).toBeCloseTo(1.8, 10);
    expect(inchesToMoaAtRange(moaToInchesAtRange(6.25, 425), 425)).toBeCloseTo(6.25, 10);
  });

  it('distance round-trips', () => {
    expect(mToYd(ydToM(875))).toBeCloseTo(875, 10);
    expect(ydToM(100)).toBeCloseTo(91.44, 10);
  });

  it('velocity round-trips and known anchors', () => {
    expect(mpsToFps(fpsToMps(2700))).toBeCloseTo(2700, 9);
    expect(fpsToMps(1000)).toBeCloseTo(304.8, 10);
  });

  it('mass and pressure anchors', () => {
    expect(grainsToKg(7000)).toBeCloseTo(0.45359237, 8);
    expect(inHgToPa(29.9213)).toBeCloseTo(101325, 0);
  });

  it('hold unit conversion', () => {
    expect(holdToUnit(1, 'MIL', 'MOA')).toBeCloseTo(3.43774677, 6);
    expect(holdToUnit(3.43774677, 'MOA', 'MIL')).toBeCloseTo(1, 6);
    expect(holdToUnit(2.4, 'MIL', 'MIL')).toBe(2.4);
  });

  it('rounds holds to real click values', () => {
    expect(roundHold(1.234, 'MIL')).toBeCloseTo(1.2, 10);
    expect(roundHold(1.26, 'MIL')).toBeCloseTo(1.3, 10);
    expect(roundHold(3.1, 'MOA')).toBeCloseTo(3.0, 10);
    expect(roundHold(3.13, 'MOA')).toBeCloseTo(3.25, 10);
  });
});
