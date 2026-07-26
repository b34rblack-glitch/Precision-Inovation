import { describe, expect, it } from 'vitest';
import { adjustMvForTemp } from '@/lib/ballistics/mvTemp';
import { solveTrajectory } from '@/lib/ballistics/solver';
import { BallisticInput } from '@/lib/ballistics/types';
import { inchesToMoaAtRange, parseTwistRate } from '@/lib/units';

const icao = { tempF: 59, pressureInHg: 29.9213, humidityPct: 0 };

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

// 175 gr .308 SMK-class bullet: the standard published spin-drift example.
const spin308 = {
  twistInPerTurn: 11.25,
  twistRight: true,
  bulletLengthIn: 1.24,
  bulletDiameterIn: 0.308,
};

const at = (points: ReturnType<typeof solveTrajectory>, yd: number) =>
  points.find((p) => p.distanceYd === yd)!;

describe('advanced effects: baseline unchanged when all effects are off', () => {
  // Exact values captured from the pre-extension solver (cross-validated
  // against js-ballistics in xval.test.ts). The new effects must default OFF
  // and leave the trajectory bit-identical.
  it('.308 G7 .243 @2600 reproduces the pre-extension trajectory exactly', () => {
    const points = solveTrajectory(base308);
    const p300 = at(points, 300);
    const p600 = at(points, 600);
    const p1000 = at(points, 1000);

    expect(p300.dropIn).toBe(-15.858455177953257);
    expect(p300.velocityFps).toBe(2073.417334851632);
    expect(p300.tofS).toBe(0.3877609538287662);
    expect(p600.dropIn).toBe(-104.68041745318479);
    expect(p600.velocityFps).toBe(1609.849106631839);
    expect(p600.dropMil).toBe(4.846315622832629);
    expect(p1000.dropIn).toBe(-432.0219979192303);
    expect(p1000.velocityFps).toBe(1088.7257476929963);
    expect(p1000.tofS).toBe(1.790973489043614);
    expect(p1000.dropMil).toBe(12.000611053311951);
  });

  it('new output fields are zero when the effects are off', () => {
    for (const p of solveTrajectory({ ...base308, windMph: 10 })) {
      expect(p.driftIn).toBe(0);
      expect(p.driftMil).toBe(0);
      expect(p.driftMoa).toBe(0);
      expect(p.aeroJumpIn).toBe(0);
    }
  });

  it('spin without bulletWeightGr is silently skipped', () => {
    const points = solveTrajectory({ ...base308, bulletWeightGr: null, spin: spin308 });
    expect(at(points, 1000).driftIn).toBe(0);
  });
});

describe('spin drift (Miller + Litz)', () => {
  it('175 gr .308 1:11.25 RH @2600: Sg ≈ 1.7–2.1, ~7–12 in right at 1000 yd', () => {
    const points = solveTrajectory({ ...base308, spin: spin308 });
    const p = at(points, 1000);
    // Back out Sg from the Litz drift formula: SD = 1.25·(Sg+1.2)·tof^1.83
    const sg = p.driftIn / (1.25 * Math.pow(p.tofS, 1.83)) - 1.2;
    expect(sg).toBeGreaterThan(1.7);
    expect(sg).toBeLessThan(2.1);
    expect(p.driftIn).toBeGreaterThan(7);
    expect(p.driftIn).toBeLessThan(12);
    // Drift grows with range and is right (+) for a right twist.
    expect(at(points, 300).driftIn).toBeGreaterThan(0);
    expect(at(points, 300).driftIn).toBeLessThan(p.driftIn);
  });

  it('left twist mirrors the drift', () => {
    const right = solveTrajectory({ ...base308, spin: spin308 });
    const left = solveTrajectory({ ...base308, spin: { ...spin308, twistRight: false } });
    expect(at(left, 1000).driftIn).toBeCloseTo(-at(right, 1000).driftIn, 10);
  });

  it('drift stays out of the wind columns', () => {
    const pure = solveTrajectory({ ...base308, windMph: 10 });
    const spun = solveTrajectory({ ...base308, windMph: 10, spin: spin308 });
    expect(at(spun, 600).windIn).toBe(at(pure, 600).windIn);
    expect(at(spun, 600).driftIn).toBeGreaterThan(0);
  });
});

