import { computeAtmosphere } from './atmosphere';
import { dragCoefficient } from './dragTables';
import { BallisticInput, BcSegment, TrajectoryPoint } from './types';
import {
  fpsToMps,
  grainsToKg,
  inchesToMilAtRange,
  inToM,
  jToFtLb,
  milToMoa,
  moaToInchesAtRange,
  mphToMps,
  mpsToFps,
  mToIn,
  ydToM,
} from '@/lib/units';

// Point-mass 3-DOF trajectory: RK4 fixed-step integration of drag + gravity.
//
// Drag uses the form-factor (BC) method: the projectile decelerates like the
// standard G1/G7 reference projectile with the bullet's BC as its effective
// sectional density.  a = (π/8) · ρ · |v|² · Cd_std(Mach) / BC   with BC in
// kg/m² (1 lb/in² = 703.06958 kg/m²).
//
// Secondary effects (spin drift, Coriolis, aerodynamic jump) are applied as
// closed-form Litz corrections per output sample — standard practice for
// point-mass solvers, since a 3-DOF model cannot integrate them physically.
// Incline IS integrated physically (it only rotates gravity). All effects
// default OFF: with none of the new inputs, output is bit-identical to the
// plain solver.

const KG_M2_PER_LB_IN2 = 703.06958;
const G = 9.80665;
const DT = 0.001; // s — ~1500 steps to 1000 yd, <10 ms on-device

// Earth's sidereal rotation rate, rad/s.
const EARTH_OMEGA = 7.292115e-5;
// Miller's stability formula assumes standard sea-level air (59 °F,
// 29.92 inHg → 1.225 kg/m³); actual conditions scale Sg by ρ_std/ρ.
const STD_DENSITY_KG_M3 = 1.225;

type Vec3 = { x: number; y: number; z: number };
type State = { pos: Vec3; vel: Vec3 };

/** A velocity band with thresholds/BC pre-converted to SI, sorted descending. */
type BcBand = { minSpeedMps: number; bcKgM2: number };

type Env = {
  densityKgM3: number;
  speedOfSoundMps: number;
  bcKgM2: number;
  /** Velocity-banded BC, sorted by descending threshold; null = single BC. */
  bcBands: BcBand[] | null;
  bcModel: 'G1' | 'G7';
  windMps: number; // crosswind along +z
  /** Gravity along −x (slant LOS): G·sinθ. Uphill θ>0 decelerates. */
  gAlongMps2: number;
  /** Gravity along −y (perpendicular to slant LOS): G·cosθ. */
  gPerpMps2: number;
};

/** Active BC for the current air-relative speed (highest band ≤ speed). */
function bcForSpeed(env: Env, speedMps: number): number {
  const bands = env.bcBands;
  if (!bands) return env.bcKgM2;
  for (const band of bands) {
    if (speedMps >= band.minSpeedMps) return band.bcKgM2;
  }
  // Below the lowest band: keep using the lowest band's BC.
  return bands[bands.length - 1]!.bcKgM2;
}

function accel(vel: Vec3, env: Env): Vec3 {
  // Drag acts along the velocity relative to the air mass.
  const rx = vel.x;
  const ry = vel.y;
  const rz = vel.z - env.windMps;
  const speed = Math.sqrt(rx * rx + ry * ry + rz * rz);
  if (speed === 0) return { x: -env.gAlongMps2, y: -env.gPerpMps2, z: 0 };
  const mach = speed / env.speedOfSoundMps;
  const cd = dragCoefficient(env.bcModel, mach);
  const decel = (Math.PI / 8) * env.densityKgM3 * speed * speed * (cd / bcForSpeed(env, speed));
  const k = decel / speed;
  return { x: -k * rx - env.gAlongMps2, y: -k * ry - env.gPerpMps2, z: -k * rz };
}

