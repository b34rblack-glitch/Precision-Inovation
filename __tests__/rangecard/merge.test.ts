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
  createdAt?: Date,
): ObservedDope => ({
  distanceYd,
  elevationHold,
  windageHold: null,
  holdUnit,
  recordedAt,
  createdAt,
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

  it('an off-grid confirmed observation is appended as its own row, not snapped', () => {
    // grid is 100..800 step 100; 570 is outside every row's ±2% window.
    const rows = buildCardRows({
      solverInput,
      observations: [obs(570, 3.3, new Date('2026-07-01'))],
      turretUnit: 'MIL',
    });
    // The nearest grid rows keep their prediction — nothing was snapped.
    expect(rows.find((r) => r.distanceYd === 500)!.confirmed).toBe(false);
    expect(rows.find((r) => r.distanceYd === 600)!.confirmed).toBe(false);
    // A dedicated confirmed row appears at the exact observed distance.
    const row570 = rows.find((r) => Math.abs(r.distanceYd - 570) < 1e-6);
    expect(row570).toBeDefined();
    expect(row570!.confirmed).toBe(true);
    expect(row570!.elevation).toBe(3.3);
    expect(row570!.predictedElevation).not.toBe(3.3);
    // Predicted values are real solver output, incl. mach for the screens.
    expect(row570!.mach).toBeGreaterThan(0);
    expect(row570!.velocityFps).toBeGreaterThan(0);
    // Rows stay sorted and 570 lands between 500 and 600.
    const distances = rows.map((r) => r.distanceYd);
    expect(distances).toEqual([...distances].sort((a, b) => a - b));
    const idx = distances.indexOf(570);
    expect(distances[idx - 1]).toBe(500);
    expect(distances[idx + 1]).toBe(600);
    expect(rows.filter((r) => r.confirmed)).toHaveLength(1);
  });

  it('collapses multiple confirmations of the same off-grid distance to the newest', () => {
    const rows = buildCardRows({
      solverInput,
      observations: [
        obs(570, 3.1, new Date('2026-05-01')),
        obs(570, 3.4, new Date('2026-07-01')),
      ],
      turretUnit: 'MIL',
    });
    const row570 = rows.filter((r) => Math.abs(r.distanceYd - 570) < 1e-6);
    expect(row570).toHaveLength(1);
    expect(row570[0]!.elevation).toBe(3.4);
  });

  it('newest createdAt breaks a same-session (same date) tie', () => {
    const sessionDate = new Date('2026-07-01');
    const rows = buildCardRows({
      solverInput,
      observations: [
        obs(600, 3.5, sessionDate, 'MIL', new Date('2026-07-01T10:00:00')),
        obs(600, 3.9, sessionDate, 'MIL', new Date('2026-07-01T11:30:00')),
      ],
      turretUnit: 'MIL',
    });
    expect(rows.find((r) => r.distanceYd === 600)!.elevation).toBe(3.9);
  });

  it('threads the supplied atmosphere through to the solver', () => {
    const thin = buildCardRows({
      solverInput: { ...solverInput, atmo: { tempF: 95, pressureInHg: 24.9 } },
      observations: [],
      turretUnit: 'MIL',
    });
    const dense = buildCardRows({
      solverInput: { ...solverInput, atmo: { tempF: 10, pressureInHg: 30.5 } },
      observations: [],
      turretUnit: 'MIL',
    });
    const thin800 = thin.find((r) => r.distanceYd === 800)!.predictedElevation;
    const dense800 = dense.find((r) => r.distanceYd === 800)!.predictedElevation;
    // Denser air = more drag = more drop = a bigger elevation hold.
    expect(dense800).toBeGreaterThan(thin800);
    expect(dense800).not.toBeCloseTo(thin800, 2);
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
