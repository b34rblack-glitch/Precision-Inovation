export type WorkupType = 'ladder' | 'ocw' | 'velocity' | 'freeform';

export type SeriesParams = {
  startChargeGr: number;
  incrementGr: number;
  stepCount: number;
};

/** Default shots per charge by method: ladder 1, OCW 3, velocity (Satterlee) 5. */
export const DEFAULT_SHOTS_PER_CHARGE: Record<Exclude<WorkupType, 'freeform'>, number> = {
  ladder: 1,
  ocw: 3,
  velocity: 5,
};

export const DEFAULT_STEP_COUNT: Record<Exclude<WorkupType, 'freeform'>, number> = {
  ladder: 10,
  ocw: 7,
  velocity: 10,
};

/**
 * Generate the charge-weight series for a workup. Charges are rounded to 0.01gr
 * to kill floating-point drift (41.300000000000004 → 41.3).
 */
export function generateChargeSeries({ startChargeGr, incrementGr, stepCount }: SeriesParams): number[] {
  if (stepCount <= 0 || incrementGr < 0 || startChargeGr <= 0) return [];
  return Array.from({ length: stepCount }, (_, i) =>
    Number((startChargeGr + i * incrementGr).toFixed(2)),
  );
}

export function seriesEndCharge(params: SeriesParams): number {
  const series = generateChargeSeries(params);
  return series[series.length - 1] ?? params.startChargeGr;
}

export function totalRounds(params: SeriesParams & { shotsPerCharge: number }): number {
  return params.stepCount * params.shotsPerCharge;
}
