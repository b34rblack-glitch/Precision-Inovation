import { describe, expect, it } from 'vitest';
import { ICAO_SEA_LEVEL } from '@/lib/ballistics/atmosphere';
import { solveTrajectory, solveZeroAngle } from '@/lib/ballistics/solver';
import { BallisticInput } from '@/lib/ballistics/types';
import { milToMoa } from '@/lib/units';

const icao = { tempF: ICAO_SEA_LEVEL.tempF, pressureInHg: ICAO_SEA_LEVEL.pressureInHg };

const base308: BallisticInput = {
  mvFps: 2600,
  bc: 0.243,
  bcModel: 'G7',
  zeroDistanceYd: 100,
  sightHeightIn: 1.5,
  atmo: icao,
  maxDistanceYd: 1000,
  stepYd: 100,
  bulletWeightGr: 175,
};

describe('solver: physics invariants', () => {
  it('drop at zero distance is ~0', () => {
    const points = solveTrajectory(base308);
    const at100 = points.find((p) => p.distanceYd === 100)!;
    expect(Math.abs(at100.dropIn)).toBeLessThan(0.05);
  });

  it('vacuum limit matches analytic projectile motion', () => {
    // With an absurd BC, drag vanishes: y(x) = -h + x·tanθ − g·x²/(2·v²·cos²θ)
    const input: BallisticInput = {
      ...base308,
      bc: 1e9,
      zeroDistanceYd: 100,
      maxDistanceYd: 600,
      stepYd: 300,
    };
    const points = solveTrajectory(input);
    const v = 2600 * 0.3048; // m/s
    const g = 9.80665;
    const h = 1.5 * 0.0254;
    const x0 = 91.44; // zero, m
    // zero condition: tanθ = (h + g·x0²/(2v²)) / x0  (small-angle, cosθ≈1)
    const tanTheta = (h + (g * x0 * x0) / (2 * v * v)) / x0;
    for (const p of points) {
      const x = p.distanceYd * 0.9144;
      const yM = -h + x * tanTheta - (g * x * x) / (2 * v * v);
      const yIn = yM / 0.0254;
      expect(p.dropIn).toBeCloseTo(yIn, 0); // within ~0.5 inch at 600 yd
    }
  });

  it('velocity decays monotonically and Mach tracks it', () => {
    const points = solveTrajectory(base308);
    for (let i = 1; i < points.length; i++) {
      expect(points[i]!.velocityFps).toBeLessThan(points[i - 1]!.velocityFps);
    }
    const p = points[0]!;
    expect(p.mach).toBeCloseTo((p.velocityFps * 0.3048) / 340.29, 1);
  });

  it('crosswind deflection is linear in wind speed', () => {
    const w10 = solveTrajectory({ ...base308, windMph: 10 }).find((p) => p.distanceYd === 600)!;
    const w5 = solveTrajectory({ ...base308, windMph: 5 }).find((p) => p.distanceYd === 600)!;
    expect(w10.windIn / w5.windIn).toBeCloseTo(2, 1);
  });

  it('wind deflection ~ lag rule (Didion): d = w·(t − x/v0)', () => {
    const points = solveTrajectory({ ...base308, windMph: 10 });
    const p = points.find((pt) => pt.distanceYd === 600)!;
    const windMps = 10 * 0.44704;
    const lagS = p.tofS - (600 * 0.9144) / (2600 * 0.3048);
    const expectedIn = (windMps * lagS) / 0.0254;
    expect(p.windIn).toBeGreaterThan(expectedIn * 0.85);
    expect(p.windIn).toBeLessThan(expectedIn * 1.15);
  });

  it('MOA outputs are MIL × 3.4377', () => {
    const points = solveTrajectory(base308);
    for (const p of points) {
      expect(p.dropMoa).toBeCloseTo(milToMoa(p.dropMil), 8);
    }
  });

  it('muzzle energy anchor: 175 gr at 2600 fps ≈ 2627 ft·lb', () => {
    const points = solveTrajectory({ ...base308, stepYd: 1, maxDistanceYd: 2 });
    // extrapolate: energy at 1-2 yd is within a few ft·lb of muzzle
    expect(points[0]!.energyFtLb!).toBeGreaterThan(2560);
    expect(points[0]!.energyFtLb!).toBeLessThan(2630);
  });

  it('zero distance of 0 does not throw or yield NaN', () => {
    const env = {
      densityKgM3: 1.225,
      speedOfSoundMps: 340.29,
      bcKgM2: 0.243 * 703.06958,
      bcModel: 'G7' as const,
      windMps: 0,
    };
    // The guarded solver returns a flat (zero) launch angle rather than
    // diverging through atan2(x, 0).
    expect(solveZeroAngle({ mvMps: 792, startYM: -0.0381, zeroDistanceM: 0, env })).toBe(0);

    // And the full trajectory stays finite end to end.
    const points = solveTrajectory({ ...base308, zeroDistanceYd: 0 });
    expect(points.length).toBeGreaterThan(0);
    for (const p of points) {
      expect(Number.isFinite(p.dropIn)).toBe(true);
      expect(Number.isFinite(p.dropMil)).toBe(true);
      expect(Number.isFinite(p.velocityFps)).toBe(true);
    }
  });

  it('denser (colder) air produces more drop', () => {
    const cold = solveTrajectory({ ...base308, atmo: { tempF: 0, pressureInHg: 29.92 } });
    const hot = solveTrajectory({ ...base308, atmo: { tempF: 100, pressureInHg: 29.92 } });
    const coldDrop = cold.find((p) => p.distanceYd === 800)!.dropMil;
    const hotDrop = hot.find((p) => p.distanceYd === 800)!.dropMil;
    expect(coldDrop).toBeGreaterThan(hotDrop);
  });

  it('higher BC shoots flatter', () => {
    const slick = solveTrajectory({ ...base308, bc: 0.35 });
    const brick = solveTrajectory({ ...base308, bc: 0.2 });
    expect(slick.find((p) => p.distanceYd === 800)!.dropMil).toBeLessThan(
      brick.find((p) => p.distanceYd === 800)!.dropMil,
    );
  });
});

