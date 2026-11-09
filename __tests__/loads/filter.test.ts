import { describe, expect, it } from 'vitest';
import {
  cartridgeOptions,
  EMPTY_LOAD_FILTER,
  filterLoads,
  isFilterActive,
  type LoadFilter,
} from '@/features/loads/filter';

const loads = [
  { id: 'a', name: 'Hornady ELD-X 212 gr handload', cartridge: '.300 PRC', rifleId: 'mpr' },
  { id: 'b', name: 'Barnes LRX 208 gr handload', cartridge: '.300 PRC', rifleId: null },
  { id: 'c', name: 'Federal Terminal Ascent 175 gr (factory)', cartridge: '.300 Win Mag', rifleId: 'cross' },
  { id: 'd', name: 'Scratch recipe', cartridge: null, rifleId: null },
  { id: 'e', name: 'Berger 205 EH', cartridge: ' .300 PRC ', rifleId: 'mpr' },
];

const rifleName = (id: string) =>
  ({ mpr: 'Christensen Arms MPR .300 PRC', cross: 'SIG CROSS Magnum .300 Win Mag' })[id];

const ids = (filter: Partial<LoadFilter>) =>
  filterLoads(loads, { ...EMPTY_LOAD_FILTER, ...filter }, rifleName).map((l) => l.id);

describe('filterLoads', () => {
  it('passes everything through with the empty filter', () => {
    expect(ids({})).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('narrows by rifle, including the unassigned bucket', () => {
    expect(ids({ rifle: { rifleId: 'mpr' } })).toEqual(['a', 'e']);
    expect(ids({ rifle: 'unassigned' })).toEqual(['b', 'd']);
  });

  it('narrows by cartridge, ignoring surrounding whitespace on the load', () => {
    expect(ids({ cartridge: '.300 PRC' })).toEqual(['a', 'b', 'e']);
    expect(ids({ cartridge: '.300 Win Mag' })).toEqual(['c']);
  });

  it('matches every search term against name, cartridge and rifle name, case-insensitively', () => {
    expect(ids({ query: 'barnes' })).toEqual(['b']);
    expect(ids({ query: 'prc 208' })).toEqual(['b']);
    expect(ids({ query: 'christensen' })).toEqual(['a', 'e']);
    expect(ids({ query: '  win   mag ' })).toEqual(['c']);
    expect(ids({ query: 'nothing-here' })).toEqual([]);
  });

  it('combines the three controls', () => {
    expect(ids({ query: 'handload', rifle: { rifleId: 'mpr' }, cartridge: '.300 PRC' })).toEqual(['a']);
  });
});

describe('cartridgeOptions', () => {
  it('lists each cartridge once, trimmed and sorted, dropping blanks', () => {
    expect(cartridgeOptions(loads)).toEqual(['.300 PRC', '.300 Win Mag']);
    expect(cartridgeOptions([{ name: 'x', cartridge: '  ', rifleId: null }])).toEqual([]);
  });
});

describe('isFilterActive', () => {
  it('is off for the empty filter and a whitespace-only query', () => {
    expect(isFilterActive(EMPTY_LOAD_FILTER)).toBe(false);
    expect(isFilterActive({ ...EMPTY_LOAD_FILTER, query: '   ' })).toBe(false);
  });

  it('is on when any control is set', () => {
    expect(isFilterActive({ ...EMPTY_LOAD_FILTER, query: 'a' })).toBe(true);
    expect(isFilterActive({ ...EMPTY_LOAD_FILTER, rifle: 'unassigned' })).toBe(true);
    expect(isFilterActive({ ...EMPTY_LOAD_FILTER, cartridge: '.300 PRC' })).toBe(true);
  });
});
