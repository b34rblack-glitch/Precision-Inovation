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
  /**
   * Signed spin drift + Coriolis horizontal total, inches (positive = impact
   * RIGHT; the hold is the opposite side). 0 when neither effect is active.
   */
  driftIn: number;
  driftMil: number;
  driftMoa: number;
  /** Signed aero-jump vertical offset, inches (+ = high). Already folded into elevation. */
  aeroJumpIn: number;
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
    driftIn: p.driftIn,
    driftMil: p.driftMil,
    driftMoa: p.driftMoa,
    aeroJumpIn: p.aeroJumpIn,
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
/** MV truing needs distance to be sensitive to velocity at all. */
export const MV_TRUE_MIN_YD = 300;
/**
 * Drag truing needs range where BC error dominates. Near the muzzle a BC
 * change barely moves the impact, so short holds would make the fit noise.
 */
export const DRAG_TRUE_MIN_YD = 400;

type TargetHold = { distanceYd: number; holdMilOrMoa: number };

function usableHolds(
  observations: ObservedDope[],
  turretUnit: TurretUnit,
  minDistanceYd: number,
): TargetHold[] {
  return observations
    .filter((o) => o.elevationHold != null && o.distanceYd >= minDistanceYd)
    .map((o) => ({
      distanceYd: o.distanceYd,
      holdMilOrMoa: holdToUnit(o.elevationHold!, o.holdUnit ?? turretUnit, turretUnit),
    }));
}

/** Sum of squared hold errors for a candidate solver input. */
function holdError(
  solverInput: Omit<BallisticInput, 'windMph'>,
  targets: TargetHold[],
  turretUnit: TurretUnit,
): number {
  const maxDistance = Math.max(...targets.map((t) => t.distanceYd));
  const points = solveTrajectory({
    ...solverInput,
    maxDistanceYd: maxDistance,
    stepYd: 1,
    windMph: 0,
  });
  return targets.reduce((sum, t) => {
    const p = points[Math.min(Math.round(t.distanceYd) - 1, points.length - 1)];
    if (!p) return sum;
    return sum + (toUnit(p, turretUnit) - t.holdMilOrMoa) ** 2;
  }, 0);
}

/** Golden-section minimizer on a unimodal 1-D error surface. */
function goldenSection(
  lo: number,
  hi: number,
  tolerance: number,
  error: (x: number) => number,
): number {
  const phi = (Math.sqrt(5) - 1) / 2;
  let c = hi - phi * (hi - lo);
  let d = lo + phi * (hi - lo);
  let fc = error(c);
  let fd = error(d);
  for (let i = 0; i < 30 && hi - lo > tolerance; i++) {
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
  return (lo + hi) / 2;
}

/**
 * Stage 1 truing — solve muzzle velocity from confirmed holds.
 *
 * Correct when MV is NOT known from a chronograph: inside the supersonic
 * mid-range, trajectory error is dominated by velocity error, so the drop
 * back-solves MV. If you do have chrono data, true drag instead
 * (trueDragScale) — bending MV to fit a long shot would mis-model the curve.
 */
export function trueMuzzleVelocity(params: {
  solverInput: Omit<BallisticInput, 'windMph'>;
  observations: ObservedDope[];
  turretUnit: TurretUnit;
}): number | null {
  const { solverInput, observations, turretUnit } = params;
  const targets = usableHolds(observations, turretUnit, MV_TRUE_MIN_YD);
  if (targets.length === 0) return null;
  const best = goldenSection(solverInput.mvFps - 150, solverInput.mvFps + 150, 1, (mvFps) =>
    holdError({ ...solverInput, mvFps }, targets, turretUnit),
  );
  return Math.round(best);
}

/**
 * Stage 2 truing — solve a drag scale factor (BC multiplier) with muzzle
 * velocity held fixed.
 *
 * This is the right knob once MV is known from a chronograph: the residual
 * error at long range is the drag model, not the speed. Equivalent to Applied
 * Ballistics' Drag Scale Factor / Hornady 4DOF's axial form factor. Returns a
 * multiplier for the load's BC (1 = published), or null without a usable
 * long-range confirmed hold.
 */
export function trueDragScale(params: {
  solverInput: Omit<BallisticInput, 'windMph'>;
  observations: ObservedDope[];
  turretUnit: TurretUnit;
}): number | null {
  const { solverInput, observations, turretUnit } = params;
  const targets = usableHolds(observations, turretUnit, DRAG_TRUE_MIN_YD);
  if (targets.length === 0) return null;
  const base = solverInput.bcScale ?? 1;
  // ±30% brackets any realistic published-BC error with margin.
  const best = goldenSection(base * 0.7, base * 1.3, 0.001, (bcScale) =>
    holdError({ ...solverInput, bcScale }, targets, turretUnit),
  );
  return Math.round(best * 1000) / 1000;
}
