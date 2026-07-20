// Velocity statistics used across workups and chrono strings.

/** Sample standard deviation (n-1). Returns 0 for fewer than 2 values. */
export function sampleSd(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((acc, v) => acc + (v - mean) * (v - mean), 0) / (values.length - 1);
  return Math.sqrt(variance);
}

export function extremeSpread(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.max(...values) - Math.min(...values);
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export type ChargePoint = {
  chargeGr: number;
  avgFps: number;
};

export type FlatSpot = {
  /** Indexes into the input array covered by this flat spot (>= 3 points). */
  startIndex: number;
  endIndex: number;
  /** Velocity spread across the flat spot, fps. */
  spreadFps: number;
  /** Center charge weight of the window — the candidate load. */
  centerChargeGr: number;
};

/**
 * Find velocity flat spots in a charge ladder (Satterlee-style): runs of
 * consecutive charge steps where average velocity changes little relative to
 * the ladder's overall velocity-per-step rate.
 *
 * A window of >= 2 consecutive deltas qualifies when each delta is at most
 * `threshold` times the median step delta (default 0.4).
 */
export function findFlatSpots(points: ChargePoint[], threshold = 0.4): FlatSpot[] {
  if (points.length < 3) return [];
  const sorted = [...points].sort((a, b) => a.chargeGr - b.chargeGr);
  const deltas = sorted.slice(1).map((p, i) => Math.abs(p.avgFps - sorted[i]!.avgFps));
  const sortedDeltas = [...deltas].sort((a, b) => a - b);
  const median = sortedDeltas[Math.floor(sortedDeltas.length / 2)] ?? 0;
  if (median === 0) return [];
  const cutoff = median * threshold;

  const spots: FlatSpot[] = [];
  let runStart: number | null = null;
  for (let i = 0; i < deltas.length; i++) {
    const flat = deltas[i]! <= cutoff;
    if (flat && runStart === null) runStart = i;
    const runEnds = (!flat || i === deltas.length - 1) && runStart !== null;
    if (runEnds) {
      const endDelta = flat ? i : i - 1;
      const startIndex = runStart!;
      const endIndex = endDelta + 1;
      if (endIndex - startIndex >= 2) {
        const window = sorted.slice(startIndex, endIndex + 1);
        const velocities = window.map((p) => p.avgFps);
        spots.push({
          startIndex,
          endIndex,
          spreadFps: extremeSpread(velocities),
          centerChargeGr: window[Math.floor(window.length / 2)]!.chargeGr,
        });
      }
      runStart = null;
    }
  }
  return spots;
}
