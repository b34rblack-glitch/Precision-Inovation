import { describe, expect, it } from 'vitest';
import {
  cmpHlc,
  formatHlc,
  HLC_MAX_COUNTER,
  HLC_ZERO,
  isHlc,
  maxHlc,
  parseHlc,
  receive,
  skewOf,
  tick,
  writerOf,
  type Hlc,
  type HlcTick,
} from '@/sync/hlc';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

describe('format and parse', () => {
  it('round-trips', () => {
    const h = formatHlc(1_784_562_354_988, 7, A);
    expect(parseHlc(h)).toEqual({ ms: 1_784_562_354_988, counter: 7, node: A });
  });

  it('zero-pads both numeric fields to fixed width', () => {
    expect(formatHlc(0, 0, A)).toBe(`000000000000-0000-${A}`);
    expect(formatHlc(255, 255, A)).toBe(`0000000000ff-00ff-${A}`);
  });

  it('rejects out-of-range values', () => {
    expect(() => formatHlc(-1, 0, A)).toThrow(RangeError);
    expect(() => formatHlc(1, HLC_MAX_COUNTER + 1, A)).toThrow(RangeError);
    expect(() => formatHlc(1.5, 0, A)).toThrow(RangeError);
    expect(() => formatHlc(1, 0, '')).toThrow(RangeError);
  });

  it('recognises well-formed values and rejects junk', () => {
    expect(isHlc(formatHlc(1, 2, A))).toBe(true);
    expect(isHlc('')).toBe(false);
    expect(isHlc('not-an-hlc')).toBe(false);
    expect(isHlc(42)).toBe(false);
    expect(isHlc(null)).toBe(false);
    // Uppercase hex would break lexicographic ordering against lowercase.
    expect(isHlc(`0000000000FF-0000-${A}`)).toBe(false);
  });

  it('exposes the writing device without parsing', () => {
    expect(writerOf(formatHlc(123, 4, A))).toBe(A);
  });
});

describe('lexicographic order is causal order', () => {
  it('orders by millis first, then counter, then node', () => {
    expect(cmpHlc(formatHlc(1, 0, A), formatHlc(2, 0, A))).toBe(-1);
    expect(cmpHlc(formatHlc(2, 0, A), formatHlc(2, 1, A))).toBe(-1);
    expect(cmpHlc(formatHlc(2, 1, A), formatHlc(2, 1, B))).toBe(-1);
    expect(cmpHlc(formatHlc(2, 1, A), formatHlc(2, 1, A))).toBe(0);
  });

  it('does not let a large counter outrank a later millisecond', () => {
    // The failure mode that fixed-width padding exists to prevent.
    expect(cmpHlc(formatHlc(1, HLC_MAX_COUNTER, A), formatHlc(2, 0, A))).toBe(-1);
  });

  it('maxHlc picks the causally later value', () => {
    expect(maxHlc(formatHlc(1, 0, A), formatHlc(2, 0, A))).toBe(formatHlc(2, 0, A));
    expect(maxHlc(formatHlc(2, 0, A), formatHlc(1, 0, A))).toBe(formatHlc(2, 0, A));
  });
});

describe('tick', () => {
  it('advances the counter when the wall clock has not moved', () => {
    let c: HlcTick = { ms: 1000, counter: 0 };
    c = tick(c, 1000);
    expect(c).toEqual({ ms: 1000, counter: 1 });
    c = tick(c, 1000);
    expect(c).toEqual({ ms: 1000, counter: 2 });
  });

  it('resets the counter when the wall clock moves forward', () => {
    expect(tick({ ms: 1000, counter: 9 }, 2000)).toEqual({ ms: 2000, counter: 0 });
  });

  it('never goes backwards when the wall clock does', () => {
    // NTP correction, timezone change, or the user setting the clock back.
    const c = tick({ ms: 5000, counter: 3 }, 1000);
    expect(c.ms).toBe(5000);
    expect(c.counter).toBe(4);
  });

  it('borrows a millisecond when the counter saturates', () => {
    const c = tick({ ms: 1000, counter: HLC_MAX_COUNTER }, 1000);
    expect(c).toEqual({ ms: 1001, counter: 0 });
  });

  it('stays strictly increasing across a 100k same-millisecond burst', () => {
    let c: HlcTick = HLC_ZERO;
    let prev = '';
    for (let i = 0; i < 100_000; i++) {
      c = tick(c, 1_784_562_354_988);
      const h = formatHlc(c.ms, c.counter, A);
      expect(h > prev).toBe(true);
      prev = h;
    }
  });
});

