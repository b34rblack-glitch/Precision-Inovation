import { describe, expect, it } from 'vitest';
import { formatChargeGr } from '@/lib/workup/format';

describe('formatChargeGr', () => {
  it('prints to two decimals, dropping a single trailing zero', () => {
    // Matches what the charge cards have always shown, so photo badges and
    // the viewer header read the same as the card they belong to.
    expect(formatChargeGr(42.2)).toBe('42.2 gr');
    expect(formatChargeGr(42.25)).toBe('42.25 gr');
    expect(formatChargeGr(42)).toBe('42.0 gr');
    expect(formatChargeGr(70.1)).toBe('70.1 gr');
  });
});
