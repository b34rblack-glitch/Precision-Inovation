import { describe, expect, it } from 'vitest';
import {
  BRASS_OPTIONS,
  POWDER_OPTIONS,
  PRESS_OPTIONS,
  PRIMER_OPTIONS,
  SEATING_DIE_OPTIONS,
  SIZING_DIE_OPTIONS,
} from '@/data/componentCatalog';

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

  it('primer list is non-trivial, grouped by brand, and well-formed', () => {
    expect(PRIMER_OPTIONS.length).toBeGreaterThan(15);
    for (const o of PRIMER_OPTIONS) {
      expect(o.value.trim().length).toBeGreaterThan(0);
      expect(o.group?.trim().length ?? 0).toBeGreaterThan(0);
      expect(o.note ?? '').toMatch(/rifle/i); // every primer notes its size/type
    }
  });

  it('includes Ramshot LRT', () => {
    expect(POWDER_OPTIONS.some((o) => o.value === 'Ramshot LRT')).toBe(true);
  });

  it('sizing die list is non-trivial, grouped by maker, and well-formed', () => {
    expect(SIZING_DIE_OPTIONS.length).toBeGreaterThan(10);
    for (const o of SIZING_DIE_OPTIONS) {
      expect(o.value.trim().length).toBeGreaterThan(0);
      expect(o.group?.trim().length ?? 0).toBeGreaterThan(0);
      // every sizing die states how it sizes, so the pick-list matches the field
      expect(o.note ?? '').toMatch(/full-length|neck|body/i);
    }
  });

  it('seating die list is non-trivial, grouped by maker, and flags micrometers', () => {
    expect(SEATING_DIE_OPTIONS.length).toBeGreaterThan(8);
    for (const o of SEATING_DIE_OPTIONS) {
      expect(o.value.trim().length).toBeGreaterThan(0);
      expect(o.group?.trim().length ?? 0).toBeGreaterThan(0);
      expect(o.note ?? '').toMatch(/micrometer/i);
    }
  });

  it('press list is non-trivial and grouped by press action', () => {
    expect(PRESS_OPTIONS.length).toBeGreaterThan(10);
    for (const o of PRESS_OPTIONS) {
      expect(o.value.trim().length).toBeGreaterThan(0);
      expect(o.group ?? '').toMatch(/^(Single stage|Arbor|Turret|Progressive)$/);
    }
    // arbor presses matter to benchrest/F-class hand-die workflows
    expect(PRESS_OPTIONS.some((o) => o.group === 'Arbor')).toBe(true);
  });

  it('has no duplicate values in any list', () => {
    for (const list of [
      POWDER_OPTIONS,
      PRIMER_OPTIONS,
      BRASS_OPTIONS,
      SIZING_DIE_OPTIONS,
      SEATING_DIE_OPTIONS,
      PRESS_OPTIONS,
    ]) {
      const v = list.map((o) => o.value);
      expect(new Set(v).size).toBe(v.length);
    }
  });

  it('ships NO charge/recipe data — notes must not contain grain charges', () => {
    // Guards the safety invariant: names + application hints only, never a load.
    for (const o of POWDER_OPTIONS) {
      expect(o.note ?? '').not.toMatch(/\d+(\.\d+)?\s*(gr|grain)/i);
    }
  });
});
