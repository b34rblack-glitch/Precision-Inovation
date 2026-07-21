import { describe, expect, it } from 'vitest';
import {
  bestBc,
  BULLET_CATALOG,
  BULLET_MAKERS,
  CatalogBullet,
  searchBullets,
} from '@/data/bulletCatalog';

describe('bullet catalog data integrity', () => {
  it('has entries', () => {
    expect(BULLET_CATALOG.length).toBeGreaterThan(40);
  });

  it('every entry is well-formed', () => {
    for (const b of BULLET_CATALOG) {
      expect(BULLET_MAKERS).toContain(b.maker);
      expect(b.model.trim().length).toBeGreaterThan(0);
      expect(b.caliber.trim().length).toBeGreaterThan(0);
      expect(b.diameterIn).toBeGreaterThan(0.1);
      expect(b.diameterIn).toBeLessThan(0.5);
      expect(b.weightGr).toBeGreaterThan(0);
      expect(b.weightGr).toBeLessThan(400);
      // At least one BC must be present and plausible.
      const bcs = [b.bcG1, b.bcG7].filter((x): x is number => x != null);
      expect(bcs.length).toBeGreaterThan(0);
      for (const bc of bcs) {
        expect(bc).toBeGreaterThan(0);
        expect(bc).toBeLessThan(1.5);
      }
      // G7 is always numerically lower than G1 for the same bullet.
      if (b.bcG1 != null && b.bcG7 != null) expect(b.bcG7).toBeLessThan(b.bcG1);
    }
  });

  it('covers all four makers', () => {
    for (const m of BULLET_MAKERS) {
      expect(BULLET_CATALOG.some((b) => b.maker === m)).toBe(true);
    }
  });

  it('has no duplicate maker+model+weight+caliber entries', () => {
    const keys = BULLET_CATALOG.map((b) => `${b.maker}|${b.model}|${b.weightGr}|${b.caliber}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('bestBc', () => {
  it('prefers G7 when present', () => {
    const b: CatalogBullet = {
      maker: 'Berger', model: 'x', caliber: '6.5mm', diameterIn: 0.264, weightGr: 140,
      bcG1: 0.607, bcG7: 0.311,
    };
    expect(bestBc(b)).toEqual({ bcValue: 0.311, bcModel: 'G7' });
  });

  it('falls back to G1 when no G7', () => {
    const b: CatalogBullet = {
      maker: 'Sierra', model: 'x', caliber: '.308', diameterIn: 0.308, weightGr: 175,
      bcG1: 0.505, bcG7: null,
    };
    expect(bestBc(b)).toEqual({ bcValue: 0.505, bcModel: 'G1' });
  });

  it('returns null when no BC at all', () => {
    const b: CatalogBullet = {
      maker: 'Nosler', model: 'x', caliber: '.308', diameterIn: 0.308, weightGr: 168,
      bcG1: null, bcG7: null,
    };
    expect(bestBc(b)).toBeNull();
  });
});

describe('searchBullets', () => {
  it('empty query returns all (optionally maker-filtered)', () => {
    expect(searchBullets('')).toHaveLength(BULLET_CATALOG.length);
    const berger = searchBullets('', 'Berger');
    expect(berger.length).toBeGreaterThan(0);
    expect(berger.every((b) => b.maker === 'Berger')).toBe(true);
  });

  it('matches across maker/model/caliber/weight, all terms required', () => {
    const r = searchBullets('140 eld');
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((b) => `${b.model} ${b.weightGr}`.toLowerCase().includes('eld'))).toBe(true);
    expect(r.some((b) => b.weightGr === 140)).toBe(true);
  });

  it('is case-insensitive and respects the maker filter together', () => {
    const r = searchBullets('HYBRID', 'Berger');
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((b) => b.maker === 'Berger' && b.model.toLowerCase().includes('hybrid'))).toBe(true);
  });

  it('returns empty for nonsense', () => {
    expect(searchBullets('zzzznotabullet')).toHaveLength(0);
  });
});
