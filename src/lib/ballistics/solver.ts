import { computeAtmosphere } from './atmosphere';
import { dragCoefficient } from './dragTables';
import { BallisticInput, TrajectoryPoint } from './types';
import {
  fpsToMps,
  grainsToKg,
  inchesToMilAtRange,
  inToM,
  jToFtLb,
  milToMoa,
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

const KG_M2_PER_LB_IN2 = 703.06958;
const G = 9.80665;
const DT = 0.001; // s — ~1500 steps to 1000 yd, <10 ms on-device

type Vec3 = { x: number; y: number; z: number };
type State = { pos: Vec3; vel: Vec3 };

type Env = {
  densityKgM3: number;
  speedOfSoundMps: number;
  bcKgM2: number;
  bcModel: 'G1' | 'G7';
  windMps: number; // crosswind along +z
};

function accel(vel: Vec3, env: Env): Vec3 {
  // Drag acts along the velocity relative to the air mass.
  const rx = vel.x;
  const ry = vel.y;
  const rz = vel.z - env.windMps;
  const speed = Math.sqrt(rx * rx + ry * ry + rz * rz);
  if (speed === 0) return { x: 0, y: -G, z: 0 };
  const mach = speed / env.speedOfSoundMps;
  const cd = dragCoefficient(env.bcModel, mach);
  const decel = (Math.PI / 8) * env.densityKgM3 * speed * speed * (cd / env.bcKgM2);
  const k = decel / speed;
  return { x: -k * rx, y: -k * ry - G, z: -k * rz };
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

export function solveTrajectory(input: BallisticInput): TrajectoryPoint[] {
  const atmo = computeAtmosphere(input.atmo);
  const env: Env = {
    densityKgM3: atmo.densityKgM3,
    speedOfSoundMps: atmo.speedOfSoundMps,
    bcKgM2: input.bc * KG_M2_PER_LB_IN2,
    bcModel: input.bcModel,
    windMps: mphToMps(input.windMph ?? 0),
  };
  const mvMps = fpsToMps(input.mvFps);
  const startYM = -inToM(input.sightHeightIn);

  const zeroAngle = solveZeroAngle({
    mvMps,
    startYM,
    zeroDistanceM: ydToM(input.zeroDistanceYd),
    env,
  });

  const distancesYd: number[] = [];
  for (let d = input.stepYd; d <= input.maxDistanceYd + 1e-9; d += input.stepYd) {
    distancesYd.push(Number(d.toFixed(4)));
  }
  const samples = integrate(zeroAngle, mvMps, startYM, env, distancesYd.map(ydToM));

  const massKg = input.bulletWeightGr ? grainsToKg(input.bulletWeightGr) : null;

  return samples.map((s, i) => {
    const distanceYd = distancesYd[i]!;
    const dropIn = mToIn(s.yM);
    const windIn = mToIn(s.zM);
    // Hold corrects the drop: bullet low (drop negative) → positive dial-up.
    const dropMil = inchesToMilAtRange(-dropIn, distanceYd);
    const windMil = inchesToMilAtRange(windIn, distanceYd);
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
    };
  });
}
