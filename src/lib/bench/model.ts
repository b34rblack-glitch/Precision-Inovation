// The bench: which components and tools the pickers show first. Pure rules
// over bench rows and the bundled catalogs; the screens render what comes
// back and the repository persists it.

import type { BenchItem, BenchKind } from '@/db/schema';
import type { CatalogBullet } from '@/data/bulletCatalog';
import type { PickerOption } from '@/lib/pickerOption';

export const BENCH_KINDS: readonly BenchKind[] = [
  'bullet',
  'powder',
  'primer',
  'brass',
  'sizingDie',
  'seatingDie',
  'press',
];

export const BENCH_KIND_LABELS: Record<BenchKind, string> = {
  bullet: 'Bullets',
  powder: 'Powders',
  primer: 'Primers',
  brass: 'Brass',
  sizingDie: 'Sizing dies',
  seatingDie: 'Seating dies',
  press: 'Presses',
};

/** Dies belong to a cartridge; nothing else does. */
export const CARTRIDGE_KINDS: ReadonlySet<BenchKind> = new Set(['sizingDie', 'seatingDie']);

/** Case, spacing and punctuation insensitive key for matching names. */
export const normalizeName = (s: string | null | undefined): string =>
  (s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');

export const bulletDisplayName = (b: { make: string | null | undefined; model: string | null | undefined; weightGr: number | null | undefined }) =>
  [b.make, b.model, b.weightGr != null ? `${b.weightGr} gr` : null].filter(Boolean).join(' ');

/** Catalog bullets print as "Maker Model" (the model already carries the weight). */
export const catalogBulletName = (b: CatalogBullet) => `${b.maker} ${b.model}`;

export function itemsOfKind(items: readonly BenchItem[], kind: BenchKind): BenchItem[] {
  return items.filter((i) => i.kind === kind);
}

/** True when a bench row exists for this name (case and punctuation aside). */
export function hasItem(items: readonly BenchItem[], kind: BenchKind, name: string): boolean {
  const key = normalizeName(name);
  return items.some((i) => i.kind === kind && normalizeName(i.name) === key);
}

export function findItem(items: readonly BenchItem[], kind: BenchKind, name: string): BenchItem | null {
  const key = normalizeName(name);
  return items.find((i) => i.kind === kind && normalizeName(i.name) === key) ?? null;
}

/** Bench bullets match a catalog bullet by maker and model (the model names the weight). */
export function benchHasCatalogBullet(items: readonly BenchItem[], b: CatalogBullet): boolean {
  const key = normalizeName(catalogBulletName(b));
  return items.some(
    (i) =>
      i.kind === 'bullet' &&
      (normalizeName(i.name) === key ||
        (normalizeName(i.bulletMake) === normalizeName(b.maker) &&
          normalizeName(i.bulletModel) === normalizeName(b.model))),
  );
}

export type PickerMode = 'mine' | 'all';

/**
 * The options a picker lists. In "mine" mode: catalog entries on the bench,
 * then bench entries the catalog does not know (custom or learned), with the
 * ones tagged for `cartridge` first and a note saying so. In "all" mode: the
 * whole catalog, bench entries first in the same order, then the rest.
 */
export function pickerOptions(
  kind: BenchKind,
  catalog: readonly PickerOption[],
  items: readonly BenchItem[],
  mode: PickerMode,
  cartridge: string | null | undefined,
): PickerOption[] {
  const mine = itemsOfKind(items, kind);
  const byKey = new Map(mine.map((i) => [normalizeName(i.name), i]));
  const cartKey = normalizeName(cartridge);
  const forCartridge = (i: BenchItem | undefined) =>
    !!i && !!cartKey && normalizeName(i.cartridge) === cartKey;
  const tagNote = (i: BenchItem | undefined, note: string | undefined) => {
    if (!i?.cartridge) return note;
    const tag = `for ${i.cartridge}`;
    return note ? `${tag} · ${note}` : tag;
  };

  const inCatalog = new Set<string>();
  const owned: { opt: PickerOption; item: BenchItem }[] = [];
  const rest: PickerOption[] = [];
  for (const opt of catalog) {
    const key = normalizeName(opt.value);
    inCatalog.add(key);
    const item = byKey.get(key);
    if (item) owned.push({ opt: { ...opt, note: tagNote(item, opt.note) }, item });
    else rest.push(opt);
  }
  for (const item of mine) {
    if (inCatalog.has(normalizeName(item.name))) continue;
    owned.push({ opt: { value: item.name, group: 'On your bench', note: tagNote(item, undefined) }, item });
  }
  owned.sort((a, b) => Number(forCartridge(b.item)) - Number(forCartridge(a.item)));
  const ownedOpts = owned.map((o) => o.opt);
  return mode === 'mine' ? ownedOpts : [...ownedOpts, ...rest];
}

/** A picker opens on "mine" when the bench has anything of that kind. */
export function defaultPickerMode(items: readonly BenchItem[], kind: BenchKind): PickerMode {
  return itemsOfKind(items, kind).length > 0 ? 'mine' : 'all';
}

export type LearnedItem = Pick<
  BenchItem,
  'kind' | 'name' | 'cartridge' | 'bulletMake' | 'bulletModel' | 'bulletWeightGr' | 'bulletDiameterIn' | 'bcValue' | 'bcModel'
>;

/**
 * What a saved load teaches the bench: every named component and tool on
 * it. Dies take the load's cartridge as their tag; the rest carry none.
 */
export function learnedFromLoad(
  components: {
    bulletMake?: string | null;
    bulletModel?: string | null;
    bulletWeightGr?: number | null;
    bulletDiameterIn?: number | null;
    bcValue?: number | null;
    bcModel?: 'G1' | 'G7' | null;
    powderName?: string | null;
    primer?: string | null;
    brass?: string | null;
    sizingDie?: string | null;
    seatingDie?: string | null;
    pressName?: string | null;
  },
  cartridge: string | null | undefined,
): LearnedItem[] {
  const out: LearnedItem[] = [];
  const blank: Omit<LearnedItem, 'kind' | 'name'> = {
    cartridge: null,
    bulletMake: null,
    bulletModel: null,
    bulletWeightGr: null,
    bulletDiameterIn: null,
    bcValue: null,
    bcModel: null,
  };
  const name = (s: string | null | undefined) => (s ?? '').trim();
  if (name(components.bulletMake) || name(components.bulletModel)) {
    out.push({
      ...blank,
      kind: 'bullet',
      name: bulletDisplayName({ make: name(components.bulletMake), model: name(components.bulletModel), weightGr: components.bulletWeightGr }),
      bulletMake: name(components.bulletMake) || null,
      bulletModel: name(components.bulletModel) || null,
      bulletWeightGr: components.bulletWeightGr ?? null,
      bulletDiameterIn: components.bulletDiameterIn ?? null,
      bcValue: components.bcValue ?? null,
      bcModel: components.bcModel ?? null,
    });
  }
  const tag = name(cartridge) || null;
  const simple: [BenchKind, string | null | undefined, string | null][] = [
    ['powder', components.powderName, null],
    ['primer', components.primer, null],
    ['brass', components.brass, null],
    ['sizingDie', components.sizingDie, tag],
    ['seatingDie', components.seatingDie, tag],
    ['press', components.pressName, null],
  ];
  for (const [kind, value, cart] of simple) {
    if (name(value)) out.push({ ...blank, kind, name: name(value), cartridge: cart });
  }
  return out;
}

/** Bench rows as the My Bench screen lists them: catalog ticks, then custom, A to Z. */
export function sortedItems(items: readonly BenchItem[], kind: BenchKind): BenchItem[] {
  return itemsOfKind(items, kind).sort((a, b) => a.name.localeCompare(b.name));
}

/** The cartridges a die can be tagged with: whatever the rifles and loads already use. */
export function cartridgeTags(
  rifles: readonly { cartridge: string | null }[],
  loads: readonly { cartridge: string | null }[],
): string[] {
  const seen = new Map<string, string>();
  for (const r of [...rifles, ...loads]) {
    const c = r.cartridge?.trim();
    if (c && !seen.has(normalizeName(c))) seen.set(normalizeName(c), c);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}