describe('coriolis (closed-form Litz)', () => {
  it('horizontal at lat 45: ~3.0–3.7 in right at 1000 yd, azimuth-independent', () => {
    const north = solveTrajectory({ ...base308, coriolis: { latitudeDeg: 45, azimuthDeg: 0 } });
    const p = at(north, 1000);
    expect(p.driftIn).toBeGreaterThan(3.0);
    expect(p.driftIn).toBeLessThan(3.7);
    const east = solveTrajectory({ ...base308, coriolis: { latitudeDeg: 45, azimuthDeg: 90 } });
    expect(at(east, 1000).driftIn).toBeCloseTo(p.driftIn, 10);
  });

  it('southern hemisphere drifts left', () => {
    const south = solveTrajectory({ ...base308, coriolis: { latitudeDeg: -45, azimuthDeg: 0 } });
    expect(at(south, 1000).driftIn).toBeLessThan(-3.0);
  });

  it('Eötvös: east raises ~3–4.5 in at 1000 yd, west lowers symmetrically, north none', () => {
    const plain = solveTrajectory(base308);
    const north = solveTrajectory({ ...base308, coriolis: { latitudeDeg: 45, azimuthDeg: 0 } });
    const east = solveTrajectory({ ...base308, coriolis: { latitudeDeg: 45, azimuthDeg: 90 } });
    const west = solveTrajectory({ ...base308, coriolis: { latitudeDeg: 45, azimuthDeg: 270 } });

    const rise = at(east, 1000).dropIn - at(plain, 1000).dropIn;
    expect(rise).toBeGreaterThan(3.0);
    expect(rise).toBeLessThan(4.5);
    const fall = at(plain, 1000).dropIn - at(west, 1000).dropIn;
    expect(fall).toBeCloseTo(rise, 8);
    expect(at(north, 1000).dropIn).toBeCloseTo(at(plain, 1000).dropIn, 8);
  });
});

describe('incline', () => {
  it('30° uphill at 600 yd: hold below flat, near the improved rifleman estimate', () => {
    const flat = at(solveTrajectory(base308), 600);
    const up = at(solveTrajectory({ ...base308, inclineDeg: 30 }), 600);
    const down = at(solveTrajectory({ ...base308, inclineDeg: -30 }), 600);

    // Improved rifleman's rule: flat drop at the slant range × cos(θ).
    const estimateIn = -flat.dropIn * Math.cos((30 * Math.PI) / 180);
    for (const p of [up, down]) {
      expect(p.dropMil).toBeLessThan(flat.dropMil);
      expect(-p.dropIn).toBeGreaterThan(estimateIn * 0.85);
      expect(-p.dropIn).toBeLessThan(estimateIn * 1.15);
    }
    // Up- and downhill reductions are nearly the same (they differ only by
    // the small along-bore gravity component).
    expect(Math.abs(up.dropIn - down.dropIn)).toBeLessThan(0.05 * -flat.dropIn);
  });
});

describe('velocity-banded BC', () => {
  const segments = [
    // Deliberately unsorted: the solver must normalize.
    { minVelocityFps: 1800, bc: 0.255 },
    { minVelocityFps: 2600, bc: 0.243 },
  ];

  it('lands between the constant-low and constant-high trajectories', () => {
    const low = at(solveTrajectory({ ...base308, bc: 0.243 }), 1000);
    const high = at(solveTrajectory({ ...base308, bc: 0.255 }), 1000);
    const banded = at(solveTrajectory({ ...base308, bcSegments: segments }), 1000);
    expect(banded.dropIn).toBeGreaterThan(low.dropIn);
    expect(banded.dropIn).toBeLessThan(high.dropIn);
    expect(banded.velocityFps).toBeGreaterThan(low.velocityFps);
    expect(banded.velocityFps).toBeLessThan(high.velocityFps);
  });

  it('a single segment reproduces the single-bc run exactly', () => {
    const single = solveTrajectory(base308);
    const oneBand = solveTrajectory({
      ...base308,
      bcSegments: [{ minVelocityFps: 0, bc: 0.243 }],
    });
    for (let i = 0; i < single.length; i++) {
      expect(oneBand[i]!.dropIn).toBe(single[i]!.dropIn);
      expect(oneBand[i]!.velocityFps).toBe(single[i]!.velocityFps);
    }
  });

  it('an empty or garbage segment list falls back to the single bc', () => {
    const single = solveTrajectory(base308);
    const empty = solveTrajectory({ ...base308, bcSegments: [] });
    const garbage = solveTrajectory({
      ...base308,
      bcSegments: [{ minVelocityFps: NaN, bc: -1 }],
    });
    expect(at(empty, 1000).dropIn).toBe(at(single, 1000).dropIn);
    expect(at(garbage, 1000).dropIn).toBe(at(single, 1000).dropIn);
  });
});

