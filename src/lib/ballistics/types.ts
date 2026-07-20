import { DragModel } from './dragTables';
import { AtmosphereInput } from './atmosphere';

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
};
