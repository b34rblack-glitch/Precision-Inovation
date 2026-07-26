import type { PickerOption } from '@/lib/pickerOption';

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
  { value: 'Ramshot LRT', group: 'Ramshot', note: 'slow, magnums/overbore, temp-stable' },
  { value: 'Ramshot Magnum', group: 'Ramshot', note: 'very slow, magnums' },
  // Winchester / Norma
  { value: 'Winchester StaBALL 6.5', group: 'Winchester', note: 'mid-slow, temp-stable' },
  { value: 'Winchester StaBALL Match', group: 'Winchester', note: 'medium, temp-stable' },
  { value: 'Winchester 748', group: 'Winchester', note: 'medium ball' },
  { value: 'Norma 203-B', group: 'Norma', note: 'medium' },
  { value: 'Norma URP', group: 'Norma', note: 'mid-slow' },
  { value: 'Norma MRP', group: 'Norma', note: 'slow, magnums' },
];

// Common rifle primers by brand. `note` gives the size/type (Large/Small
// Rifle, Magnum, Match/Benchrest). Product names only.
export const PRIMER_OPTIONS: readonly PickerOption[] = [
  // CCI
  { value: 'CCI 200', group: 'CCI', note: 'Large Rifle' },
  { value: 'CCI 250', group: 'CCI', note: 'Large Rifle Magnum' },
  { value: 'CCI BR-2', group: 'CCI', note: 'Large Rifle Benchrest (match)' },
  { value: 'CCI 34', group: 'CCI', note: 'Large Rifle mil-spec' },
  { value: 'CCI 400', group: 'CCI', note: 'Small Rifle' },
  { value: 'CCI 450', group: 'CCI', note: 'Small Rifle Magnum' },
  { value: 'CCI BR-4', group: 'CCI', note: 'Small Rifle Benchrest (match)' },
  { value: 'CCI 41', group: 'CCI', note: 'Small Rifle mil-spec (5.56)' },
  // Federal
  { value: 'Federal 210', group: 'Federal', note: 'Large Rifle' },
  { value: 'Federal 210M', group: 'Federal', note: 'Large Rifle Match (Gold Medal)' },
  { value: 'Federal 215', group: 'Federal', note: 'Large Rifle Magnum' },
  { value: 'Federal 215M', group: 'Federal', note: 'Large Rifle Magnum Match' },
  { value: 'Federal 205', group: 'Federal', note: 'Small Rifle' },
  { value: 'Federal 205M', group: 'Federal', note: 'Small Rifle Match (Gold Medal)' },
  { value: 'Federal GM205M AR', group: 'Federal', note: 'Small Rifle Match, AR' },
  // Winchester
  { value: 'Winchester WLR', group: 'Winchester', note: 'Large Rifle' },
  { value: 'Winchester WLRM', group: 'Winchester', note: 'Large Rifle Magnum' },
  { value: 'Winchester WSR', group: 'Winchester', note: 'Small Rifle' },
  // Remington
  { value: 'Remington 9½', group: 'Remington', note: 'Large Rifle' },
  { value: 'Remington 9½M', group: 'Remington', note: 'Large Rifle Magnum' },
  { value: 'Remington 7½', group: 'Remington', note: 'Small Rifle Benchrest' },
  { value: 'Remington 6½', group: 'Remington', note: 'Small Rifle (light)' },
  // Others
  { value: 'RWS 5341', group: 'RWS', note: 'Large Rifle' },
  { value: 'RWS 4033', group: 'RWS', note: 'Small Rifle' },
  { value: 'Sellier & Bellot LR', group: 'Sellier & Bellot', note: 'Large Rifle' },
  { value: 'Sellier & Bellot SR', group: 'Sellier & Bellot', note: 'Small Rifle' },
  { value: 'Wolf/Tula KVB-7', group: 'Wolf/Tula', note: 'Small Rifle' },
  { value: 'Wolf/Tula KVB-762', group: 'Wolf/Tula', note: 'Large Rifle' },
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

// Common sizing dies, grouped by maker. `note` gives how the die sizes
// (full-length / neck / body) plus any bushing or mandrel detail.
export const SIZING_DIE_OPTIONS: readonly PickerOption[] = [
  // Redding
  { value: 'Redding Type S Full Length Bushing', group: 'Redding', note: 'full-length, bushing' },
  { value: 'Redding Type S Match Bushing Neck', group: 'Redding', note: 'neck, bushing' },
  { value: 'Redding Full Length', group: 'Redding', note: 'full-length, standard neck' },
  { value: 'Redding Body Die', group: 'Redding', note: 'body only, no neck sizing' },
  { value: 'Redding Competition Bushing Neck', group: 'Redding', note: 'neck, bushing' },
  // Forster
  { value: 'Forster Full Length (honed)', group: 'Forster', note: 'full-length, honed neck' },
  { value: 'Forster Bench Rest Full Length', group: 'Forster', note: 'full-length' },
  { value: 'Forster Bench Rest Neck', group: 'Forster', note: 'neck' },
  // Whidden
  { value: 'Whidden Full Length Bushing', group: 'Whidden', note: 'full-length, bushing' },
  { value: 'Whidden Click-Adjustable Full Length', group: 'Whidden', note: 'full-length, click bump' },
  { value: 'Whidden Body Die', group: 'Whidden', note: 'body only' },
  // Hornady / RCBS / others
  { value: 'Hornady Match Grade Full Length', group: 'Hornady', note: 'full-length, bushing' },
  { value: 'Hornady Custom Grade Full Length', group: 'Hornady', note: 'full-length' },
  { value: 'RCBS Full Length', group: 'RCBS', note: 'full-length' },
  { value: 'RCBS Small Base', group: 'RCBS', note: 'full-length, small base' },
  { value: 'RCBS Neck Sizer', group: 'RCBS', note: 'neck' },
  { value: 'L.E. Wilson Bushing Neck', group: 'L.E. Wilson', note: 'neck, arbor press' },
  { value: 'Lee Collet Neck', group: 'Lee', note: 'neck, collet (no lube)' },
  { value: 'Harrell’s Full Length Bushing', group: 'Harrell’s', note: 'full-length, bushing' },
  { value: '21st Century Bushing Neck', group: '21st Century', note: 'neck, bushing' },
];

// Common seating dies, grouped by maker. `note` flags whether the die carries
// a micrometer and whether it is an arbor (hand) die.
export const SEATING_DIE_OPTIONS: readonly PickerOption[] = [
  { value: 'Redding Competition Seating', group: 'Redding', note: 'micrometer, sliding sleeve' },
  { value: 'Redding Standard Seating', group: 'Redding', note: 'no micrometer' },
  { value: 'Forster Ultra Micrometer Seater', group: 'Forster', note: 'micrometer' },
  { value: 'Forster Bench Rest Seater', group: 'Forster', note: 'no micrometer, sliding sleeve' },
  { value: 'Whidden Click-Adjustable Seater', group: 'Whidden', note: 'micrometer' },
  { value: 'Hornady Match Grade Seater', group: 'Hornady', note: 'micrometer' },
  { value: 'RCBS Gold Medal Match Seater', group: 'RCBS', note: 'micrometer' },
  { value: 'RCBS Competition Seater', group: 'RCBS', note: 'micrometer, window' },
  { value: 'L.E. Wilson Micrometer Seater', group: 'L.E. Wilson', note: 'micrometer, arbor press' },
  { value: 'L.E. Wilson Stainless Seater', group: 'L.E. Wilson', note: 'no micrometer, arbor press' },
  { value: 'K&M Arbor Seater', group: 'K&M', note: 'micrometer, arbor press' },
  { value: '21st Century Arbor Seater', group: '21st Century', note: 'micrometer, arbor press' },
  { value: 'Area 419 Zero Seater', group: 'Area 419', note: 'micrometer' },
];

// Common presses, grouped by action type rather than maker (the maker is
// already in the name, and the action is what changes the process).
export const PRESS_OPTIONS: readonly PickerOption[] = [
  { value: 'Forster Co-Ax', group: 'Single stage', note: 'floating shell holder' },
  { value: 'RCBS Rock Chucker Supreme', group: 'Single stage', note: 'O-frame' },
  { value: 'Redding Big Boss II', group: 'Single stage', note: 'O-frame' },
  { value: 'Redding Ultramag', group: 'Single stage', note: 'top-linkage, high leverage' },
  { value: 'Hornady Lock-N-Load Classic', group: 'Single stage', note: 'bushing quick-change' },
  { value: 'Lee Classic Cast', group: 'Single stage', note: 'O-frame' },
  { value: 'Area 419 ZERO', group: 'Single stage', note: 'precision single stage' },
  { value: 'Frankford Arsenal M-Press', group: 'Single stage', note: 'co-axial' },
  { value: 'Lyman Brass Smith Victory', group: 'Single stage', note: 'O-frame' },
  { value: 'L.E. Wilson Arbor Press', group: 'Arbor', note: 'hand dies, benchrest' },
  { value: 'K&M Arbor Press', group: 'Arbor', note: 'hand dies, force pack option' },
  { value: '21st Century Arbor Press', group: 'Arbor', note: 'hand dies' },
  { value: 'Harrell’s Combo Arbor Press', group: 'Arbor', note: 'hand dies' },
  { value: 'Redding T-7 Turret', group: 'Turret', note: '7-station turret' },
  { value: 'Lyman All-American 8 Turret', group: 'Turret', note: '8-station turret' },
  { value: 'Dillon RL550', group: 'Progressive', note: 'manual index' },
  { value: 'Dillon XL750', group: 'Progressive', note: 'auto index' },
];
