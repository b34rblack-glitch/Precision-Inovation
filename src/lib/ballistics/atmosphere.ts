import { fToK, ftToM, inHgToPa } from '@/lib/units';

// ICAO standard atmosphere with humidity correction.
// Sea-level standard: 15 °C (59 °F), 29.92 inHg, 0% RH → ρ = 1.225 kg/m³.

export type AtmosphereInput = {
  tempF: number;
  /** Station pressure (not sea-level corrected). Preferred when available. */
  pressureInHg?: number | null;
  /** Fallback when no station pressure: ICAO pressure at this altitude. */
  altitudeFt?: number | null;
  humidityPct?: number | null;
};

export type Atmosphere = {
  /** Air density, kg/m³ */
  densityKgM3: number;
  /** Speed of sound, m/s */
  speedOfSoundMps: number;
};

export const ICAO_SEA_LEVEL = { tempF: 59, pressureInHg: 29.9213, humidityPct: 0 } as const;

const R_DRY = 287.058; // J/(kg·K)
const R_VAPOR = 461.495; // J/(kg·K)

/** ICAO pressure (Pa) at geopotential altitude, valid through the troposphere. */
export function icaoPressureAtAltitude(altitudeFt: number): number {
  const h = ftToM(altitudeFt);
  const p0 = 101325;
  const T0 = 288.15;
  const L = 0.0065; // K/m
  const g = 9.80665;
  return p0 * Math.pow(1 - (L * h) / T0, g / (R_DRY * L));
}

/** Saturation vapor pressure (Pa), Tetens formula over water. */
function saturationVaporPressure(tempC: number): number {
  return 610.78 * Math.pow(10, (7.5 * tempC) / (tempC + 237.3));
}

export function computeAtmosphere(input: AtmosphereInput): Atmosphere {
  const tempK = fToK(input.tempF);
  const tempC = tempK - 273.15;

  let pressurePa: number;
  if (input.pressureInHg != null) {
    pressurePa = inHgToPa(input.pressureInHg);
  } else if (input.altitudeFt != null) {
    pressurePa = icaoPressureAtAltitude(input.altitudeFt);
  } else {
    pressurePa = inHgToPa(ICAO_SEA_LEVEL.pressureInHg);
  }

  const rh = Math.min(Math.max(input.humidityPct ?? 0, 0), 100) / 100;
  const vaporPa = rh * saturationVaporPressure(tempC);
  const dryPa = pressurePa - vaporPa;

  const densityKgM3 = dryPa / (R_DRY * tempK) + vaporPa / (R_VAPOR * tempK);

  // Humid air is slightly faster; the dry-air formula is within 0.3% for
  // shooting conditions, which is well below other error sources.
  const speedOfSoundMps = Math.sqrt(1.4 * (pressurePa / densityKgM3));

  return { densityKgM3, speedOfSoundMps };
}
