import { describe, expect, it } from 'vitest';
import { CALIBERS } from '@/data/bulletCatalog';
import {
  boreDiameterForCartridge,
  CARTRIDGE_BORES,
  normalizeCartridgeName,
} from '@/data/cartridgeBores';

describe('cartridge bore table', () => {
  it('only uses diameters the bullet catalog can filter to', () => {
    const known = CALIBERS.map((c) => c.diameterIn);
    for (const c of CARTRIDGE_BORES) {
      expect(known, `${c.names[0]} -> ${c.diameterIn}`).toContain(c.diameterIn);
      expect(c.names.length).toBeGreaterThan(0);
    }
  });

  it('no alias is claimed by two bores', () => {
    const seen = new Map<string, number>();
    for (const c of CARTRIDGE_BORES) {
      for (const n of c.names) {
        const key = normalizeCartridgeName(n);
        const prior = seen.get(key);
        expect(prior === undefined || prior === c.diameterIn, `${n} (${key})`).toBe(true);
        seen.set(key, c.diameterIn);
      }
    }
  });
});

describe('normalizeCartridgeName', () => {
  it('collapses punctuation, case, a leading dot, decimal commas and a trailing mm', () => {
    expect(normalizeCartridgeName('.308 Winchester')).toBe('308winchester');
    expect(normalizeCartridgeName('308 win')).toBe('308win');
    expect(normalizeCartridgeName('6.5mm Creedmoor')).toBe('65creedmoor');
    expect(normalizeCartridgeName('6,5 Creedmoor')).toBe('65creedmoor');
    expect(normalizeCartridgeName('  30-06  ')).toBe('3006');
    expect(normalizeCartridgeName('7mm Rem Mag')).toBe('7remmag');
  });
});

describe('boreDiameterForCartridge', () => {
  it('resolves the spellings people type', () => {
    expect(boreDiameterForCartridge('6.5 Creedmoor')).toBe(0.264);
    expect(boreDiameterForCartridge('6.5 CM')).toBe(0.264);
    expect(boreDiameterForCartridge('6.5mm Creedmoor')).toBe(0.264);
    expect(boreDiameterForCartridge('.308 Winchester')).toBe(0.308);
    expect(boreDiameterForCartridge('308 Win')).toBe(0.308);
    expect(boreDiameterForCartridge('30-06')).toBe(0.308);
    expect(boreDiameterForCartridge('300 PRC')).toBe(0.308);
    expect(boreDiameterForCartridge('7 PRC')).toBe(0.284);
    expect(boreDiameterForCartridge('338 Lapua')).toBe(0.338);
    expect(boreDiameterForCartridge('223 Rem')).toBe(0.224);
  });

  it('keeps the 6mm and 6.5mm families apart', () => {
    expect(boreDiameterForCartridge('6 Creedmoor')).toBe(0.243);
    expect(boreDiameterForCartridge('6mm Creedmoor')).toBe(0.243);
    expect(boreDiameterForCartridge('6 Dasher')).toBe(0.243);
    expect(boreDiameterForCartridge('6.5 PRC')).toBe(0.264);
  });

  it('falls back by family prefix for names not in the table, and gives up safely', () => {
    expect(boreDiameterForCartridge('6.5 SAUM')).toBe(0.264);
    expect(boreDiameterForCartridge('300 Savage')).toBe(0.308);
    expect(boreDiameterForCartridge('7mm Weatherby')).toBe(0.284);
    expect(boreDiameterForCartridge('22 Hornet')).toBe(0.224);
    expect(boreDiameterForCartridge('9.3x62')).toBeNull();
    expect(boreDiameterForCartridge('45-70')).toBeNull();
    expect(boreDiameterForCartridge('')).toBeNull();
    expect(boreDiameterForCartridge(null)).toBeNull();
    expect(boreDiameterForCartridge(undefined)).toBeNull();
  });
});
