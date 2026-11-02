// Cartridge name -> bullet diameter, so a rifle's free-text cartridge can
// narrow the bullet catalog to bullets that actually fit its bore.
//
// Reference data only: no load data, no case dimensions, nothing that implies
// a charge. Unknown or unusual names return null and the caller shows every
// caliber — a wrong guess would be worse than no filter.
//
// PURE: no imports (see __tests__/purity.test.ts).

export type CartridgeBore = {
  /** Bullet diameter in inches, matching `CatalogBullet.diameterIn`. */
  diameterIn: number;
  /** Display name first, then the spellings people actually type. */
  names: readonly string[];
};

export const CARTRIDGE_BORES: readonly CartridgeBore[] = [
  // .224
  { diameterIn: 0.224, names: ['.223 Remington', '223 Rem', '223'] },
  { diameterIn: 0.224, names: ['5.56 NATO', '5.56x45', '5.56'] },
  { diameterIn: 0.224, names: ['.22-250 Remington', '22-250'] },
  { diameterIn: 0.224, names: ['.224 Valkyrie', '224 Valkyrie'] },
  { diameterIn: 0.224, names: ['.22 ARC', '22 ARC'] },
  { diameterIn: 0.224, names: ['.22 Creedmoor', '22 Creedmoor', '22 CM'] },
  { diameterIn: 0.224, names: ['.220 Swift', '220 Swift'] },
  { diameterIn: 0.224, names: ['.22 Nosler', '22 Nosler'] },
  // .243
  { diameterIn: 0.243, names: ['.243 Winchester', '243 Win', '243'] },
  { diameterIn: 0.243, names: ['6mm Creedmoor', '6 Creedmoor', '6 CM', '6mm CM'] },
  { diameterIn: 0.243, names: ['6mm Dasher', '6 Dasher'] },
  { diameterIn: 0.243, names: ['6mm BR', '6 BR', '6mm BR Norma', '6BR'] },
  { diameterIn: 0.243, names: ['6mm BRA', '6 BRA'] },
  { diameterIn: 0.243, names: ['6mm GT', '6 GT'] },
  { diameterIn: 0.243, names: ['6mm ARC', '6 ARC'] },
  { diameterIn: 0.243, names: ['6XC', '6mm XC'] },
  { diameterIn: 0.243, names: ['6mm Remington', '6mm Rem'] },
  // .264
  { diameterIn: 0.264, names: ['6.5 Creedmoor', '6.5mm Creedmoor', '6.5 CM', '6.5CM', '65CM'] },
  { diameterIn: 0.264, names: ['6.5 PRC', '6.5mm PRC'] },
  { diameterIn: 0.264, names: ['6.5x47 Lapua', '6.5x47', '6.5-47'] },
  { diameterIn: 0.264, names: ['6.5x55 Swedish', '6.5x55', '6.5 Swede'] },
  { diameterIn: 0.264, names: ['.260 Remington', '260 Rem', '260'] },
  { diameterIn: 0.264, names: ['6.5 Grendel', '6.5mm Grendel'] },
  { diameterIn: 0.264, names: ['6.5-284 Norma', '6.5-284'] },
  { diameterIn: 0.264, names: ['6.5 Weatherby RPM', '6.5 RPM'] },
  { diameterIn: 0.264, names: ['.264 Winchester Magnum', '264 Win Mag'] },
  // .284
  { diameterIn: 0.284, names: ['7mm Remington Magnum', '7mm Rem Mag', '7 Rem Mag', '7mm RM'] },
  { diameterIn: 0.284, names: ['7mm PRC', '7 PRC'] },
  { diameterIn: 0.284, names: ['7mm SAUM', '7 SAUM', '7mm Rem SAUM'] },
  { diameterIn: 0.284, names: ['.280 Ackley Improved', '280 AI', '280 Ackley'] },
  { diameterIn: 0.284, names: ['.280 Remington', '280 Rem'] },
  { diameterIn: 0.284, names: ['.284 Winchester', '284 Win', '284'] },
  { diameterIn: 0.284, names: ['7mm-08 Remington', '7mm-08', '7-08'] },
  { diameterIn: 0.284, names: ['7mm WSM', '7 WSM'] },
  // .308
  { diameterIn: 0.308, names: ['.308 Winchester', '308 Win', '308', '7.62x51', '7.62 NATO'] },
  { diameterIn: 0.308, names: ['.30-06 Springfield', '30-06', '3006'] },
  { diameterIn: 0.308, names: ['.300 Winchester Magnum', '300 Win Mag', '300 WM', '300WM'] },
  { diameterIn: 0.308, names: ['.300 PRC', '300 PRC'] },
  { diameterIn: 0.308, names: ['.300 Norma Magnum', '300 Norma', '300 NM'] },
  { diameterIn: 0.308, names: ['.300 WSM', '300 WSM'] },
  { diameterIn: 0.308, names: ['.30 Nosler', '30 Nosler'] },
  { diameterIn: 0.308, names: ['.300 RUM', '300 RUM', '300 Remington Ultra Magnum'] },
  { diameterIn: 0.308, names: ['.300 Blackout', '300 BLK', '300 AAC'] },
  { diameterIn: 0.308, names: ['.30-30 Winchester', '30-30'] },
  { diameterIn: 0.308, names: ['.300 Weatherby Magnum', '300 Wby'] },
  // .338
  { diameterIn: 0.338, names: ['.338 Lapua Magnum', '338 Lapua', '338 LM', '338LM'] },
  { diameterIn: 0.338, names: ['.338 Norma Magnum', '338 Norma', '338 NM'] },
  { diameterIn: 0.338, names: ['.338 Winchester Magnum', '338 Win Mag', '338 WM'] },
  { diameterIn: 0.338, names: ['.338 RUM', '338 RUM'] },
  { diameterIn: 0.338, names: ['.338 Federal', '338 Fed'] },
];

