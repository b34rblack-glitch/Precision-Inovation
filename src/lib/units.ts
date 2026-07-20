// Single source of truth for every unit conversion in the app.
// The ballistics engine computes in SI; UI displays per-rifle units;
// the database stores canonical shooter units (grains, inches, fps, °F, yards).

export type TurretUnit = 'MIL' | 'MOA';
export type DistanceUnit = 'yd' | 'm';

// --- length ---
export const IN_PER_YD = 36;
export const M_PER_YD = 0.9144;
export const M_PER_IN = 0.0254;
export const M_PER_FT = 0.3048;

export const ydToM = (yd: number) => yd * M_PER_YD;
export const mToYd = (m: number) => m / M_PER_YD;
export const inToM = (i: number) => i * M_PER_IN;
export const mToIn = (m: number) => m / M_PER_IN;
export const ftToM = (ft: number) => ft * M_PER_FT;

export const distanceToYd = (value: number, unit: DistanceUnit) =>
  unit === 'yd' ? value : mToYd(value);
export const ydToDistance = (yd: number, unit: DistanceUnit) =>
  unit === 'yd' ? yd : ydToM(yd);

// --- mass ---
export const KG_PER_GRAIN = 0.00006479891;
export const grainsToKg = (gr: number) => gr * KG_PER_GRAIN;
export const grainsToLb = (gr: number) => gr / 7000;

// --- velocity ---
export const MPS_PER_FPS = 0.3048;
export const fpsToMps = (fps: number) => fps * MPS_PER_FPS;
export const mpsToFps = (mps: number) => mps / MPS_PER_FPS;
export const mphToMps = (mph: number) => mph * 0.44704;

// --- temperature ---
export const fToC = (f: number) => ((f - 32) * 5) / 9;
export const fToK = (f: number) => fToC(f) + 273.15;

// --- pressure ---
export const PA_PER_INHG = 3386.389;
export const inHgToPa = (inHg: number) => inHg * PA_PER_INHG;
export const paToInHg = (pa: number) => pa / PA_PER_INHG;

// --- energy ---
export const FTLB_PER_J = 0.7375621493;
export const jToFtLb = (j: number) => j * FTLB_PER_J;

// --- angular (scope adjustments) ---
// 1 MIL subtends exactly 1/1000 of the range; 1 MOA = 1/60 degree.
export const MOA_PER_MIL = 3.4377467707849396; // (1/1000) rad in MOA

export const milToMoa = (mil: number) => mil * MOA_PER_MIL;
export const moaToMil = (moa: number) => moa / MOA_PER_MIL;

/** Linear offset (inches) subtended by `mil` at `rangeYd`. 1 MIL @ 100 yd = 3.6 in. */
export const milToInchesAtRange = (mil: number, rangeYd: number) =>
  mil * (rangeYd * IN_PER_YD) / 1000;
export const inchesToMilAtRange = (inches: number, rangeYd: number) =>
  rangeYd === 0 ? 0 : (inches * 1000) / (rangeYd * IN_PER_YD);

/** Linear offset (inches) subtended by `moa` at `rangeYd`. 1 MOA @ 100 yd ≈ 1.047 in. */
export const moaToInchesAtRange = (moa: number, rangeYd: number) =>
  milToInchesAtRange(moaToMil(moa), rangeYd);
export const inchesToMoaAtRange = (inches: number, rangeYd: number) =>
  milToMoa(inchesToMilAtRange(inches, rangeYd));

export const holdToUnit = (value: number, from: TurretUnit, to: TurretUnit) => {
  if (from === to) return value;
  return from === 'MIL' ? milToMoa(value) : moaToMil(value);
};

/** Round a hold to the nearest practical click (0.1 MIL / 0.25 MOA). */
export const roundHold = (value: number, unit: TurretUnit) => {
  const step = unit === 'MIL' ? 0.1 : 0.25;
  return Math.round(value / step) * step;
};

export function formatHold(value: number, unit: TurretUnit): string {
  return unit === 'MIL' ? value.toFixed(1) : value.toFixed(2);
}
