import { solveTrajectory } from '@/lib/ballistics/solver';
import { BallisticInput, TrajectoryPoint } from '@/lib/ballistics/types';
import { holdToUnit, TurretUnit } from '@/lib/units';

// The product differentiator: the card is solver prediction everywhere,
// overridden by what the shooter actually confirmed on steel/paper.

export type ObservedDope = {
  distanceYd: number;
  elevationHold: number | null;
  windageHold: number | null;
  holdUnit: TurretUnit | null;
  /** Used to break ties: most recent confirmation wins. */
  recordedAt: Date;
};

export type CardRow = {
  distanceYd: number;
  /** Elevation hold in the requested turret unit. */
  elevation: number;
  /** True when elevation comes from observed DOPE rather than the solver. */
  confirmed: boolean;
  /** Solver prediction in the same unit — shown small under a confirmed hold when they differ. */
  predictedElevation: number;
  /** Windage hold for the card's reference crosswind (per 10 mph unless noted). */
  wind10Mph: number;
  wind5Mph: number;
  velocityFps: number;
  energyFtLb: number | null;
  dropIn: number;
  tofS: number;
  mach: number;
};

/** Distance match window for treating an observation as "this row": ±2%. */
const MATCH_TOLERANCE = 0.02;

function pickObservation(
  observations: ObservedDope[],
  distanceYd: number,
): ObservedDope | undefined {
  const window = distanceYd * MATCH_TOLERANCE;
  const candidates = observations.filter(
    (o) => Math.abs(o.distanceYd - distanceYd) <= window && o.elevationHold != null,
  );
  if (candidates.length === 0) return undefined;
  return candidates.reduce((a, b) => (b.recordedAt > a.recordedAt ? b : a));
}

export function buildCardRows(params: {
  solverInput: Omit<BallisticInput, 'windMph'>;
  observations: ObservedDope[];
  turretUnit: TurretUnit;
}): CardRow[] {
  const { solverInput, observations, turretUnit } = params;
  // One solve at 10 mph full-value crosswind; wind scales linearly enough
  // across shooting conditions that 5 mph is half the 10 mph hold.
  const points = solveTrajectory({ ...solverInput, windMph: 10 });

  return points.map((p) => {
    const predictedElevation = toUnit(p, turretUnit);
    const obs = pickObservation(observations, p.distanceYd);
    const confirmedElevation =
      obs && obs.elevationHold != null
        ? holdToUnit(obs.elevationHold, obs.holdUnit ?? turretUnit, turretUnit)
        : null;
    const wind10 = turretUnit === 'MIL' ? Math.abs(p.windMil) : Math.abs(p.windMoa);
    return {
      distanceYd: p.distanceYd,
      elevation: confirmedElevation ?? predictedElevation,
      confirmed: confirmedElevation != null,
      predictedElevation,
      wind10Mph: wind10,
      wind5Mph: wind10 / 2,
      velocityFps: p.velocityFps,
      energyFtLb: p.energyFtLb,
      dropIn: p.dropIn,
      tofS: p.tofS,
      mach: p.mach,
    };
  });
}

function toUnit(p: TrajectoryPoint, unit: TurretUnit): number {
  return unit === 'MIL' ? p.dropMil : p.dropMoa;
}

/**
 * MV truing: find the muzzle velocity that best explains the confirmed
 * elevation holds (golden-section search over ±150 fps). Returns null when
 * there is nothing useful to true against (needs >= 1 confirmed hold at
 * 300 yd or beyond — closer holds barely constrain MV).
 */
export function trueMuzzleVelocity(params: {
  solverInput: Omit<BallisticInput, 'windMph'>;
  observations: ObservedDope[];
  turretUnit: TurretUnit;
}): number | null {
  const { solverInput, observations, turretUnit } = params;
  const usable = observations.filter(
    (o) => o.elevationHold != null && o.distanceYd >= 300,
  );
  if (usable.length === 0) return null;

  const targetHolds = usable.map((o) => ({
    distanceYd: o.distanceYd,
    holdMilOrMoa: holdToUnit(o.elevationHold!, o.holdUnit ?? turretUnit, turretUnit),
  }));
  const maxDistance = Math.max(...targetHolds.map((t) => t.distanceYd));

  const error = (mvFps: number): number => {
    const points = solveTrajectory({
      ...solverInput,
      mvFps,
      maxDistanceYd: maxDistance,
      stepYd: 1,
      windMph: 0,
    });
    return targetHolds.reduce((sum, t) => {
      const p = points[Math.min(Math.round(t.distanceYd) - 1, points.length - 1)];
      if (!p) return sum;
      const predicted = toUnit(p, turretUnit);
      return sum + (predicted - t.holdMilOrMoa) ** 2;
    }, 0);
  };

  // Golden-section search on a unimodal error surface.
  const phi = (Math.sqrt(5) - 1) / 2;
  let lo = solverInput.mvFps - 150;
  let hi = solverInput.mvFps + 150;
  let c = hi - phi * (hi - lo);
  let d = lo + phi * (hi - lo);
  let fc = error(c);
  let fd = error(d);
  for (let i = 0; i < 24 && hi - lo > 1; i++) {
    if (fc < fd) {
      hi = d;
      d = c;
      fd = fc;
      c = hi - phi * (hi - lo);
      fc = error(c);
    } else {
      lo = c;
      c = d;
      fc = fd;
      d = lo + phi * (hi - lo);
      fd = error(d);
    }
  }
  return Math.round((lo + hi) / 2);
}
