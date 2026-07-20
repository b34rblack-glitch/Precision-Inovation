import { describe, expect, it } from 'vitest';
import { extremeSpread, findFlatSpots, mean, sampleSd } from '@/lib/workup/stats';
import {
  DEFAULT_SHOTS_PER_CHARGE,
  generateChargeSeries,
  seriesEndCharge,
  totalRounds,
} from '@/lib/workup/seriesGenerator';

describe('velocity stats', () => {
  const string = [2698, 2704, 2701, 2712, 2695];

  it('mean', () => {
    expect(mean(string)).toBeCloseTo(2702, 10);
  });

  it('sample SD (n-1) against hand computation', () => {
    // deviations: -4, 2, -1, 10, -7 → squares: 16+4+1+100+49 = 170; /4 = 42.5
    expect(sampleSd(string)).toBeCloseTo(Math.sqrt(42.5), 10);
  });

  it('extreme spread', () => {
    expect(extremeSpread(string)).toBe(17);
  });

  it('degenerate inputs', () => {
    expect(sampleSd([2700])).toBe(0);
    expect(extremeSpread([])).toBe(0);
    expect(mean([])).toBe(0);
  });
});

describe('charge series generator', () => {
  it('40.0 → 43.0 in 0.3 steps = 11 charges without float drift', () => {
    const series = generateChargeSeries({ startChargeGr: 40.0, incrementGr: 0.3, stepCount: 11 });
    expect(series).toHaveLength(11);
    expect(series[0]).toBe(40.0);
    expect(series[4]).toBe(41.2);
    expect(series[10]).toBe(43.0);
  });

  it('end charge and total rounds', () => {
    const params = { startChargeGr: 40, incrementGr: 0.3, stepCount: 11 };
    expect(seriesEndCharge(params)).toBe(43.0);
    expect(totalRounds({ ...params, shotsPerCharge: DEFAULT_SHOTS_PER_CHARGE.velocity })).toBe(55);
  });

  it('rejects nonsense parameters', () => {
    expect(generateChargeSeries({ startChargeGr: 0, incrementGr: 0.3, stepCount: 5 })).toEqual([]);
    expect(generateChargeSeries({ startChargeGr: 40, incrementGr: 0.3, stepCount: 0 })).toEqual([]);
  });
});

describe('flat spot detection (Satterlee)', () => {
  it('finds the classic velocity plateau', () => {
    // Rising ~20 fps/step with a plateau at indices 4-6.
    const points = [
      { chargeGr: 40.0, avgFps: 2600 },
      { chargeGr: 40.3, avgFps: 2622 },
      { chargeGr: 40.6, avgFps: 2641 },
      { chargeGr: 40.9, avgFps: 2660 },
      { chargeGr: 41.2, avgFps: 2664 },
      { chargeGr: 41.5, avgFps: 2666 },
      { chargeGr: 41.8, avgFps: 2668 },
      { chargeGr: 42.1, avgFps: 2690 },
      { chargeGr: 42.4, avgFps: 2711 },
    ];
    const spots = findFlatSpots(points);
    expect(spots.length).toBeGreaterThanOrEqual(1);
    const main = spots[0]!;
    expect(main.centerChargeGr).toBeGreaterThanOrEqual(41.2);
    expect(main.centerChargeGr).toBeLessThanOrEqual(41.8);
    expect(main.spreadFps).toBeLessThanOrEqual(8);
  });

  it('ignores a single low-delta step on an otherwise linear ladder', () => {
    // Rising ~20 fps/step with one lone small step (index 3→4). A single flat
    // delta (2 charge points) is below the >= 2-consecutive-delta window, so it
    // must not be reported as a flat spot.
    const points = [
      { chargeGr: 40.0, avgFps: 2600 },
      { chargeGr: 40.3, avgFps: 2620 },
      { chargeGr: 40.6, avgFps: 2640 },
      { chargeGr: 40.9, avgFps: 2660 },
      { chargeGr: 41.2, avgFps: 2662 },
      { chargeGr: 41.5, avgFps: 2682 },
      { chargeGr: 41.8, avgFps: 2702 },
      { chargeGr: 42.1, avgFps: 2722 },
    ];
    expect(findFlatSpots(points)).toEqual([]);
  });

  it('returns nothing for a perfectly linear ladder', () => {
    const points = Array.from({ length: 8 }, (_, i) => ({
      chargeGr: 40 + i * 0.3,
      avgFps: 2600 + i * 20,
    }));
    expect(findFlatSpots(points)).toEqual([]);
  });

  it('needs at least 3 points', () => {
    expect(
      findFlatSpots([
        { chargeGr: 40, avgFps: 2600 },
        { chargeGr: 40.3, avgFps: 2601 },
      ]),
    ).toEqual([]);
  });
});
