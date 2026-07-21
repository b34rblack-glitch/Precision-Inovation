import { describe, expect, it } from 'vitest';
import { BRASS_OPTIONS, POWDER_OPTIONS } from '@/data/componentCatalog';

describe('component catalogs', () => {
  it('powder list is non-trivial and every entry is well-formed', () => {
    expect(POWDER_OPTIONS.length).toBeGreaterThan(30);
    for (const o of POWDER_OPTIONS) {
      expect(o.value.trim().length).toBeGreaterThan(0);
      expect(o.group?.trim().length ?? 0).toBeGreaterThan(0); // powders are grouped by maker
    }
  });

  it('brass list is non-trivial and every entry is well-formed', () => {
    expect(BRASS_OPTIONS.length).toBeGreaterThan(10);
    for (const o of BRASS_OPTIONS) {
      expect(o.value.trim().length).toBeGreaterThan(0);
    }
  });

  it('has no duplicate powder or brass values', () => {
    const p = POWDER_OPTIONS.map((o) => o.value);
    expect(new Set(p).size).toBe(p.length);
    const b = BRASS_OPTIONS.map((o) => o.value);
    expect(new Set(b).size).toBe(b.length);
  });

  it('ships NO charge/recipe data — notes must not contain grain charges', () => {
    // Guards the safety invariant: names + application hints only, never a load.
    for (const o of POWDER_OPTIONS) {
      expect(o.note ?? '').not.toMatch(/\d+(\.\d+)?\s*(gr|grain)/i);
    }
  });
});
