// Importable load profiles for the Christensen Arms MPR .300 PRC: one handload
// per bullet, seated from the cartridge-base-to-ogive (CBTO) touch-the-lands
// measurements taken in this rifle (Jared's sheet, Oct 2026).
//
// The loads are NOT attached to a rifle, on purpose. Settings → Add from
// Backup gives every imported row a fresh id, so a file that carried the MPR
// would add a second copy of it. Instead the sheet shows "5 loads not assigned
// to a rifle": tick that row, add, then open each load and pick the MPR under
// Rifle. Anyone restoring from scratch imports docs/range-cards/
// phoenix-workspace.json first (it has the rifle) and then adds this file.
//
// Pure builder — no I/O, no database — so a test can restore it into the real
// schema. `scripts/write-loads-mpr-300prc.ts` writes it to docs/range-cards/.
import type { Backup } from '@/lib/backup';
import type { Load, LoadVersion } from '@/db/schema';

/** File timestamp (rows created). */
export const STAMP = new Date('2026-10-29T12:00:00.000Z');

export const CARTRIDGE = '.300 PRC';

/** Everything on the bench is Hornady, per the die and press boxes. */
export const TOOLING = {
  sizingDie: 'Hornady Match Grade full-length bushing sizer (300 PRC 2-die set #544349)',
  sizingDieType: 'full-length bushing',
  seatingDie: 'Hornady Match Grade seater (300 PRC 2-die set #544349)',
  pressName: 'Hornady Lock-N-Load Iron Press',
} as const;

export type BulletSpec = {
  /** Row number in the file ids; 1-based, stable once published. */
  row: number;
  loadName: string;
  bulletMake: string;
  bulletModel: string;
  bulletWeightGr: number;
  bcValue: number;
  bcModel: 'G1' | 'G7';
  /** Overall bullet length, inches; feeds the spin-drift estimate only. */
  bulletLengthIn: number;
  bulletLengthSource: string;
  /** Every CBTO reading on the sheet, in the order written (struck-out values omitted). */
  cbtoReadingsIn: readonly number[];
  /** The reading the profile is built on: the most common value, else the mean. */
  touchCbtoIn: number;
  touchRule: 'most common' | 'mean';
  /** Starting jump off the lands for the first loads, inches. */
  startJumpIn: number;
  jumpWhy: string;
  bulletNotes: string;
};

