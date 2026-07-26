import { DragModel } from './dragTables';
import { AtmosphereInput } from './atmosphere';

/** One velocity band of a Sierra-style multi-BC definition. */
export type BcSegment = {
  /** The band applies at speeds at or above this velocity, fps. */
  minVelocityFps: number;
  /** Ballistic coefficient in the input's drag model, lb/in². */
  bc: number;
};

/** Bullet spin description for Miller stability / Litz spin drift. */
export type SpinInput = {
  /** Barrel twist rate, inches per turn (e.g. 8 for a 1:8"). */
  twistInPerTurn: number;
  /** true = right-hand twist (drifts right), false = left-hand. */
  twistRight: boolean;
  bulletLengthIn: number;
  bulletDiameterIn: number;
};

/** Earth-rotation inputs for the closed-form Litz Coriolis corrections. */
export type CoriolisInput = {
  /** Firing-point latitude, degrees (negative = southern hemisphere). */
  latitudeDeg: number;
  /** Firing azimuth, degrees clockwise from true north. */
  azimuthDeg: number;
};

export type BallisticInput = {
  /** Muzzle velocity, fps */
  mvFps: number;
  /** Ballistic coefficient in the given drag model, lb/in² */
  bc: number;
  bcModel: DragModel;
  /** Distance at which the rifle is zeroed, yards */
  zeroDistanceYd: number;
  /** Sight height over bore, inches */
  sightHeightIn: number;
  atmo: AtmosphereInput;
  /** Full-value (90°) crosswind, mph. Positive = wind from the left. */
  windMph?: number;
  maxDistanceYd: number;
  stepYd: number;
  /** Bullet weight, grains — needed only for energy output. */
  bulletWeightGr?: number | null;
  /**
   * Velocity-banded BC (Sierra-style). The active band is the one with the
   * highest minVelocityFps at or below the current speed; below the lowest
   * band its bc keeps applying. When absent, the single `bc` is used.
   */
  bcSegments?: BcSegment[];
  /**
   * Spin drift via Miller stability + Litz approximation, applied per output
   * sample. Requires bulletWeightGr — silently skipped without it.
   */
  spin?: SpinInput;
  /** Closed-form Litz Coriolis (horizontal drift + Eötvös vertical). */
  coriolis?: CoriolisInput;
  /** Firing-line inclination, degrees. Uphill positive. Distances stay slant/along-LOS. */
  inclineDeg?: number;
  /**
   * Crosswind for Litz aerodynamic jump, mph. Positive = wind FROM the left
   * (blowing left→right). Requires `spin` — silently skipped without it.
   */
  aeroJumpCrossMph?: number;
  /**
   * Drag scale factor: multiplies the effective BC (and every bcSegment).
   * 1 = published BC. Below 1 = more drag than the model predicts (steeper
   * trajectory); above 1 = less. This is the "drag/DSF truing" knob — the
   * correct thing to calibrate when muzzle velocity is already known from a
   * chronograph, since the residual long-range error is then drag, not speed.
   */
  bcScale?: number;
};

export type TrajectoryPoint = {
  distanceYd: number;
  /** Bullet path relative to line of sight, inches. Negative = below. */
  dropIn: number;
  /** Elevation hold to correct the drop (positive = dial up). */
  dropMil: number;
  dropMoa: number;
  /** Wind deflection for the given crosswind, inches (positive = right). */
  windIn: number;
  windMil: number;
  windMoa: number;
  velocityFps: number;
  energyFtLb: number | null;
  tofS: number;
  mach: number;
  /**
   * Signed horizontal spin drift + Coriolis total, inches (positive = right;
   * hold the opposite direction). Kept separate from windIn, which stays
   * pure wind. 0 when neither spin nor coriolis inputs are given.
   */
  driftIn: number;
  driftMil: number;
  driftMoa: number;
  /**
   * Signed vertical aerodynamic-jump offset at this distance, inches
   * (positive = impact high). Already folded into dropIn/dropMil; reported
   * separately for display. 0 when aero jump is off.
   */
  aeroJumpIn: number;
};
