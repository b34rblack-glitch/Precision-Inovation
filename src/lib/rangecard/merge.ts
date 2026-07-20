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
  /**
   * Session date — the coarse tie-break. Every DOPE row in one session shares
   * it, so it can't distinguish confirmations logged in the same session.
   */
  recordedAt: Date;
  /**
   * Row insertion time. Preferred tie-break so the newest confirmation wins
   * even when several share a session date. Falls back to recordedAt.
   */
  createdAt?: Date | null;
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

/** Tie-break key: prefer the row's own createdAt, fall back to session date. */
function effectiveTime(o: ObservedDope): number {
  return (o.createdAt ?? o.recordedAt).getTime();
}

function pickObservation(
  observations: ObservedDope[],
  distanceYd: number,
): ObservedDope | undefined {
  const window = distanceYd * MATCH_TOLERANCE;
  const candidates = observations.filter(
    (o) => Math.abs(o.distanceYd - distanceYd) <= window && o.elevationHold != null,
  );
  if (candidates.length === 0) return undefined;
  return candidates.reduce((a, b) => (effectiveTime(b) > effectiveTime(a) ? b : a));
}

function rowFromPoint(
  p: TrajectoryPoint,
  turretUnit: TurretUnit,
  confirmedElevation: number | null,
  predictedElevation: number,
): CardRow {
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

  const gridRows = points.map((p) => {
    const predictedElevation = toUnit(p, turretUnit);
    const obs = pickObservation(observations, p.distanceYd);
    const confirmedElevation =
      obs && obs.elevationHold != null
        ? holdToUnit(obs.elevationHold, obs.holdUnit ?? turretUnit, turretUnit)
        : null;
    return rowFromPoint(p, turretUnit, confirmedElevation, predictedElevation);
  });

  // Off-grid confirmed DOPE: a confirmation that lands between grid distances
  // must NOT be snapped onto the wrong row (and must not be silently dropped).
  // Append a dedicated row at each such distance, with predicted values from a
  // fresh single-distance solve so the shooter still sees the delta.
  const gridDistances = points.map((p) => p.distanceYd);
  const isOnGrid = (d: number) =>
    gridDistances.some((g) => Math.abs(d - g) <= g * MATCH_TOLERANCE);
  const offGrid = observations.filter(
    (o) => o.elevationHold != null && o.distanceYd > 0 && !isOnGrid(o.distanceYd),
  );

  // Collapse multiple confirmations of the same off-grid distance to the newest.
  const winners = new Map<number, ObservedDope>();
  for (const o of offGrid) {
    let key = o.distanceYd;
    for (const existing of winners.keys()) {
      if (Math.abs(existing - o.distanceYd) <= existing * MATCH_TOLERANCE) {
        key = existing;
        break;
      }
    }
    const current = winners.get(key);
    if (!current || effectiveTime(o) > effectiveTime(current)) winners.set(key, o);
  }

  const extraRows = [...winners.values()].flatMap((o) => {
    const [p] = solveTrajectory({
      ...solverInput,
      windMph: 10,
      maxDistanceYd: o.distanceYd,
      stepYd: o.distanceYd,
    });
    if (!p) return [];
    const confirmedElevation = holdToUnit(o.elevationHold!, o.holdUnit ?? turretUnit, turretUnit);
    return [rowFromPoint(p, turretUnit, confirmedElevation, toUnit(p, turretUnit))];
  });

  return [...gridRows, ...extraRows].sort((a, b) => a.distanceYd - b.distanceYd);
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
