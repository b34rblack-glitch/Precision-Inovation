import { describe, expect, it } from 'vitest';
import { computeAtmosphere, icaoPressureAtAltitude } from '@/lib/ballistics/atmosphere';

describe('atmosphere', () => {
  it('ICAO sea-level standard density is 1.225 kg/m³', () => {
    const atmo = computeAtmosphere({ tempF: 59, pressureInHg: 29.9213, humidityPct: 0 });
    expect(atmo.densityKgM3).toBeCloseTo(1.225, 3);
  });

  it('ICAO sea-level speed of sound is ~340.3 m/s', () => {
    const atmo = computeAtmosphere({ tempF: 59, pressureInHg: 29.9213, humidityPct: 0 });
    expect(atmo.speedOfSoundMps).toBeCloseTo(340.29, 1);
  });

  it('hot air is thinner', () => {
    const cold = computeAtmosphere({ tempF: 30, pressureInHg: 29.92 });
    const hot = computeAtmosphere({ tempF: 95, pressureInHg: 29.92 });
    expect(hot.densityKgM3).toBeLessThan(cold.densityKgM3);
  });

  it('humid air is thinner than dry air (same T, P)', () => {
    const dry = computeAtmosphere({ tempF: 85, pressureInHg: 29.92, humidityPct: 0 });
    const humid = computeAtmosphere({ tempF: 85, pressureInHg: 29.92, humidityPct: 100 });
    expect(humid.densityKgM3).toBeLessThan(dry.densityKgM3);
  });

  it('ICAO pressure at altitude: ~24.90 inHg at 5000 ft', () => {
    // 5000 ft standard pressure ≈ 843.1 hPa ≈ 24.90 inHg
    expect(icaoPressureAtAltitude(5000) / 3386.389).toBeCloseTo(24.9, 1);
  });

  it('altitude fallback used only without station pressure', () => {
    const station = computeAtmosphere({ tempF: 59, pressureInHg: 29.92, altitudeFt: 5000 });
    const altitude = computeAtmosphere({ tempF: 59, altitudeFt: 5000 });
    expect(station.densityKgM3).toBeGreaterThan(altitude.densityKgM3);
  });
});