function rk4Step(state: State, env: Env, dt: number): State {
  const { pos, vel } = state;
  const a1 = accel(vel, env);
  const v2 = { x: vel.x + (a1.x * dt) / 2, y: vel.y + (a1.y * dt) / 2, z: vel.z + (a1.z * dt) / 2 };
  const a2 = accel(v2, env);
  const v3 = { x: vel.x + (a2.x * dt) / 2, y: vel.y + (a2.y * dt) / 2, z: vel.z + (a2.z * dt) / 2 };
  const a3 = accel(v3, env);
  const v4 = { x: vel.x + a3.x * dt, y: vel.y + a3.y * dt, z: vel.z + a3.z * dt };
  const a4 = accel(v4, env);

  return {
    pos: {
      x: pos.x + (dt / 6) * (vel.x + 2 * v2.x + 2 * v3.x + v4.x),
      y: pos.y + (dt / 6) * (vel.y + 2 * v2.y + 2 * v3.y + v4.y),
      z: pos.z + (dt / 6) * (vel.z + 2 * v2.z + 2 * v3.z + v4.z),
    },
    vel: {
      x: vel.x + (dt / 6) * (a1.x + 2 * a2.x + 2 * a3.x + a4.x),
      y: vel.y + (dt / 6) * (a1.y + 2 * a2.y + 2 * a3.y + a4.y),
      z: vel.z + (dt / 6) * (a1.z + 2 * a2.z + 2 * a3.z + a4.z),
    },
  };
}

type Sample = { xM: number; yM: number; zM: number; speedMps: number; tofS: number };

/**
 * Integrate the trajectory, returning interpolated samples at each requested
 * downrange distance. Coordinates: x downrange along the (horizontal) line of
 * sight, y vertical relative to LOS, z lateral (+ right).
 */
function integrate(
  launchAngleRad: number,
  mvMps: number,
  startYM: number,
  env: Env,
  sampleXsM: number[],
): Sample[] {
  let state: State = {
    pos: { x: 0, y: startYM, z: 0 },
    vel: {
      x: mvMps * Math.cos(launchAngleRad),
      y: mvMps * Math.sin(launchAngleRad),
      z: 0,
    },
  };
  let tof = 0;
  const samples: Sample[] = [];
  let si = 0;
  const maxX = sampleXsM[sampleXsM.length - 1] ?? 0;

  // Hard stop: bullet from any rifle covers 1000 yd in well under 4 s.
  while (si < sampleXsM.length && tof < 20) {
    const prev = state;
    const prevTof = tof;
    state = rk4Step(state, env, DT);
    tof += DT;

    while (si < sampleXsM.length && state.pos.x >= sampleXsM[si]!) {
      const target = sampleXsM[si]!;
      const f = (target - prev.pos.x) / (state.pos.x - prev.pos.x || 1);
      const lerp = (a: number, b: number) => a + (b - a) * f;
      const vx = lerp(prev.vel.x, state.vel.x);
      const vy = lerp(prev.vel.y, state.vel.y);
      const vz = lerp(prev.vel.z, state.vel.z);
      samples.push({
        xM: target,
        yM: lerp(prev.pos.y, state.pos.y),
        zM: lerp(prev.pos.z, state.pos.z),
        speedMps: Math.sqrt(vx * vx + vy * vy + vz * vz),
        tofS: lerp(prevTof, tof),
      });
      si++;
    }
    if (state.pos.x > maxX + 1) break;
    // Abort if the bullet has fallen far below any plausible line of sight.
    if (state.pos.y < -1000) break;
  }
  return samples;
}

/** Launch angle (rad above LOS) that zeroes the rifle at zeroDistance. */
export function solveZeroAngle(input: {
  mvMps: number;
  startYM: number;
  zeroDistanceM: number;
  env: Env;
}): number {
  // A non-positive zero distance has no meaningful launch angle; short-circuit
  // to avoid atan2(x, 0) divergence in the Newton step below.
  if (input.zeroDistanceM <= 0) return 0;
  let angle = 0.001; // ~1 mil initial guess
  for (let i = 0; i < 5; i++) {
    const [sample] = integrate(angle, input.mvMps, input.startYM, input.env, [input.zeroDistanceM]);
    if (!sample) break;
    const missM = sample.yM;
    if (Math.abs(missM) < 0.0005) break; // 0.5 mm
    angle += Math.atan2(-missM, input.zeroDistanceM);
  }
  return angle;
}

/** Normalize user-supplied BC segments: drop garbage, sort descending, convert to SI. */
function normalizeBcBands(segments: BcSegment[] | undefined, scale: number): BcBand[] | null {
  if (!segments || segments.length === 0) return null;
  const valid = segments.filter(
    (s) => Number.isFinite(s.minVelocityFps) && Number.isFinite(s.bc) && s.bc > 0,
  );
  if (valid.length === 0) return null;
  return valid
    .slice()
    .sort((a, b) => b.minVelocityFps - a.minVelocityFps)
    .map((s) => ({
      minSpeedMps: fpsToMps(s.minVelocityFps),
      bcKgM2: s.bc * scale * KG_M2_PER_LB_IN2,
    }));
}