describe('aerodynamic jump (Litz)', () => {
  // A 1:12 .308 (Sg ≈ 1.7) with l ≈ 4 cal: AJ ≈ 0.039 MOA/mph → ~0.39 MOA
  // at 10 mph, constant in angle across all ranges.
  const spin12 = { ...spin308, twistInPerTurn: 12 };

  it('~0.3–0.45 MOA at 10 mph, constant angular offset', () => {
    const points = solveTrajectory({ ...base308, spin: spin12, aeroJumpCrossMph: 10 });
    const moa300 = inchesToMoaAtRange(at(points, 300).aeroJumpIn, 300);
    const moa800 = inchesToMoaAtRange(at(points, 800).aeroJumpIn, 800);
    expect(Math.abs(moa300)).toBeGreaterThan(0.3);
    expect(Math.abs(moa300)).toBeLessThan(0.45);
    expect(moa800).toBeCloseTo(moa300, 8);
  });

  it('RH twist + wind from the left jumps the impact DOWN; signs flip', () => {
    const fromLeft = solveTrajectory({ ...base308, spin: spin12, aeroJumpCrossMph: 10 });
    const fromRight = solveTrajectory({ ...base308, spin: spin12, aeroJumpCrossMph: -10 });
    const leftTwist = solveTrajectory({
      ...base308,
      spin: { ...spin12, twistRight: false },
      aeroJumpCrossMph: 10,
    });
    expect(at(fromLeft, 600).aeroJumpIn).toBeLessThan(0);
    expect(at(fromRight, 600).aeroJumpIn).toBeCloseTo(-at(fromLeft, 600).aeroJumpIn, 10);
    expect(at(leftTwist, 600).aeroJumpIn).toBeCloseTo(-at(fromLeft, 600).aeroJumpIn, 10);
  });

  it('folds into dropIn so the ELEV hold is already corrected', () => {
    const plain = solveTrajectory({ ...base308, spin: spin12 });
    const jumped = solveTrajectory({ ...base308, spin: spin12, aeroJumpCrossMph: 10 });
    const p = at(jumped, 600);
    expect(p.dropIn - at(plain, 600).dropIn).toBeCloseTo(p.aeroJumpIn, 10);
  });

  it('requires spin: silently skipped without it', () => {
    const points = solveTrajectory({ ...base308, aeroJumpCrossMph: 10 });
    expect(at(points, 600).aeroJumpIn).toBe(0);
  });
});

describe('parseTwistRate', () => {
  it('accepts the common notations', () => {
    expect(parseTwistRate('1:8')).toBe(8);
    expect(parseTwistRate('1-8')).toBe(8);
    expect(parseTwistRate('1/8')).toBe(8);
    expect(parseTwistRate('8')).toBe(8);
    expect(parseTwistRate(' 1 : 7.5 ')).toBe(7.5);
    expect(parseTwistRate('11.25')).toBe(11.25);
  });

  it('rejects garbage', () => {
    expect(parseTwistRate('')).toBeNull();
    expect(parseTwistRate('fast')).toBeNull();
    expect(parseTwistRate('0')).toBeNull();
    expect(parseTwistRate('1:0')).toBeNull();
    expect(parseTwistRate('-8')).toBeNull();
    expect(parseTwistRate('1:8:9')).toBeNull();
    expect(parseTwistRate('8x')).toBeNull();
  });
});

describe('adjustMvForTemp', () => {
  it('1 fps/°F over ±40 °F', () => {
    expect(adjustMvForTemp(2600, 59, 1.0, 99)).toBe(2640);
    expect(adjustMvForTemp(2600, 59, 1.0, 19)).toBe(2560);
    expect(adjustMvForTemp(2600, 59, 0.5, 79)).toBe(2610);
  });

  it('passes mv through when any input is null', () => {
    expect(adjustMvForTemp(2600, null, 1.0, 99)).toBe(2600);
    expect(adjustMvForTemp(2600, 59, null, 99)).toBe(2600);
    expect(adjustMvForTemp(2600, 59, 1.0, null)).toBe(2600);
  });
});
