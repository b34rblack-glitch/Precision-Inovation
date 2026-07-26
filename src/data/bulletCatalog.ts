// Bundled bullet reference catalog — a convenience starting point for load
// entry, NOT authoritative ballistics.
//
// Every BC below is a NOMINAL, manufacturer-published figure (Berger, Hornady,
// Sierra, Nosler product charts / manuals). BCs are facts, not the makers'
// copyrightable expression, and naming a bullet to identify it is ordinary
// nominative use — but they are still only a starting point:
//   * Published BCs (especially single-number G1) tend to run optimistic.
//   * BC varies with velocity, altitude, and your barrel.
// The app treats these as defaults you can override, and you can true muzzle
// velocity against real DOPE. Prefer G7 for long range; verify with a chrono.
//
// This table is read-only reference data. It is NOT part of user data and is
// never included in backups.

export type BulletMaker = 'Berger' | 'Hornady' | 'Sierra' | 'Nosler';

export type CatalogBullet = {
  maker: BulletMaker;
  model: string;
  /** Display caliber label, e.g. "6.5mm" or ".308". */
  caliber: string;
  /** Bullet diameter, inches — for grouping/filtering, not used by the solver. */
  diameterIn: number;
  weightGr: number;
  /** G1 ballistic coefficient (nominal, published). Null if not published. */
  bcG1: number | null;
  /** G7 ballistic coefficient (nominal, published). Null if not published. */
  bcG7: number | null;
};