/** Drag scale factor, guarded to a sane positive range (1 = published BC). */
function normalizeBcScale(scale: number | undefined): number {
  if (scale == null || !Number.isFinite(scale) || scale <= 0) return 1;
  return scale;
}

/**
 * Miller gyroscopic stability factor, with Litz's velocity and atmosphere
 * corrections:
 *   Sg = 30·m / (t²·d³·l·(1+l²))  ·  (mv/2800)^(1/3)  ·  (ρ_std/ρ)
 * m in grains, d = diameter in inches, t = twist in calibers, l = length in
 * calibers. Miller assumes 2800 fps in standard sea-level air; thinner air
 * destabilizes the overturning moment less, so Sg scales with ρ_std/ρ.
 * Returns null when the inputs cannot produce a meaningful Sg.
 */
function millerStability(input: BallisticInput, densityKgM3: number): number | null {
  const spin = input.spin;
  const m = input.bulletWeightGr;
  // Spec: spin requires bulletWeightGr — skip silently when it's absent.
  if (!spin || m == null || m <= 0) return null;
  const d = spin.bulletDiameterIn;
  if (!(d > 0) || !(spin.twistInPerTurn > 0) || !(spin.bulletLengthIn > 0)) return null;
  const t = spin.twistInPerTurn / d;
  const l = spin.bulletLengthIn / d;
  const sg = (30 * m) / (t * t * d * d * d * l * (1 + l * l));
  return sg * Math.cbrt(input.mvFps / 2800) * (STD_DENSITY_KG_M3 / densityKgM3);
}

