import { describe, expect, it } from 'vitest';
import {
  batchSummary,
  parseRunoutReadings,
  roundCountWithBatches,
  runoutStats,
  thou,
} from '@/lib/batches/model';

describe('parseRunoutReadings', () => {
  it('reads thousandths or inches, with any separator, and rejects junk', () => {
    expect(parseRunoutReadings('1 1.5 3')).toEqual([0.001, 0.0015, 0.003]);
    expect(parseRunoutReadings('0.001, 0.0015;0.003')).toEqual([0.001, 0.0015, 0.003]);
    expect(parseRunoutReadings('2\n0\n1')).toEqual([0.002, 0, 0.001]);
    expect(parseRunoutReadings('')).toEqual([]);
    expect(parseRunoutReadings('1 x 2')).toBeNull();
    expect(parseRunoutReadings('-1')).toBeNull();
  });
});

describe('runoutStats and thou', () => {
  it('summarises readings against the threshold', () => {
    expect(runoutStats([0.001, 0.002, 0.003, 0.0005])).toEqual({ n: 4, avgIn: 0.001625, maxIn: 0.003, under: 3 });
    expect(runoutStats([0.001, 0.004], 0.003)).toEqual({ n: 2, avgIn: 0.0025, maxIn: 0.004, under: 1 });
    expect(runoutStats([])).toBeNull();
    expect(thou(0.0015)).toBe('1.5 thou');
    expect(thou(0.002)).toBe('2 thou');
  });
});

describe('batchSummary', () => {
  it('reads as a bench note', () => {
    expect(
      batchSummary({ quantity: 40, runoutAvgIn: 0.0012, runoutMaxIn: 0.003, runoutReadingsIn: [0.001, 0.001, 0.003, 0.0015], runoutThresholdIn: 0.002 }),
    ).toBe('40 rds · runout 1.2 avg / 3 max thou · 3/4 under 2');
    expect(batchSummary({ quantity: null, runoutAvgIn: 0.0015, runoutMaxIn: null, runoutReadingsIn: null, runoutThresholdIn: null })).toBe('runout 1.5 avg thou');
    expect(batchSummary({ quantity: 20, runoutAvgIn: null, runoutMaxIn: null, runoutReadingsIn: null, runoutThresholdIn: null })).toBe('20 rds');
  });
});

describe('roundCountWithBatches', () => {
  it('adds fired batches and does not double count their sessions\' strings', () => {
    const out = roundCountWithBatches({
      baseline: 100,
      strings: [
        { shots: 5, sessionBatchId: null },
        { shots: 10, sessionBatchId: 'b1' },
        { shots: 3, sessionBatchId: 'b2' },
      ],
      batches: [
        { id: 'b1', quantity: 40, fired: true },
        { id: 'b2', quantity: 20, fired: false },
        { id: 'b3', quantity: 50, fired: true },
      ],
    });
    expect(out).toEqual({ total: 198, fromBatches: 90, fromStrings: 8 });
  });
});