// Ordered roughly by caliber then weight within each maker. Kept focused on
// popular precision/match and long-range hunting bullets.
export const BULLET_CATALOG: readonly CatalogBullet[] = [
  // ---------------- Berger (publishes Doppler-measured G1 + G7) ----------------
  { maker: 'Berger', model: '80.5gr Fullbore', caliber: '.224', diameterIn: 0.224, weightGr: 80.5, bcG1: 0.463, bcG7: 0.237 },
  { maker: 'Berger', model: '85.5gr Long Range HT', caliber: '.224', diameterIn: 0.224, weightGr: 85.5, bcG1: 0.496, bcG7: 0.254 },
  { maker: 'Berger', model: '105gr Hybrid Target', caliber: '6mm', diameterIn: 0.243, weightGr: 105, bcG1: 0.545, bcG7: 0.279 },
  { maker: 'Berger', model: '109gr Long Range HT', caliber: '6mm', diameterIn: 0.243, weightGr: 109, bcG1: 0.564, bcG7: 0.289 },
  { maker: 'Berger', model: '130gr AR Hybrid OTM', caliber: '6.5mm', diameterIn: 0.264, weightGr: 130, bcG1: 0.545, bcG7: 0.279 },
  { maker: 'Berger', model: '140gr Hybrid Target', caliber: '6.5mm', diameterIn: 0.264, weightGr: 140, bcG1: 0.607, bcG7: 0.311 },
  { maker: 'Berger', model: '140gr Elite Hunter', caliber: '6.5mm', diameterIn: 0.264, weightGr: 140, bcG1: 0.612, bcG7: 0.313 },
  { maker: 'Berger', model: '144gr Long Range HT', caliber: '6.5mm', diameterIn: 0.264, weightGr: 144, bcG1: 0.652, bcG7: 0.334 },
  { maker: 'Berger', model: '153.5gr Long Range HT', caliber: '6.5mm', diameterIn: 0.264, weightGr: 153.5, bcG1: 0.69, bcG7: 0.353 },
  { maker: 'Berger', model: '168gr Classic Hunter', caliber: '7mm', diameterIn: 0.284, weightGr: 168, bcG1: 0.531, bcG7: 0.272 },
  { maker: 'Berger', model: '180gr Hybrid Target', caliber: '7mm', diameterIn: 0.284, weightGr: 180, bcG1: 0.68, bcG7: 0.348 },
  { maker: 'Berger', model: '184gr F-Open Hybrid', caliber: '7mm', diameterIn: 0.284, weightGr: 184, bcG1: 0.707, bcG7: 0.362 },
  { maker: 'Berger', model: '195gr EOL Elite Hunter', caliber: '7mm', diameterIn: 0.284, weightGr: 195, bcG1: 0.755, bcG7: 0.386 },
  { maker: 'Berger', model: '185gr Juggernaut OTM', caliber: '.308', diameterIn: 0.308, weightGr: 185, bcG1: 0.552, bcG7: 0.283 },
  { maker: 'Berger', model: '200.20X Hybrid Target', caliber: '.308', diameterIn: 0.308, weightGr: 200, bcG1: 0.64, bcG7: 0.328 },
  { maker: 'Berger', model: '215gr Hybrid Target', caliber: '.308', diameterIn: 0.308, weightGr: 215, bcG1: 0.691, bcG7: 0.354 },
  { maker: 'Berger', model: '230gr Hybrid Target OTM', caliber: '.308', diameterIn: 0.308, weightGr: 230, bcG1: 0.743, bcG7: 0.38 },
  { maker: 'Berger', model: '300gr Hybrid OTM', caliber: '.338', diameterIn: 0.338, weightGr: 300, bcG1: 0.818, bcG7: 0.419 },

  // ---------------- Hornady (ELD Match / ELD-X publish G1 + G7) ----------------
  { maker: 'Hornady', model: '73gr ELD-M', caliber: '.224', diameterIn: 0.224, weightGr: 73, bcG1: 0.398, bcG7: 0.2 },
  { maker: 'Hornady', model: '75gr ELD-M', caliber: '.224', diameterIn: 0.224, weightGr: 75, bcG1: 0.467, bcG7: 0.234 },
  { maker: 'Hornady', model: '88gr ELD-M', caliber: '.224', diameterIn: 0.224, weightGr: 88, bcG1: 0.545, bcG7: 0.274 },
  { maker: 'Hornady', model: '108gr ELD-M', caliber: '6mm', diameterIn: 0.243, weightGr: 108, bcG1: 0.536, bcG7: 0.27 },
  { maker: 'Hornady', model: '120gr ELD-M', caliber: '6.5mm', diameterIn: 0.264, weightGr: 120, bcG1: 0.487, bcG7: 0.245 },
  { maker: 'Hornady', model: '140gr ELD-M', caliber: '6.5mm', diameterIn: 0.264, weightGr: 140, bcG1: 0.646, bcG7: 0.326 },
  { maker: 'Hornady', model: '143gr ELD-X', caliber: '6.5mm', diameterIn: 0.264, weightGr: 143, bcG1: 0.625, bcG7: 0.315 },
  { maker: 'Hornady', model: '147gr ELD-M', caliber: '6.5mm', diameterIn: 0.264, weightGr: 147, bcG1: 0.697, bcG7: 0.351 },
  { maker: 'Hornady', model: '162gr ELD-X', caliber: '7mm', diameterIn: 0.284, weightGr: 162, bcG1: 0.631, bcG7: 0.315 },
  { maker: 'Hornady', model: '175gr ELD-X', caliber: '7mm', diameterIn: 0.284, weightGr: 175, bcG1: 0.689, bcG7: 0.347 },
  { maker: 'Hornady', model: '180gr ELD-M', caliber: '7mm', diameterIn: 0.284, weightGr: 180, bcG1: 0.796, bcG7: 0.401 },
  { maker: 'Hornady', model: '168gr ELD-M', caliber: '.308', diameterIn: 0.308, weightGr: 168, bcG1: 0.523, bcG7: 0.263 },
  { maker: 'Hornady', model: '178gr ELD-M', caliber: '.308', diameterIn: 0.308, weightGr: 178, bcG1: 0.547, bcG7: 0.275 },
  { maker: 'Hornady', model: '178gr ELD-X', caliber: '.308', diameterIn: 0.308, weightGr: 178, bcG1: 0.552, bcG7: 0.278 },
  { maker: 'Hornady', model: '208gr ELD-M', caliber: '.308', diameterIn: 0.308, weightGr: 208, bcG1: 0.69, bcG7: 0.347 },
  { maker: 'Hornady', model: '212gr ELD-X', caliber: '.308', diameterIn: 0.308, weightGr: 212, bcG1: 0.673, bcG7: 0.336 },
  { maker: 'Hornady', model: '225gr ELD-M', caliber: '.308', diameterIn: 0.308, weightGr: 225, bcG1: 0.777, bcG7: 0.391 },
  { maker: 'Hornady', model: '285gr ELD-M', caliber: '.338', diameterIn: 0.338, weightGr: 285, bcG1: 0.789, bcG7: 0.397 },

  // ---------------- Sierra (MatchKing / Tipped MatchKing — G1) ----------------
  { maker: 'Sierra', model: '77gr MatchKing', caliber: '.224', diameterIn: 0.224, weightGr: 77, bcG1: 0.362, bcG7: null },
  { maker: 'Sierra', model: '80gr MatchKing', caliber: '.224', diameterIn: 0.224, weightGr: 80, bcG1: 0.42, bcG7: null },
  { maker: 'Sierra', model: '95gr Tipped MatchKing', caliber: '6mm', diameterIn: 0.243, weightGr: 95, bcG1: 0.485, bcG7: null },
  { maker: 'Sierra', model: '107gr MatchKing', caliber: '6mm', diameterIn: 0.243, weightGr: 107, bcG1: 0.527, bcG7: null },
  { maker: 'Sierra', model: '110gr Tipped MatchKing', caliber: '6mm', diameterIn: 0.243, weightGr: 110, bcG1: 0.617, bcG7: null },
  { maker: 'Sierra', model: '140gr MatchKing', caliber: '6.5mm', diameterIn: 0.264, weightGr: 140, bcG1: 0.535, bcG7: null },
  { maker: 'Sierra', model: '142gr MatchKing', caliber: '6.5mm', diameterIn: 0.264, weightGr: 142, bcG1: 0.595, bcG7: null },
  { maker: 'Sierra', model: '150gr Tipped MatchKing', caliber: '6.5mm', diameterIn: 0.264, weightGr: 150, bcG1: 0.68, bcG7: null },
  { maker: 'Sierra', model: '168gr MatchKing', caliber: '7mm', diameterIn: 0.284, weightGr: 168, bcG1: 0.617, bcG7: null },
  { maker: 'Sierra', model: '183gr Tipped MatchKing', caliber: '7mm', diameterIn: 0.284, weightGr: 183, bcG1: 0.707, bcG7: null },
  { maker: 'Sierra', model: '168gr MatchKing', caliber: '.308', diameterIn: 0.308, weightGr: 168, bcG1: 0.462, bcG7: null },
  { maker: 'Sierra', model: '175gr MatchKing', caliber: '.308', diameterIn: 0.308, weightGr: 175, bcG1: 0.505, bcG7: null },
  { maker: 'Sierra', model: '175gr Tipped MatchKing', caliber: '.308', diameterIn: 0.308, weightGr: 175, bcG1: 0.52, bcG7: null },
  { maker: 'Sierra', model: '195gr Tipped MatchKing', caliber: '.308', diameterIn: 0.308, weightGr: 195, bcG1: 0.59, bcG7: null },
  { maker: 'Sierra', model: '220gr MatchKing', caliber: '.308', diameterIn: 0.308, weightGr: 220, bcG1: 0.629, bcG7: null },

  // ---------------- Nosler (RDF publishes G1 + G7; AccuBond LR — G1) ----------------
  { maker: 'Nosler', model: '105gr RDF', caliber: '6mm', diameterIn: 0.243, weightGr: 105, bcG1: 0.571, bcG7: 0.288 },
  { maker: 'Nosler', model: '130gr AccuBond LR', caliber: '6.5mm', diameterIn: 0.264, weightGr: 130, bcG1: 0.532, bcG7: null },
  { maker: 'Nosler', model: '140gr AccuBond', caliber: '6.5mm', diameterIn: 0.264, weightGr: 140, bcG1: 0.509, bcG7: null },
  { maker: 'Nosler', model: '140gr RDF', caliber: '6.5mm', diameterIn: 0.264, weightGr: 140, bcG1: 0.658, bcG7: 0.33 },
  { maker: 'Nosler', model: '142gr AccuBond LR', caliber: '6.5mm', diameterIn: 0.264, weightGr: 142, bcG1: 0.625, bcG7: null },
  { maker: 'Nosler', model: '160gr AccuBond', caliber: '7mm', diameterIn: 0.284, weightGr: 160, bcG1: 0.531, bcG7: null },
  { maker: 'Nosler', model: '168gr AccuBond LR', caliber: '7mm', diameterIn: 0.284, weightGr: 168, bcG1: 0.631, bcG7: null },
  { maker: 'Nosler', model: '175gr RDF', caliber: '7mm', diameterIn: 0.284, weightGr: 175, bcG1: 0.678, bcG7: 0.339 },
  { maker: 'Nosler', model: '168gr Ballistic Tip', caliber: '.308', diameterIn: 0.308, weightGr: 168, bcG1: 0.49, bcG7: null },
  { maker: 'Nosler', model: '175gr RDF', caliber: '.308', diameterIn: 0.308, weightGr: 175, bcG1: 0.536, bcG7: 0.269 },
  { maker: 'Nosler', model: '190gr RDF', caliber: '.308', diameterIn: 0.308, weightGr: 190, bcG1: 0.583, bcG7: 0.293 },
  { maker: 'Nosler', model: '210gr AccuBond LR', caliber: '.308', diameterIn: 0.308, weightGr: 210, bcG1: 0.73, bcG7: null },
];

export const BULLET_MAKERS: readonly BulletMaker[] = ['Berger', 'Hornady', 'Sierra', 'Nosler'];

/** The BC to prefill for a catalog bullet — prefer the (better) G7 when present. */
export function bestBc(b: CatalogBullet): { bcValue: number; bcModel: 'G1' | 'G7' } | null {
  if (b.bcG7 != null) return { bcValue: b.bcG7, bcModel: 'G7' };
  if (b.bcG1 != null) return { bcValue: b.bcG1, bcModel: 'G1' };
  return null;
}

/** Case-insensitive search over maker/model/caliber/weight, optionally filtered by maker. */
export function searchBullets(query: string, maker?: BulletMaker | null): CatalogBullet[] {
  const q = query.trim().toLowerCase();
  const terms = q.split(/\s+/).filter(Boolean);
  return BULLET_CATALOG.filter((b) => {
    if (maker && b.maker !== maker) return false;
    if (terms.length === 0) return true;
    const haystack = `${b.maker} ${b.model} ${b.caliber} ${b.weightGr}gr`.toLowerCase();
    return terms.every((t) => haystack.includes(t));
  });
}