export function solveTrajectory(input: BallisticInput): TrajectoryPoint[] {
  const atmo = computeAtmosphere(input.atmo);
  // Uphill positive: gravity rotates in the slant-LOS frame. x stays along
  // the (now inclined) line of sight, so all distances remain slant ranges.
  const inclineRad = ((input.inclineDeg ?? 0) * Math.PI) / 180;
  // Drag truing scales the BC itself, so it applies to the single BC and to
  // every velocity band alike.
  const bcScale = normalizeBcScale(input.bcScale);
  const env: Env = {
    densityKgM3: atmo.densityKgM3,
    speedOfSoundMps: atmo.speedOfSoundMps,
    bcKgM2: input.bc * bcScale * KG_M2_PER_LB_IN2,
    bcBands: normalizeBcBands(input.bcSegments, bcScale),
    bcModel: input.bcModel,
    windMps: mphToMps(input.windMph ?? 0),
    gAlongMps2: G * Math.sin(inclineRad),
    gPerpMps2: G * Math.cos(inclineRad),
  };
  const mvMps = fpsToMps(input.mvFps);
  const startYM = -inToM(input.sightHeightIn);

  // Rifles are zeroed on level ground: solve the zero angle with flat
  // gravity even when the shot itself is inclined.
  const zeroAngle = solveZeroAngle({
    mvMps,
    startYM,
    zeroDistanceM: ydToM(input.zeroDistanceYd),
    env: inclineRad === 0 ? env : { ...env, gAlongMps2: 0, gPerpMps2: G },
  });

  const distancesYd: number[] = [];
  for (let d = input.stepYd; d <= input.maxDistanceYd + 1e-9; d += input.stepYd) {
    distancesYd.push(Number(d.toFixed(4)));
  }
  const samples = integrate(zeroAngle, mvMps, startYM, env, distancesYd.map(ydToM));

  const massKg = input.bulletWeightGr ? grainsToKg(input.bulletWeightGr) : null;

  // --- Spin drift (Miller Sg + Litz approximation, per sample) ---
  // Litz: SD_inches = 1.25·(Sg + 1.2)·tof^1.83, drifting RIGHT for a
  // right-hand twist, LEFT for a left-hand twist.
  const sg = millerStability(input, atmo.densityKgM3);
  const spinSign = sg != null ? (input.spin!.twistRight ? 1 : -1) : 0;

  // --- Coriolis (closed-form Litz corrections, per sample) ---
  // Horizontal: Z = Ω·X·tof·sin(lat). Positive sin(lat) (northern
  // hemisphere) deflects RIGHT regardless of azimuth; southern flips left.
  //
  // Vertical (Eötvös): the bore-relative gravity drop scales by
  //   f = 1 − 2·Ω·V0·cos(lat)·sin(Az)/g
  // (firing EAST reduces effective gravity → shoots high; WEST the reverse).
  // Our samples carry LOS-relative y, not the raw drop, so decompose:
  //   y(x) = startY + x·tan(θ0) − D(x)
  // where D(x) ≥ 0 is the drop below the extended bore line — the purely
  // gravity-driven part. Scaling D by f gives
  //   yAdj = startY + x·tanθ0 − D·(1 − 2ΩV0 cos(lat) sin(Az)/g)
  //        = y + D·(2ΩV0 cos(lat) sin(Az)/g)
  // i.e. add dropMagnitude × the Eötvös term to each sample's y.
  let sinLat = 0;
  let eotvos = 0; // 2·Ω·V0·cos(lat)·sin(Az)/g
  if (input.coriolis) {
    const latRad = (input.coriolis.latitudeDeg * Math.PI) / 180;
    const azRad = (input.coriolis.azimuthDeg * Math.PI) / 180;
    sinLat = Math.sin(latRad);
    eotvos = (2 * EARTH_OMEGA * mvMps * Math.cos(latRad) * Math.sin(azRad)) / G;
  }
  const tanZero = Math.tan(zeroAngle);

  // --- Aerodynamic jump (Litz, constant angular offset) ---
  // AJ_MOA_per_mph = 0.01·Sg − 0.0024·l + 0.032 (l in calibers).
  // Sign (Litz convention): the jump is the crosswind vector rotated 90° in
  // the spin direction — for a RIGHT twist, wind FROM the left (+mph here)
  // jumps the impact DOWN; wind from the right jumps it UP. Left twist flips.
  let aeroJumpMoa = 0;
  if (sg != null && input.aeroJumpCrossMph) {
    const l = input.spin!.bulletLengthIn / input.spin!.bulletDiameterIn;
    const ajMoaPerMph = 0.01 * sg - 0.0024 * l + 0.032;
    aeroJumpMoa = -spinSign * ajMoaPerMph * input.aeroJumpCrossMph;
  }

  return samples.map((s, i) => {
    const distanceYd = distancesYd[i]!;

    const spinDriftIn = sg != null ? spinSign * 1.25 * (sg + 1.2) * Math.pow(s.tofS, 1.83) : 0;
    const coriolisIn = input.coriolis ? mToIn(EARTH_OMEGA * s.xM * s.tofS * sinLat) : 0;
    // Drop below the extended bore line (≥ 0 in normal flight).
    const dropMagM = startYM + s.xM * tanZero - s.yM;
    const eotvosIn = input.coriolis ? mToIn(dropMagM * eotvos) : 0;
    const aeroJumpIn = aeroJumpMoa !== 0 ? moaToInchesAtRange(aeroJumpMoa, distanceYd) : 0;

    // Coriolis vertical + aero jump fold into the drop so ELEV holds are
    // already corrected; spin + Coriolis horizontal stay separate from wind.
    const dropIn = mToIn(s.yM) + eotvosIn + aeroJumpIn;
    const windIn = mToIn(s.zM);
    const driftIn = spinDriftIn + coriolisIn;
    // Hold corrects the drop: bullet low (drop negative) → positive dial-up.
    const dropMil = inchesToMilAtRange(-dropIn, distanceYd);
    const windMil = inchesToMilAtRange(windIn, distanceYd);
    const driftMil = inchesToMilAtRange(driftIn, distanceYd);
    return {
      distanceYd,
      dropIn,
      dropMil,
      dropMoa: milToMoa(dropMil),
      windIn,
      windMil,
      windMoa: milToMoa(windMil),
      velocityFps: mpsToFps(s.speedMps),
      energyFtLb: massKg != null ? jToFtLb(0.5 * massKg * s.speedMps * s.speedMps) : null,
      tofS: s.tofS,
      mach: s.speedMps / env.speedOfSoundMps,
      driftIn,
      driftMil,
      driftMoa: milToMoa(driftMil),
      aeroJumpIn,
    };
  });
}
