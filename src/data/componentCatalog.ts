import { PickerOption } from '@/components/ListPickerModal';

// Reference pick-lists to speed load entry. These are PRODUCT NAMES ONLY —
// deliberately NO powder charges, load recipes, or "start/max" data. Charge
// weights are the user's own worked-up data (and a safety/liability matter),
// so they are always entered by hand. A name list carries no such concerns.
//
// Read-only reference data; not part of user data, never included in backups.

// Common smokeless rifle powders, grouped by maker. `note` gives a rough
// application hint, not load data.
export const POWDER_OPTIONS: readonly PickerOption[] = [
  // Hodgdon
  { value: 'Hodgdon H4350', group: 'Hodgdon', note: 'mid-slow, 6.5CM/short mags' },
  { value: 'Hodgdon H4831SC', group: 'Hodgdon', note: 'slow, magnums' },
  { value: 'Hodgdon Varget', group: 'Hodgdon', note: 'medium, .308/.223' },
  { value: 'Hodgdon H4895', group: 'Hodgdon', note: 'medium' },
  { value: 'Hodgdon H1000', group: 'Hodgdon', note: 'slow, magnums' },
  { value: 'Hodgdon Retumbo', group: 'Hodgdon', note: 'very slow, overbore magnums' },
  { value: 'Hodgdon H322', group: 'Hodgdon', note: 'fast, small cases' },
  { value: 'Hodgdon Benchmark', group: 'Hodgdon', note: 'fast, .223/6BR' },
  { value: 'Hodgdon CFE 223', group: 'Hodgdon', note: 'medium-fast' },
  { value: 'Hodgdon H4198', group: 'Hodgdon', note: 'fast' },
  { value: 'Hodgdon US 869', group: 'Hodgdon', note: 'very slow, big magnums' },
  { value: 'Hodgdon Superformance', group: 'Hodgdon', note: 'medium' },
  // IMR
  { value: 'IMR 4064', group: 'IMR', note: 'medium, .308' },
  { value: 'IMR 4166 (Enduron)', group: 'IMR', note: 'medium' },
  { value: 'IMR 4451 (Enduron)', group: 'IMR', note: 'mid-slow' },
  { value: 'IMR 4955 (Enduron)', group: 'IMR', note: 'slow' },
  { value: 'IMR 4350', group: 'IMR', note: 'mid-slow' },
  { value: 'IMR 4895', group: 'IMR', note: 'medium' },
  { value: 'IMR 8208 XBR', group: 'IMR', note: 'fast-medium' },
  { value: 'IMR 7828 SSC', group: 'IMR', note: 'slow, magnums' },
  // Alliant
  { value: 'Alliant Reloder 15', group: 'Alliant', note: 'medium, .308' },
  { value: 'Alliant Reloder 16', group: 'Alliant', note: 'mid-slow, temp-stable' },
  { value: 'Alliant Reloder 17', group: 'Alliant', note: 'mid-slow' },
  { value: 'Alliant Reloder 23', group: 'Alliant', note: 'slow, temp-stable' },
  { value: 'Alliant Reloder 26', group: 'Alliant', note: 'very slow, magnums' },
  { value: 'Alliant Reloder 33', group: 'Alliant', note: 'very slow, big magnums' },
  { value: 'Alliant Reloder 10x', group: 'Alliant', note: 'fast' },
  { value: 'Alliant Reloder 19', group: 'Alliant', note: 'slow' },
  { value: 'Alliant Reloder 22', group: 'Alliant', note: 'slow, magnums' },
  // Vihtavuori
  { value: 'Vihtavuori N140', group: 'Vihtavuori', note: 'medium' },
  { value: 'Vihtavuori N150', group: 'Vihtavuori', note: 'mid-slow' },
  { value: 'Vihtavuori N160', group: 'Vihtavuori', note: 'slow' },
  { value: 'Vihtavuori N165', group: 'Vihtavuori', note: 'slow, magnums' },
  { value: 'Vihtavuori N170', group: 'Vihtavuori', note: 'very slow, magnums' },
  { value: 'Vihtavuori N540', group: 'Vihtavuori', note: 'medium, high-energy' },
  { value: 'Vihtavuori N555', group: 'Vihtavuori', note: 'mid-slow, high-energy' },
  { value: 'Vihtavuori N565', group: 'Vihtavuori', note: 'slow, high-energy' },
  { value: 'Vihtavuori N133', group: 'Vihtavuori', note: 'fast, .223/6BR' },
  { value: 'Vihtavuori N135', group: 'Vihtavuori', note: 'medium-fast' },
  // Accurate / Ramshot (Western Powders)
  { value: 'Accurate 2495', group: 'Accurate', note: 'medium' },
  { value: 'Accurate 4064', group: 'Accurate', note: 'medium' },
  { value: 'Accurate 4350', group: 'Accurate', note: 'mid-slow' },
  { value: 'Accurate 4831', group: 'Accurate', note: 'slow' },
  { value: 'Accurate MagPro', group: 'Accurate', note: 'slow, magnums' },
  { value: 'Ramshot TAC', group: 'Ramshot', note: 'medium-fast, .223/.308' },
  { value: 'Ramshot Hunter', group: 'Ramshot', note: 'mid-slow' },
  { value: 'Ramshot Magnum', group: 'Ramshot', note: 'very slow, magnums' },
  // Winchester / Norma
  { value: 'Winchester StaBALL 6.5', group: 'Winchester', note: 'mid-slow, temp-stable' },
  { value: 'Winchester StaBALL Match', group: 'Winchester', note: 'medium, temp-stable' },
  { value: 'Winchester 748', group: 'Winchester', note: 'medium ball' },
  { value: 'Norma 203-B', group: 'Norma', note: 'medium' },
  { value: 'Norma URP', group: 'Norma', note: 'mid-slow' },
  { value: 'Norma MRP', group: 'Norma', note: 'slow, magnums' },
];

// Common cartridge brass by brand. Brand only — cartridge is chosen elsewhere.
export const BRASS_OPTIONS: readonly PickerOption[] = [
  { value: 'Lapua', note: 'premium' },
  { value: 'Alpha Munitions', note: 'premium' },
  { value: 'Peterson', note: 'premium' },
  { value: 'ADG (Atlas)', note: 'premium' },
  { value: 'RWS', note: 'premium' },
  { value: 'Norma', note: 'premium' },
  { value: 'Hornady', note: 'standard' },
  { value: 'Nosler', note: 'standard' },
  { value: 'Winchester', note: 'standard' },
  { value: 'Federal', note: 'standard' },
  { value: 'Remington', note: 'standard' },
  { value: 'Starline', note: 'standard' },
  { value: 'Sako', note: 'standard' },
  { value: 'Prvi Partizan (PPU)', note: 'budget' },
  { value: 'Lake City', note: 'military surplus' },
  { value: 'Once-fired / mixed', note: 'range brass' },
];
