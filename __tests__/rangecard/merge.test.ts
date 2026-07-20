import { describe, expect, it } from 'vitest';
import { buildCardRows, ObservedDope, trueMuzzleVelocity } from '@/lib/rangecard/merge';
import { BallisticInput } from '@/lib/ballistics/types';

const solverInput: Omit<BallisticInput, 'windMph'> = {
  mvFps: 2700,
  bc: 0.3,
  bcModel: 'G7',
  zeroDistanceYd: 100,
  sightHeightIn: 1.8,
  atmo: { tempF: 59, pressureInHg: 29.9213 },
  maxDistanceYd: 800,
  stepYd: 100,
  bulletWeightGr: 140,
};

const obs = (
  distanceYd: number,
  elevationHold: number,
  recordedAt: Date,
  holdUnit: 'MIL' | 'MOA' = 'MIL',
): ObservedDope => ({
  distanceYd,
  elevationHold,
  windageHold: null,
  holdUnit,
  recordedAt,
});

describe('range card merge', () => {
  it('predicted rows are marked PRED and match the solver', () => {
    const rows = buildCardRows({ solverInput, observations: [], turretUnit: 'MIL' });
    expect(rows).toHaveLength(8);
    expect(rows.every((r) => !r.confirmed)).toBe(true);
    expect(rows.every((r) => r.elevation === r.predictedElevation)).toBe(true);
  });

  it('a confirmed observation overrides the prediction at its distance', () => {
    const rows = buildCardRows({
      solverInput,
      observations: [obs(600, 3.7, new Date('2026-07-01'))],
      turretUnit: 'MIL',
    });
    const row600 = rows.find((r) => r.distanceYd === 600)!;
    expect(row600.confirmed).toBe(true);
    expect(row600.elevation).toBe(3.7);
    expect(row600.predictedElevation).not.toBe(3.7);
    expect(rows.filter((r) => r.confirmed)).toHaveLength(1);
  });

  it('observation within ±2% of a row distance matches that row', () => {
    const rows = buildCardRows({
      solverInput,
      observations: [obs(595, 3.6, new Date('2026-07-01'))],
      turretUnit: 'MIL',
    });
    expect(rows.find((r) => r.distanceYd === 600)!.confirmed).toBe(true);
  });

  it('observation outside the window does not match', () => {
    const rows = buildCardRows({
      solverInput,
      observations: [obs(570, 3.4, new Date('2026-07-01'))],
      turretUnit: 'MIL',
    });
    expect(rows.find((r) => r.distanceYd === 600)!.confirmed).toBe(false);
  });

  it('most recent confirmation wins', () => {
    const rows = buildCardRows({
      solverInput,
      observations: [
        obs(600, 3.5, new Date('2026-05-01')),
        obs(600, 3.8, new Date('2026-07-01')),
      ],
      turretUnit: 'MIL',
    });
    expect(rows.find((r) => r.distanceYd === 600)!.elevation).toBe(3.8);
  });

  it('MOA observations convert onto a MIL card', () => {
    const rows = buildCardRows({
      solverInput,
      observations: [obs(600, 12.0, new Date('2026-07-01'), 'MOA')],
      turretUnit: 'MIL',
    });
    const row = rows.find((r) => r.distanceYd === 600)!;
    expect(row.confirmed).toBe(true);
    expect(row.elevation).toBeCloseTo(12 / 3.43774677, 4);
  });

  it('5 mph wind hold is half the 10 mph hold', () => {
    const rows = buildCardRows({ solverInput, observations: [], turretUnit: 'MIL' });
    for (const r of rows) {
      expect(r.wind5Mph).toBeCloseTo(r.wind10Mph / 2, 10);
    }
  });
});

describe('MV truing', () => {
  it('recovers a synthetic MV offset within ±10 fps', () => {
    // Generate "observed" DOPE from the solver at MV+40 fps, then check the
    // truing search finds that faster velocity from the holds alone.
    const trueMv = solverInput.mvFps + 40;
    const truthRows = buildCardRows({
      solverInput: { ...solverInput, mvFps: trueMv },
      observations: [],
      turretUnit: 'MIL',
    });
    const observations: ObservedDope[] = [400, 600, 800].map((d) =>
      obs(d, truthRows.find((r) => r.distanceYd === d)!.predictedElevation, new Date()),
    );
    const recovered = trueMuzzleVelocity({ solverInput, observations, turretUnit: 'MIL' });
    expect(recovered).not.toBeNull();
    expect(Math.abs(recovered! - trueMv)).toBeLessThanOrEqual(10);
  });

  it('returns null with no usable long-range holds', () => {
    expect(
      trueMuzzleVelocity({
        solverInput,
        observations: [obs(100, 0, new Date()), obs(200, 0.5, new Date())],
        turretUnit: 'MIL',
      }),
    ).toBeNull();
  });
});