describe('solver: reference values', () => {
  // Reference values cross-validated against js-ballistics v2 (the
  // JS port of py_ballisticcalc) — see xval.test.ts, which asserts
  // agreement to 0.5" — and consistent with the classic published
  // come-ups for these loads (.308 175 SMK ≈ 4.9 mil @ 600 /
  // ≈ 12 mil @ 1000, transonic at ~1000 yd, at ICAO sea level).
  it('.308 175 SMK (G7 .243 @ 2600) matches the validated trajectory', () => {
    const points = solveTrajectory(base308);
    const at600 = points.find((p) => p.distanceYd === 600)!;
    const at1000 = points.find((p) => p.distanceYd === 1000)!;
    expect(at600.dropMil).toBeGreaterThan(4.6);
    expect(at600.dropMil).toBeLessThan(5.1);
    expect(at1000.dropMil).toBeGreaterThan(11.5);
    expect(at1000.dropMil).toBeLessThan(12.5);
    expect(at600.velocityFps).toBeGreaterThan(1550);
    expect(at600.velocityFps).toBeLessThan(1680);
    expect(at1000.velocityFps).toBeGreaterThan(1030);
    expect(at1000.velocityFps).toBeLessThan(1150);
    // The .308 is famously right at transonic at 1000 yd
    expect(at1000.mach).toBeGreaterThan(0.9);
    expect(at1000.mach).toBeLessThan(1.1);
  });

  // 6.5 CM 140 gr class bullet, G7 0.326, MV 2710, ICAO sea level:
  // ≈ 3.9 mil at 600, ≈ 8.9 mil at 1000, comfortably supersonic at 1000.
  it('6.5 Creedmoor 140 (G7 .326 @ 2710) matches the validated trajectory', () => {
    const points = solveTrajectory({
      ...base308,
      mvFps: 2710,
      bc: 0.326,
      bulletWeightGr: 140,
    });
    const at600 = points.find((p) => p.distanceYd === 600)!;
    const at1000 = points.find((p) => p.distanceYd === 1000)!;
    expect(at600.dropMil).toBeGreaterThan(3.7);
    expect(at600.dropMil).toBeLessThan(4.2);
    expect(at1000.dropMil).toBeGreaterThan(8.4);
    expect(at1000.dropMil).toBeLessThan(9.3);
    expect(at1000.mach).toBeGreaterThan(1.2);
  });

  // .223 55 gr FMJ, G1 0.269, MV 3240: ≈ 51" of drop at 500 yd.
  it('.223 55 gr (G1 .269 @ 3240) matches the validated trajectory', () => {
    const points = solveTrajectory({
      ...base308,
      mvFps: 3240,
      bc: 0.269,
      bcModel: 'G1',
      bulletWeightGr: 55,
      maxDistanceYd: 500,
      stepYd: 100,
    });
    const at500 = points.find((p) => p.distanceYd === 500)!;
    expect(-at500.dropIn).toBeGreaterThan(46);
    expect(-at500.dropIn).toBeLessThan(57);
  });

  it('solves a 1000 yd card fast enough for on-device use', () => {
    const start = performance.now();
    solveTrajectory({ ...base308, stepYd: 25 });
    expect(performance.now() - start).toBeLessThan(250);
  });
});