const mean = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** The value that occurs most often; the mean (to 0.001") when every reading differs. */
export function pickTouch(readings: readonly number[]): { value: number; rule: 'most common' | 'mean' } {
  const counts = new Map<number, number>();
  for (const r of readings) counts.set(r, (counts.get(r) ?? 0) + 1);
  const best = Math.max(...counts.values());
  const modes = [...counts].filter(([, n]) => n === best).map(([v]) => v);
  if (best > 1 && modes.length === 1) return { value: modes[0]!, rule: 'most common' };
  return { value: Math.round(mean(readings) * 1000) / 1000, rule: 'mean' };
}

const spec = (
  s: Omit<BulletSpec, 'touchCbtoIn' | 'touchRule'>,
): BulletSpec => ({ ...s, ...(({ value, rule }) => ({ touchCbtoIn: value, touchRule: rule }))(pickTouch(s.cbtoReadingsIn)) });

export const BULLETS: readonly BulletSpec[] = [
  spec({
    row: 1,
    loadName: 'Hornady ELD-X 212 gr handload',
    bulletMake: 'Hornady',
    bulletModel: 'ELD-X',
    bulletWeightGr: 212,
    bcValue: 0.336,
    bcModel: 'G7',
    bulletLengthIn: 1.6,
    bulletLengthSource: 'estimate; Hornady does not publish it',
    cbtoReadingsIn: [2.931, 2.939, 2.931],
    startJumpIn: 0.02,
    jumpWhy: 'ELD-X is not jump sensitive; 0.020 in off is the usual starting point.',
    bulletNotes: 'Hornady #3077, .308 in, 212 gr ELD-X. Published G7 .336 / G1 .673.',
  }),
  spec({
    row: 2,
    loadName: 'Barnes LRX 208 gr handload',
    bulletMake: 'Barnes',
    bulletModel: 'LRX BT',
    bulletWeightGr: 208,
    bcValue: 0.633,
    bcModel: 'G1',
    bulletLengthIn: 1.819,
    bulletLengthSource: 'retailer listing (Powder Valley), tip included; Barnes lists it as TBD',
    cbtoReadingsIn: [2.94, 2.945, 2.94],
    startJumpIn: 0.05,
    jumpWhy: 'Barnes recommends starting monolithic LRX 0.050 in off the lands.',
    bulletNotes:
      'Barnes #30311, .308 in, 208 gr LRX BT, 1:8.5 twist or faster (MPR is 1:8). Published G1 .633; no G7.',
  }),
  spec({
    row: 3,
    loadName: 'Berger Elite Hunter 205 gr handload',
    bulletMake: 'Berger',
    bulletModel: 'Elite Hunter',
    bulletWeightGr: 205,
    bcValue: 0.324,
    bcModel: 'G7',
    bulletLengthIn: 1.487,
    bulletLengthSource: 'Berger published',
    cbtoReadingsIn: [2.934, 2.948, 2.949, 2.949],
    startJumpIn: 0.02,
    jumpWhy: 'Hybrid ogive is jump tolerant; 0.020 in off is a conventional starting point.',
    bulletNotes:
      'Berger #30555, .308 in, 205 gr Elite Hunter, 1:11 minimum twist. Box: G1 .631 / G7 .324.',
  }),
  spec({
    row: 4,
    loadName: 'Nosler AccuBond LR 190 gr handload',
    bulletMake: 'Nosler',
    bulletModel: 'AccuBond Long Range',
    bulletWeightGr: 190,
    bcValue: 0.301,
    bcModel: 'G7',
    bulletLengthIn: 1.46,
    bulletLengthSource: 'Nosler published (retailers show 1.460 and 1.480)',
    cbtoReadingsIn: [2.949, 2.949],
    startJumpIn: 0.02,
    jumpWhy: 'AccuBond LR is jump tolerant; 0.020 in off is a conventional starting point.',
    bulletNotes:
      'Nosler #58456, .308 in, 190 gr AccuBond Long Range. Published G7 .301 / G1 .597 (the older .640 G1 figure was revised down by Nosler).',
  }),
  spec({
    row: 5,
    loadName: 'Hammer Hunter 214 gr handload',
    bulletMake: 'Hammer Bullets',
    bulletModel: 'Hammer Hunter',
    bulletWeightGr: 214,
    bcValue: 0.322,
    bcModel: 'G7',
    bulletLengthIn: 1.765,
    bulletLengthSource: 'Hammer published',
    cbtoReadingsIn: [2.986, 2.983],
    startJumpIn: 0.05,
    jumpWhy: 'Hammer recommends jumping its bullets; 0.050 in off is their usual starting point.',
    bulletNotes:
      'Hammer Hunter .308 in / 214 gr, 1:8.5 twist recommended (MPR is 1:8). Hammer lists G7 .322 as an ESTIMATE and the weight as 213 gr: true the BC from drops before trusting it.',
  }),
];

// Fixed ids so the file is reproducible and a re-import is byte-identical.
// Distinct from the phoenix workspace ids (…300f17{1,2}0a00{n}).
export const idFor = (bullet: number, row: number) => `7c1e9d3a-5b2f-4c8e-9a1d-300f30b${bullet}00${row}`;

const fmt = (x: number) => x.toFixed(3);

export function seatingCbtoIn(b: BulletSpec): number {
  return Math.round((b.touchCbtoIn - b.startJumpIn) * 1000) / 1000;
}

function rowsFor(b: BulletSpec) {
  const t = STAMP;
  const loadId = idFor(b.row, 1);
  const versionId = idFor(b.row, 2);
  const readings = b.cbtoReadingsIn.map(fmt).join(', ');
  const load: Load = {
    id: loadId,
    name: b.loadName,
    cartridge: CARTRIDGE,
    rifleId: null,
    currentVersionId: versionId,
    createdAt: t,
    updatedAt: t,
    archivedAt: null,
  };
  const version: LoadVersion = {
    id: versionId,
    loadId,
    versionNumber: 1,
    parentVersionId: null,
    bulletMake: b.bulletMake,
    bulletModel: b.bulletModel,
    bulletWeightGr: b.bulletWeightGr,
    bcValue: b.bcValue,
    bcModel: b.bcModel,
    bulletLengthIn: b.bulletLengthIn,
    bulletDiameterIn: 0.308,
    bcSegments: null,
    powderName: null,
    chargeGr: null,
    primer: null,
    brass: null,
    brassFirings: null,
    cbtoIn: seatingCbtoIn(b),
    coalIn: null,
    crimp: null,
    muzzleVelocityFps: null,
    mvTempRefF: null,
    mvTempSensFpsPerDegF: null,
    caseTrimLengthIn: null,
    caseTrimmedTo: null,
    caseNeckTurned: false,
    neckWallThicknessIn: null,
    casePrepNotes: null,
    primerPocketUniformed: false,
    flashHoleDeburred: false,
    caseVolumeGrH2O: null,
    caseWeightGr: null,
    caseAnnealed: false,
    annealMethod: null,
    caseLotNumber: null,
    sizingDie: TOOLING.sizingDie,
    sizingDieType: TOOLING.sizingDieType,
    bushingSizeIn: null,
    expanderMandrelIn: null,
    shoulderBumpIn: null,
    seatingDie: TOOLING.seatingDie,
    seatingDieMicrometer: null,
    crimpDie: null,
    pressName: TOOLING.pressName,
    lubeMethod: null,
    powderLotNumber: null,
    chargeMethod: null,
    chargeVarianceGr: null,
    primerLotNumber: null,
    primerSeatingDepthIn: null,
    bulletLotNumber: null,
    bulletSortedBy: null,
    jumpToLandsIn: b.startJumpIn,
    neckTensionIn: null,
    runoutIn: null,
    loadedRoundWeightGr: null,
    assemblyNotes:
      `Touch-the-lands CBTO in the MPR: ${fmt(b.touchCbtoIn)} in (${b.touchRule} of ${readings}). ` +
      `Seat to CBTO ${fmt(seatingCbtoIn(b))} in for ${fmt(b.startJumpIn)} in jump. ${b.jumpWhy} ` +
      'Measure with the same .30 cal comparator insert the sheet was measured with; re-check touch every few hundred rounds as the throat wears.',
    notes:
      `${b.bulletNotes} Starting profile: powder, charge, primer, brass and velocity are blank until the workup. ` +
      `Bullet length ${fmt(b.bulletLengthIn)} in (${b.bulletLengthSource}) only feeds the spin-drift term.`,
    createdAt: t,
    updatedAt: t,
  };
  return { load, version };
}

export function buildLoads(): Backup {
  const sets = BULLETS.map(rowsFor);
  return {
    // Type-only import above: @/lib/backup pulls in the Expo database client,
    // which node cannot load. The test pins this to BACKUP_SCHEMA_VERSION.
    schemaVersion: 1,
    exportedAt: STAMP.toISOString(),
    app: 'precision-innovation',
    tables: {
      rifles: [],
      loads: sets.map((s) => s.load),
      loadVersions: sets.map((s) => s.version),
      workups: [],
      workupSteps: [],
      rangeSessions: [],
      shotStrings: [],
      shots: [],
      dopeEntries: [],
      rangeCards: [],
    },
  };
}