describe('receive', () => {
  it('adopts a remote clock that is ahead', () => {
    const c = receive({ ms: 1000, counter: 0 }, formatHlc(9000, 5, B), 1000);
    expect(c.ms).toBe(9000);
    expect(c.counter).toBe(6);
  });

  it('ignores a remote clock that is behind', () => {
    const c = receive({ ms: 9000, counter: 2 }, formatHlc(1000, 5, B), 9000);
    expect(c).toEqual({ ms: 9000, counter: 3 });
  });

  it('breaks a same-millisecond tie by taking the higher counter and adding one', () => {
    const c = receive({ ms: 1000, counter: 3 }, formatHlc(1000, 7, B), 1000);
    expect(c).toEqual({ ms: 1000, counter: 8 });
  });

  it('prefers a wall clock that has moved past both', () => {
    const c = receive({ ms: 1000, counter: 3 }, formatHlc(2000, 7, B), 5000);
    expect(c).toEqual({ ms: 5000, counter: 0 });
  });

  it('adopts a peer whose clock is ten years fast, then outranks it', () => {
    // The skew scenario. We take the hit once; our next write wins.
    const tenYears = 10 * 365 * 24 * 60 * 60 * 1000;
    const now = 1_784_562_354_988;
    const remote = formatHlc(now + tenYears, 0, B);

    let c = receive({ ms: now, counter: 0 }, remote, now);
    const mine = formatHlc(c.ms, c.counter, A);
    expect(cmpHlc(mine, remote)).toBe(1);

    c = tick(c, now);
    expect(cmpHlc(formatHlc(c.ms, c.counter, A), mine)).toBe(1);
  });

  it('reports skew for the UI without changing the outcome', () => {
    const now = 1_784_562_354_988;
    expect(skewOf(formatHlc(now + 3 * 86_400_000, 0, B), now)).toBe(3 * 86_400_000);
    expect(skewOf(formatHlc(now - 86_400_000, 0, B), now)).toBe(0);
  });
});

describe('property: lexicographic order never contradicts causal order', () => {
  it('holds across 10k interleaved events on three nodes', () => {
    // Deterministic PRNG so a failure is reproducible.
    let seed = 0x2f6e2b1;
    const rnd = () => {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      return Math.abs(seed) / 0x7fffffff;
    };

    const nodes = [A, B, '33333333-3333-4333-8333-333333333333'];
    const clocks: HlcTick[] = [HLC_ZERO, HLC_ZERO, HLC_ZERO];
    const issued: Hlc[] = [];
    // Each node's own wall clock, deliberately skewed against the others.
    const wall = [1_700_000_000_000, 1_700_000_050_000, 1_699_999_900_000];
    /** The last stamp each node issued — its causal frontier. */
    const lastOf: (string | null)[] = [null, null, null];

    for (let step = 0; step < 10_000; step++) {
      const n = Math.floor(rnd() * nodes.length);
      wall[n]! += Math.floor(rnd() * 3); // often the same millisecond

      if (rnd() < 0.4 && issued.length > 0) {
        // Observe someone else's stamp.
        const remote = issued[Math.floor(rnd() * issued.length)]!;
        clocks[n] = receive(clocks[n]!, remote, wall[n]!);
        const mine = formatHlc(clocks[n]!.ms, clocks[n]!.counter, nodes[n]!);
        // Having observed `remote`, everything we issue must outrank it.
        expect(cmpHlc(mine, remote)).toBe(1);
        lastOf[n] = mine;
        issued.push(mine);
      } else {
        clocks[n] = tick(clocks[n]!, wall[n]!);
        const mine = formatHlc(clocks[n]!.ms, clocks[n]!.counter, nodes[n]!);
        // A node's own stamps are strictly increasing.
        if (lastOf[n] !== null) expect(cmpHlc(mine, lastOf[n]!)).toBe(1);
        lastOf[n] = mine;
        issued.push(mine);
      }
    }

    // No two events anywhere collided.
    expect(new Set(issued).size).toBe(issued.length);
  });
});