/**
 * Collapse the spellings of one cartridge onto one key: lower-case, drop a
 * leading dot, treat a decimal comma as a dot, drop "mm" right after the
 * leading number, then strip everything that is not a letter or digit.
 * `.308 Winchester` -> `308winchester`; `6,5 CM` -> `65cm`; `30-06` -> `3006`.
 */
export function normalizeCartridgeName(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/^\./, '')
    .replace(/(\d),(\d)/g, '$1.$2')
    .replace(/^(\d+(?:\.\d+)?)\s*mm\b/, '$1')
    .replace(/[^a-z0-9]/g, '');
}

const ALIASES: ReadonlyMap<string, number> = new Map(
  CARTRIDGE_BORES.flatMap((c) => c.names.map((n) => [normalizeCartridgeName(n), c.diameterIn])),
);

// Family fallback for names not in the table. Deliberately conservative:
// only the leading caliber token is read, longest prefixes first, and a
// bare "6" or "7" must be followed by a non-digit so "65…" and "7mm" are not
// swallowed by the wrong family.
const FAMILY_PREFIXES: readonly { re: RegExp; diameterIn: number }[] = [
  { re: /^(65|264|260)/, diameterIn: 0.264 },
  { re: /^(284|280|708|7(?![0-9]))/, diameterIn: 0.284 },
  { re: /^338/, diameterIn: 0.338 },
  { re: /^(308|300|3006|3030|762|30(?![0-9]))/, diameterIn: 0.308 },
  { re: /^(243|6(?![0-9]))/, diameterIn: 0.243 },
  { re: /^(224|223|2250|556|22(?![0-9]))/, diameterIn: 0.224 },
];

/** Bullet diameter for a cartridge name, or null when it can't be told safely. */
export function boreDiameterForCartridge(name: string | null | undefined): number | null {
  if (!name) return null;
  const key = normalizeCartridgeName(name);
  if (!key) return null;
  const exact = ALIASES.get(key);
  if (exact != null) return exact;
  for (const { re, diameterIn } of FAMILY_PREFIXES) {
    if (re.test(key)) return diameterIn;
  }
  return null;
}
