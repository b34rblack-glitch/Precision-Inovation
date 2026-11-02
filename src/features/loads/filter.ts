// Filtering for the Loads list. Pure (no React Native) so the matching rules
// can be tested on fixtures; the screen only owns the chips and the text box.

/** The rifle chip: every load, only unassigned loads, or one rifle's loads. */
export type RifleFilter = 'all' | 'unassigned' | { rifleId: string };

export type LoadFilter = {
  /** Free text; every whitespace-separated term must match name, cartridge or rifle name. */
  query: string;
  rifle: RifleFilter;
  /** Exact cartridge text as stored on the load; null means every cartridge. */
  cartridge: string | null;
};

export const EMPTY_LOAD_FILTER: LoadFilter = { query: '', rifle: 'all', cartridge: null };

type FilterableLoad = { name: string; cartridge: string | null; rifleId: string | null };

export function isFilterActive(filter: LoadFilter): boolean {
  return filter.query.trim() !== '' || filter.rifle !== 'all' || filter.cartridge !== null;
}

/** Distinct cartridges across the loads, trimmed, A to Z; blanks dropped. */
export function cartridgeOptions(loads: readonly FilterableLoad[]): string[] {
  const seen = new Set<string>();
  for (const load of loads) {
    const c = load.cartridge?.trim();
    if (c) seen.add(c);
  }
  return [...seen].sort((a, b) => a.localeCompare(b));
}

export function filterLoads<T extends FilterableLoad>(
  loads: readonly T[],
  filter: LoadFilter,
  rifleName: (rifleId: string) => string | undefined,
): T[] {
  const terms = filter.query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return loads.filter((load) => {
    if (filter.rifle === 'unassigned' && load.rifleId != null) return false;
    if (typeof filter.rifle === 'object' && load.rifleId !== filter.rifle.rifleId) return false;
    if (filter.cartridge !== null && (load.cartridge?.trim() ?? '') !== filter.cartridge) return false;
    if (terms.length === 0) return true;
    const hay = [load.name, load.cartridge ?? '', load.rifleId ? (rifleName(load.rifleId) ?? '') : '']
      .join(' ')
      .toLowerCase();
    return terms.every((t) => hay.includes(t));
  });
}
