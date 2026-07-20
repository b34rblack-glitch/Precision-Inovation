import { DistanceUnit, mToYd } from '@/lib/units';

export type CardPreset = 'bench' | 'hunting';

export type PresetConfig = {
  startDistanceYd: number;
  endDistanceYd: number;
  incrementYd: number;
  /** Columns beyond distance/elevation/wind. */
  showVelocity: boolean;
  showEnergy: boolean;
  showTof: boolean;
};

// Bench: fine increments, full data. Hunting: coarse increments, big type,
// just the holds you need when an animal is standing there.
// Distances are canonical yards, but chosen so a meters rifle gets rows at
// round meter marks (100 m, 150 m, …) instead of odd conversions.
export function presetConfig(preset: CardPreset, distanceUnit: DistanceUnit): PresetConfig {
  const unit = (v: number) => (distanceUnit === 'm' ? mToYd(v) : v);
  if (preset === 'hunting') {
    return {
      startDistanceYd: unit(100),
      endDistanceYd: unit(500),
      incrementYd: unit(50),
      showVelocity: false,
      showEnergy: true,
      showTof: false,
    };
  }
  return {
    startDistanceYd: unit(100),
    endDistanceYd: unit(1000),
    incrementYd: unit(25),
    showVelocity: true,
    showEnergy: false,
    showTof: true,
  };
}
