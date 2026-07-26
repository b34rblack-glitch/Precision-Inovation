// Hybrid logical clock (Kulkarni et al.) — the ordering primitive for sync.
//
// Why not just `updatedAt`: every row already carries a wall-clock timestamp,
// but wall clocks disagree. A phone whose clock runs three days fast would win
// every conflict forever, silently discarding the desktop's newer edits. An HLC
// keeps wall-clock *meaning* (the millis half tracks real time, so ordering is
// intuitive) while guaranteeing that anything a device has *observed* is
// ordered before what it does next — which is what conflict resolution
// actually needs.
//
// Format: `<12 hex millis>-<4 hex counter>-<deviceId>`
//
// Both numeric fields are zero-padded to fixed width, so lexicographic string
// comparison is exactly causal comparison. That is what lets SQLite `ORDER BY
// hlc` and JavaScript `a < b` agree without parsing anything, and it is why the
// format must never gain a variable-width field before the deviceId.
//
// PURE: no imports. Vendored verbatim by the desktop app.

/** `<12 hex millis>-<4 hex counter>-<deviceId>` */
export type Hlc = string;

const MILLIS_HEX_WIDTH = 12;
const COUNTER_HEX_WIDTH = 4;

/** Counter saturates at 0xffff, then borrows a millisecond. */
export const HLC_MAX_COUNTER = 0xffff;

/** 12 hex digits of milliseconds runs out in the year ~10889. */
export const HLC_MAX_MILLIS = 0xffffffffffff;

/**
 * A remote clock further ahead of ours than this is surfaced to the user. We
 * still adopt it — causal correctness beats wall-clock plausibility — but a
 * device with a badly wrong clock is worth telling someone about, because every
 * row it writes will outrank everyone else's until real time catches up.
 */
export const SKEW_WARN_MS = 60 * 60 * 1000;

/** The mutable half of a clock. Callers persist this between events. */
export type HlcTick = { ms: number; counter: number };

export const HLC_ZERO: HlcTick = { ms: 0, counter: 0 };

export function formatHlc(ms: number, counter: number, node: string): Hlc {
  if (!Number.isInteger(ms) || ms < 0 || ms > HLC_MAX_MILLIS) {
    throw new RangeError(`hlc: millis out of range: ${ms}`);
  }
  if (!Number.isInteger(counter) || counter < 0 || counter > HLC_MAX_COUNTER) {
    throw new RangeError(`hlc: counter out of range: ${counter}`);
  }
  if (node.length === 0) throw new RangeError('hlc: empty node');
  return `${ms.toString(16).padStart(MILLIS_HEX_WIDTH, '0')}-${counter
    .toString(16)
    .padStart(COUNTER_HEX_WIDTH, '0')}-${node}`;
}

export function parseHlc(hlc: Hlc): { ms: number; counter: number; node: string } {
  const ms = Number.parseInt(hlc.slice(0, MILLIS_HEX_WIDTH), 16);
  const counter = Number.parseInt(
    hlc.slice(MILLIS_HEX_WIDTH + 1, MILLIS_HEX_WIDTH + 1 + COUNTER_HEX_WIDTH),
    16,
  );
  const node = hlc.slice(MILLIS_HEX_WIDTH + COUNTER_HEX_WIDTH + 2);
  if (!Number.isFinite(ms) || !Number.isFinite(counter) || node.length === 0) {
    throw new Error(`hlc: malformed value ${JSON.stringify(hlc)}`);
  }
  return { ms, counter, node };
}

/** True when `hlc` is well-formed. Used to reject corrupt remote snapshots. */
export function isHlc(value: unknown): value is Hlc {
  if (typeof value !== 'string') return false;
  if (value.length < MILLIS_HEX_WIDTH + COUNTER_HEX_WIDTH + 3) return false;
  if (value[MILLIS_HEX_WIDTH] !== '-') return false;
  if (value[MILLIS_HEX_WIDTH + COUNTER_HEX_WIDTH + 1] !== '-') return false;
  return /^[0-9a-f]{12}-[0-9a-f]{4}-/.test(value);
}

/**
 * Causal comparison. Plain string comparison is correct by construction — see
 * the fixed-width note above — so this is really just a named, tested
 * assertion of that invariant.
 */
export function cmpHlc(a: Hlc, b: Hlc): -1 | 0 | 1 {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function maxHlc(a: Hlc, b: Hlc): Hlc {
  return a >= b ? a : b;
}

/**
 * The device that last wrote a row is encoded in its HLC's node suffix, so
 * "which rows do I own?" needs no extra column. Ownership transfers for free:
 * once another device edits a row, its node is on the row and it takes over
 * publishing it.
 */
export function writerOf(hlc: Hlc): string {
  return hlc.slice(MILLIS_HEX_WIDTH + COUNTER_HEX_WIDTH + 2);
}

function carry(ms: number, counter: number): HlcTick {
  return counter > HLC_MAX_COUNTER ? { ms: ms + 1, counter: 0 } : { ms, counter };
}

/**
 * A local event. Returns the next clock state; the caller persists it in the
 * same transaction as the write it stamps, so a crash cannot rewind the clock.
 */
export function tick(prev: HlcTick, wallMs: number): HlcTick {
  const ms = Math.max(prev.ms, wallMs);
  if (ms === prev.ms) return carry(ms, prev.counter + 1);
  return { ms, counter: 0 };
}

/**
 * Observing a remote timestamp. Advances past it unconditionally, which is what
 * makes a skewed peer unable to win indefinitely: once we have seen its clock,
 * our next write outranks it.
 */
export function receive(prev: HlcTick, remote: Hlc, wallMs: number): HlcTick {
  const r = parseHlc(remote);
  const ms = Math.max(prev.ms, r.ms, wallMs);
  if (ms === prev.ms && ms === r.ms) {
    return carry(ms, Math.max(prev.counter, r.counter) + 1);
  }
  if (ms === prev.ms) return carry(ms, prev.counter + 1);
  if (ms === r.ms) return carry(ms, r.counter + 1);
  return { ms, counter: 0 };
}

/** How far ahead of our wall clock a remote timestamp is, in ms (0 if behind). */
export function skewOf(remote: Hlc, wallMs: number): number {
  return Math.max(0, parseHlc(remote).ms - wallMs);
}
