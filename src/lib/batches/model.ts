// Batch log rules: reading runout off a gauge the way it is spoken, the
// summary a batch shows, and what a batch adds to the rifle's round count.
// Pure; the sheet, the load screen and Compare Loads render what comes back.

export const DEFAULT_RUNOUT_THRESHOLD_IN = 0.002;

/**
 * Parse runout readings typed as a list. Values are inches; anything over
 * 0.1 is taken as thousandths and divided down, so "1 1.5 3" and
 * "0.001 0.0015 0.003" read the same. Separators: spaces, commas, newlines,
 * semicolons. Returns null when any token is not a non-negative number.
 */
export function parseRunoutReadings(text: string): number[] | null {
  const tokens = text
    .split(/[\s,;]+/)
    .map((t) => t.trim())
    .filter(Boolean);
  const out: number[] = [];
  for (const t of tokens) {
    const n = Number(t.replace(',', '.'));
    if (!Number.isFinite(n) || n < 0) return null;
    out.push(n > 0.1 ? n / 1000 : n);
  }
  return out;
}

export type RunoutStats = {
  n: number;
  avgIn: number;
  maxIn: number;
  /** Readings at or under the threshold. */
  under: number;
};

export function runoutStats(readings: readonly number[], thresholdIn = DEFAULT_RUNOUT_THRESHOLD_IN): RunoutStats | null {
  if (readings.length === 0) return null;
  const sum = readings.reduce((a, b) => a + b, 0);
  return {
    n: readings.length,
    avgIn: Math.round((sum / readings.length) * 1e6) / 1e6,
    maxIn: Math.max(...readings),
    under: readings.filter((r) => r <= thresholdIn + 1e-9).length,
  };
}

/** `0.0015"` reads better as thousandths on a bench: "1.5 thou". */
export const thou = (inches: number): string => {
  const t = inches * 1000;
  return `${Number.isInteger(t) ? t : t.toFixed(1)} thou`;
};

export type BatchSummaryInput = {
  quantity: number | null;
  runoutAvgIn: number | null;
  runoutMaxIn: number | null;
  runoutReadingsIn: number[] | null;
  runoutThresholdIn: number | null;
};

/** One line for a batch row: "40 rds · runout 1.2 avg / 3 max thou · 32/40 under 2". */
export function batchSummary(b: BatchSummaryInput): string {
  const parts: string[] = [];
  if (b.quantity != null) parts.push(`${b.quantity} rds`);
  if (b.runoutAvgIn != null || b.runoutMaxIn != null) {
    const avg = b.runoutAvgIn != null ? `${+(b.runoutAvgIn * 1000).toFixed(2)} avg` : null;
    const max = b.runoutMaxIn != null ? `${+(b.runoutMaxIn * 1000).toFixed(2)} max` : null;
    parts.push(`runout ${[avg, max].filter(Boolean).join(' / ')} thou`);
  }
  const readings = b.runoutReadingsIn;
  if (readings && readings.length > 0) {
    const st = runoutStats(readings, b.runoutThresholdIn ?? DEFAULT_RUNOUT_THRESHOLD_IN)!;
    parts.push(`${st.under}/${st.n} under ${+((b.runoutThresholdIn ?? DEFAULT_RUNOUT_THRESHOLD_IN) * 1000).toFixed(1)}`);
  }
  return parts.join(' · ');
}

/**
 * Rounds a rifle has fired: the baseline, every chronograph string's shots,
 * and the quantity of every batch marked fired, except that strings logged
 * in a session tied to a fired batch are already inside that batch's count
 * and are not added twice.
 */
export function roundCountWithBatches(input: {
  baseline: number | null | undefined;
  strings: readonly { shots: number | null; sessionBatchId: string | null }[];
  batches: readonly { id: string; quantity: number | null; fired: boolean }[];
}): { total: number; fromBatches: number; fromStrings: number } {
  const fired = new Set(input.batches.filter((b) => b.fired).map((b) => b.id));
  let fromBatches = 0;
  for (const b of input.batches) if (b.fired && b.quantity != null && b.quantity > 0) fromBatches += b.quantity;
  let fromStrings = 0;
  for (const s of input.strings) {
    if (s.shots == null || s.shots <= 0) continue;
    if (s.sessionBatchId && fired.has(s.sessionBatchId)) continue;
    fromStrings += s.shots;
  }
  return { total: (input.baseline ?? 0) + fromBatches + fromStrings, fromBatches, fromStrings };
}
