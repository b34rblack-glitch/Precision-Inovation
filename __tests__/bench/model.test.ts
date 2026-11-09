import { describe, expect, it } from 'vitest';
import type { BenchItem } from '@/db/schema';
import type { CatalogBullet } from '@/data/bulletCatalog';
import {
  benchHasCatalogBullet,
  cartridgeTags,
  defaultPickerMode,
  findItem,
  hasItem,
  learnedFromLoad,
  normalizeName,
  pickerOptions,
} from '@/lib/bench/model';

const item = (o: Partial<BenchItem>): BenchItem =>
  ({ kind: 'powder', name: 'x', cartridge: null, source: 'manual', bulletMake: null, bulletModel: null, ...o }) as BenchItem;

const catalog = [
  { value: 'Hodgdon H1000', group: 'Hodgdon', note: 'slow, magnums' },
  { value: 'Hodgdon H4350', group: 'Hodgdon', note: 'mid-slow' },
  { value: 'Alliant Reloder 26', group: 'Alliant', note: 'very slow' },
];

describe('matching', () => {
  it('ignores case, spacing and punctuation', () => {
    expect(normalizeName(' Hodgdon  H-1000 ')).toBe('hodgdonh1000');
    const items = [item({ name: 'hodgdon h1000' })];
    expect(hasItem(items, 'powder', 'Hodgdon H1000')).toBe(true);
    expect(hasItem(items, 'primer', 'Hodgdon H1000')).toBe(false);
    expect(findItem(items, 'powder', 'HODGDON-H1000')?.name).toBe('hodgdon h1000');
  });

  it('matches a catalog bullet by its printed name or by make and model', () => {
    const b: CatalogBullet = { maker: 'Hornady', model: '212gr ELD-X', caliber: '.308', diameterIn: 0.308, weightGr: 212, bcG1: 0.673, bcG7: 0.336 };
    expect(benchHasCatalogBullet([item({ kind: 'bullet', name: 'Hornady 212gr ELD-X' })], b)).toBe(true);
    expect(benchHasCatalogBullet([item({ kind: 'bullet', name: 'anything', bulletMake: 'hornady', bulletModel: '212gr eld-x' })], b)).toBe(true);
    expect(benchHasCatalogBullet([item({ kind: 'bullet', name: 'Hornady ELD-X 212 gr', bulletMake: 'Hornady', bulletModel: 'ELD-X' })], b)).toBe(false);
  });
});

describe('pickerOptions', () => {
  const items = [
    item({ name: 'Hodgdon H1000' }),
    item({ name: 'Vihtavuori N570', source: 'learned' }),
    item({ kind: 'sizingDie', name: 'Hornady Match Grade', cartridge: '.300 PRC' }),
    item({ kind: 'sizingDie', name: 'Redding Type S', cartridge: '6.5 Creedmoor' }),
    item({ kind: 'sizingDie', name: 'Forster FL' }),
  ];

  it('in mine mode lists bench catalog entries then custom ones, and opens there when the bench has any', () => {
    expect(pickerOptions('powder', catalog, items, 'mine', null).map((o) => o.value)).toEqual(['Hodgdon H1000', 'Vihtavuori N570']);
    expect(pickerOptions('powder', catalog, items, 'mine', null)[1]?.group).toBe('On your bench');
    expect(defaultPickerMode(items, 'powder')).toBe('mine');
    expect(defaultPickerMode(items, 'primer')).toBe('all');
  });

  it('in all mode puts the bench first and keeps the rest', () => {
    expect(pickerOptions('powder', catalog, items, 'all', null).map((o) => o.value)).toEqual([
      'Hodgdon H1000',
      'Vihtavuori N570',
      'Hodgdon H4350',
      'Alliant Reloder 26',
    ]);
  });

  it('sorts dies tagged for the cartridge first and notes the tag', () => {
    const dies = [{ value: 'Redding Type S' }, { value: 'Forster FL' }, { value: 'Hornady Match Grade' }];
    const out = pickerOptions('sizingDie', dies, items, 'mine', '.300 prc');
    expect(out.map((o) => o.value)).toEqual(['Hornady Match Grade', 'Redding Type S', 'Forster FL']);
    expect(out[0]?.note).toBe('for .300 PRC');
    expect(out[2]?.note).toBeUndefined();
  });
});

describe('learnedFromLoad', () => {
  it('names every component and tool, tagging dies with the cartridge', () => {
    const learned = learnedFromLoad(
      {
        bulletMake: 'Hornady',
        bulletModel: 'ELD-X',
        bulletWeightGr: 212,
        bcValue: 0.336,
        bcModel: 'G7',
        powderName: ' H1000 ',
        primer: 'Fed 215M',
        brass: null,
        sizingDie: 'Hornady Match Grade',
        seatingDie: '',
        pressName: 'Iron Press',
      },
      '.300 PRC',
    );
    expect(learned.map((l) => [l.kind, l.name, l.cartridge])).toEqual([
      ['bullet', 'Hornady ELD-X 212 gr', null],
      ['powder', 'H1000', null],
      ['primer', 'Fed 215M', null],
      ['sizingDie', 'Hornady Match Grade', '.300 PRC'],
      ['press', 'Iron Press', null],
    ]);
    expect(learned[0]).toMatchObject({ bulletMake: 'Hornady', bulletModel: 'ELD-X', bulletWeightGr: 212, bcValue: 0.336, bcModel: 'G7' });
    expect(learnedFromLoad({}, null)).toEqual([]);
  });
});

describe('cartridgeTags', () => {
  it('lists each cartridge once, A to Z', () => {
    expect(cartridgeTags([{ cartridge: '.300 PRC' }, { cartridge: null }], [{ cartridge: '6.5 Creedmoor' }, { cartridge: '.300 prc' }])).toEqual([
      '.300 PRC',
      '6.5 Creedmoor',
    ]);
  });
});
