import type { LoadVersion, NewLoadVersion } from '@/db/schema';
import {
  fromYesNo,
  type SizingDieTypeChoice,
  sizingDieTypeToStored,
  type YesNo,
} from '@/features/loads/recipe';
import { parseDecimal } from '@/lib/parse';
import {
  DEFAULT_SHOTS_PER_CHARGE,
  DEFAULT_STEP_COUNT,
  generateChargeSeries,
  type WorkupType,
} from '@/lib/workup/seriesGenerator';

// The "Build a Load" walkthrough, minus the UI. The wizard screen owns a
// `BuildDraft` (every input as the raw string the user typed), walks the
// steps `stepsFor(stringType)` returns, and on the last step hands the draft
// to the real load form as a prefill. The form's own submit is the only save
// path: this module decides "may the user move to the next step", never
// "what gets written".
//
// PURE: no React Native, no Expo, no database (see __tests__/purity.test.ts).

export type StringType = 'batch' | 'ladder';

export type LadderMethod = Exclude<WorkupType, 'freeform'>;

/** Everything the walkthrough collects. Numbers stay strings until the form parses them. */
export type BuildDraft = {
  stringType: StringType;
  // Rifle
  rifleId: string | null;
  cartridge: string;
  // Bullet
  bulletMake: string;
  bulletModel: string;
  bulletWeight: string;
  bcValue: string;
  bcModel: 'G1' | 'G7';
  bulletLength: string;
  bulletDiameter: string;
  // Powder
  powderName: string;
  powderLot: string;
  // Primer (+ priming)
  primer: string;
  primerLot: string;
  primerSeatingDepth: string;
  // Brass + case prep
  brass: string;
  brassFirings: string;
  caseLot: string;
  caseTrimLength: string;
  caseTrimmedTo: string;
  neckTurned: YesNo;
  pocketUniformed: YesNo;
  flashHoleDeburred: YesNo;
  annealed: YesNo;
  annealMethod: string;
  casePrepNotes: string;
  // Sizing & dies
  sizingDie: string;
  sizingDieType: SizingDieTypeChoice;
  bushingSize: string;
  shoulderBump: string;
  lubeMethod: string;
  pressName: string;
  // Charging
  chargeGr: string;
  /** Ticked on this run only. Never stored. Cleared whenever chargeGr changes. */
  chargeAcknowledged: boolean;
  chargeMethod: string;
  chargeVariance: string;
  // Ladder plan
  ladderMethod: LadderMethod;
  incrementGr: number;
  stepCount: number;
  testDistance: string;
  // Batch size
  roundsLoaded: string;
  // Seating
  seatingDie: string;
  seatingMicrometer: string;
  cbto: string;
  coal: string;
  jumpToLands: string;
  neckTension: string;
  crimp: string;
  crimpDie: string;
};

export type BuildField = keyof BuildDraft;

export type BuildErrors = Partial<Record<BuildField, string>>;

export type BuildStepKey =
  | 'stringType'
  | 'rifle'
  | 'bullet'
  | 'powder'
  | 'primer'
  | 'brass'
  | 'sizing'
  | 'charging'
  | 'ladderPlan'
  | 'batchCount'
  | 'seating'
  | 'review';

export type BuildStep = {
  key: BuildStepKey;
  /** Short screen title. */
  title: string;
  /** One or two plain sentences on what this step records and why it matters. */
  blurb: string;
  /** Optional steps show "Skip for now" while nothing on them is touched. */
  optional: boolean;
  appliesTo: 'both' | StringType;
  /** Draft fields edited on this step — drives per-step validation and "filled". */
  fields: readonly BuildField[];
};

/** Required wording. The app shows no charge numbers anywhere in the walkthrough. */
export const CHARGE_ACK_TEXT =
  'I have verified this charge against published load data from the powder or bullet manufacturer, for this bullet and powder, and I will start low and watch for pressure signs.';

/** Every step, in production-line order. Use `stepsFor` to get one string type's list. */
export const BUILD_STEPS: readonly BuildStep[] = [
  {
    key: 'stringType',
    title: 'What are you building?',
    blurb:
      'A batch is a number of identical rounds of a recipe you already trust. A charge ladder is a short series of charges in small steps, shot to find the one your rifle likes.',
    optional: false,
    appliesTo: 'both',
    fields: ['stringType'],
  },
  {
    key: 'rifle',
    title: 'Rifle',
    blurb:
      'A load lives with the rifle that fires it. Its cartridge, twist and barrel decide which bullets stabilise and how fast they leave; range sessions and the range card are keyed by rifle.',
    optional: false,
    appliesTo: 'both',
    fields: ['rifleId', 'cartridge'],
  },
  {
    key: 'bullet',
    title: 'Bullet',
    blurb:
      "Weight and ballistic coefficient are what the range card is built from. The catalog is filtered to your rifle's bore so you can't pick a bullet that doesn't fit.",
    optional: false,
    appliesTo: 'both',
    fields: [
      'bulletMake',
      'bulletModel',
      'bulletWeight',
      'bcValue',
      'bcModel',
      'bulletLength',
      'bulletDiameter',
    ],
  },
  {
    key: 'powder',
    title: 'Powder',
    blurb:
      'Which powder, not how much — the charge weight comes later with its own check. Record the lot: powder varies from lot to lot.',
    optional: false,
    appliesTo: 'both',
    fields: ['powderName', 'powderLot'],
  },
  {
    key: 'primer',
    title: 'Primer',
    blurb:
      'Record the primer so a swap later shows up as a new version rather than a mystery velocity shift. Primers should seat a few thousandths below flush.',
    optional: true,
    appliesTo: 'both',
    fields: ['primer', 'primerLot', 'primerSeatingDepth'],
  },
  {
    key: 'brass',
    title: 'Brass & case prep',
    blurb:
      'Case capacity changes with brand and with every firing. New loaders usually just trim and chamfer — that is fine; record what you did so the next batch matches.',
    optional: true,
    appliesTo: 'both',
    fields: [
      'brass',
      'brassFirings',
      'caseLot',
      'caseTrimLength',
      'caseTrimmedTo',
      'neckTurned',
      'pocketUniformed',
      'flashHoleDeburred',
      'annealed',
      'annealMethod',
      'casePrepNotes',
    ],
  },
  {
    key: 'sizing',
    title: 'Sizing & dies',
    blurb:
      'Consistent sizing is consistent chamber fit. Full-length sizing with a small shoulder bump is the safe default for a first load.',
    optional: true,
    appliesTo: 'both',
    fields: ['sizingDie', 'sizingDieType', 'bushingSize', 'shoulderBump', 'lubeMethod', 'pressName'],
  },
  {
    key: 'charging',
    title: 'Charge',
    blurb:
      'This is the number that matters for safety. The app never suggests one — it comes from the published manual for your exact bullet and powder.',
    optional: false,
    appliesTo: 'both',
    fields: ['chargeGr', 'chargeAcknowledged', 'chargeMethod', 'chargeVariance'],
  },
  {
    key: 'ladderPlan',
    title: 'Ladder plan',
    blurb:
      'Small steps show where velocity flattens or groups stop moving. Your charge above is the starting rung; each step adds the increment.',
    optional: false,
    appliesTo: 'ladder',
    fields: ['ladderMethod', 'incrementGr', 'stepCount', 'testDistance'],
  },
  {
    key: 'batchCount',
    title: 'Batch size',
    blurb:
      "How many rounds you're loading of this exact recipe. It's saved with the recipe so you can see what's left and what each range session used.",
    optional: false,
    appliesTo: 'batch',
    fields: ['roundsLoaded'],
  },
  {
    key: 'seating',
    title: 'Seating',
    blurb:
      "COAL is what you check against the magazine; CBTO is the repeatable number. If you're unsure, use the manual's COAL.",
    optional: true,
    appliesTo: 'both',
    fields: [
      'seatingDie',
      'seatingMicrometer',
      'cbto',
      'coal',
      'jumpToLands',
      'neckTension',
      'crimp',
      'crimpDie',
    ],
  },
  {
    key: 'review',
    title: 'Review & save',
    blurb:
      "Everything you entered is in the recipe form below and still editable. Save creates the load; only the name is required.",
    optional: false,
    appliesTo: 'both',
    fields: [],
  },
];

/** The steps one string type walks through, in order. */
export function stepsFor(type: StringType): BuildStep[] {
  return BUILD_STEPS.filter((s) => s.appliesTo === 'both' || s.appliesTo === type);
}

export function stepIndexFor(type: StringType, key: BuildStepKey): number {
  return stepsFor(type).findIndex((s) => s.key === key);
}

/** Starting values; a rifle (and its cartridge) can be seeded from a deep link. */
export function emptyDraft(seed?: {
  rifleId?: string | null;
  cartridge?: string | null;
}): BuildDraft {
  return {
    stringType: 'batch',
    rifleId: seed?.rifleId ?? null,
    cartridge: seed?.cartridge ?? '',
    bulletMake: '',
    bulletModel: '',
    bulletWeight: '',
    bcValue: '',
    bcModel: 'G7',
    bulletLength: '',
    bulletDiameter: '',
    powderName: '',
    powderLot: '',
    primer: '',
    primerLot: '',
    primerSeatingDepth: '',
    brass: '',
    brassFirings: '',
    caseLot: '',
    caseTrimLength: '',
    caseTrimmedTo: '',
    neckTurned: 'No',
    pocketUniformed: 'No',
    flashHoleDeburred: 'No',
    annealed: 'No',
    annealMethod: '',
    casePrepNotes: '',
    sizingDie: '',
    sizingDieType: '—',
    bushingSize: '',
    shoulderBump: '',
    lubeMethod: '',
    pressName: '',
    chargeGr: '',
    chargeAcknowledged: false,
    chargeMethod: '',
    chargeVariance: '',
    ladderMethod: 'velocity',
    incrementGr: 0.3,
    stepCount: DEFAULT_STEP_COUNT.velocity,
    testDistance: '',
    roundsLoaded: '',
    seatingDie: '',
    seatingMicrometer: '',
    cbto: '',
    coal: '',
    jumpToLands: '',
    neckTension: '',
    crimp: '',
    crimpDie: '',
  };
}

const BLANK = emptyDraft();

/** True when any field on the step differs from its untouched default. */
export function isStepFilled(draft: BuildDraft, step: BuildStep): boolean {
  return step.fields.some((f) => draft[f] !== BLANK[f]);
}

/**
 * True when anything beyond the string-type choice has been entered — drives
 * the unsaved-changes guard. Picking Batch vs Ladder alone is not worth an alert.
 */
export function isDraftDirty(draft: BuildDraft, seed: BuildDraft = BLANK): boolean {
  return (Object.keys(draft) as BuildField[]).some(
    (f) => f !== 'stringType' && draft[f] !== seed[f],
  );
}

// --- validation ---------------------------------------------------------------

type NumRule = 'any' | 'positive' | 'nonNegative' | 'count';

/** Same rules the load form applies on save, so a step can't advance with input the form would reject. */
const NUMERIC_FIELDS: { field: BuildField; rule: NumRule; label: string }[] = [
  { field: 'bulletWeight', rule: 'any', label: 'Weight' },
  { field: 'bcValue', rule: 'positive', label: 'BC' },
  { field: 'bulletLength', rule: 'positive', label: 'Length' },
  { field: 'bulletDiameter', rule: 'positive', label: 'Diameter' },
  { field: 'primerSeatingDepth', rule: 'nonNegative', label: 'Primer seating depth' },
  { field: 'brassFirings', rule: 'any', label: 'Firings' },
  { field: 'caseTrimLength', rule: 'positive', label: 'Trim length' },
  { field: 'bushingSize', rule: 'positive', label: 'Bushing size' },
  { field: 'shoulderBump', rule: 'nonNegative', label: 'Shoulder bump' },
  { field: 'chargeGr', rule: 'positive', label: 'Charge' },
  { field: 'chargeVariance', rule: 'nonNegative', label: 'Charge tolerance' },
  { field: 'testDistance', rule: 'positive', label: 'Test distance' },
  { field: 'roundsLoaded', rule: 'count', label: 'Rounds to load' },
  { field: 'cbto', rule: 'any', label: 'CBTO' },
  { field: 'coal', rule: 'any', label: 'COAL' },
  // Jump is signed: negative means the bullet is jammed into the lands.
  { field: 'jumpToLands', rule: 'any', label: 'Jump to lands' },
  { field: 'neckTension', rule: 'positive', label: 'Neck tension' },
];

/** Errors for the fields on one step. Blank numbers are "not recorded" and pass. */
export function validateStep(draft: BuildDraft, step: BuildStep): BuildErrors {
  const errs: BuildErrors = {};
  for (const { field, rule, label } of NUMERIC_FIELDS) {
    if (!step.fields.includes(field)) continue;
    const raw = draft[field] as string;
    if (raw.trim() === '') continue;
    const n = parseDecimal(raw);
    if (n === null) {
      errs[field] = rule === 'count' ? 'Enter a whole number like 20' : 'Enter a number like 41.5';
    } else if (rule === 'positive' && n <= 0) {
      errs[field] = `${label} must be greater than 0.`;
    } else if (rule === 'nonNegative' && n < 0) {
      errs[field] = `${label} can't be negative.`;
    } else if (rule === 'count' && (n < 1 || !Number.isInteger(n))) {
      errs[field] = `${label} must be a whole number of at least 1.`;
    }
  }
  return errs;
}

/** Parsed charge when it is a usable starting charge, else null. */
export function startChargeOf(draft: BuildDraft): number | null {
  const n = parseDecimal(draft.chargeGr);
  return n !== null && n > 0 ? n : null;
}

/** Parsed batch size when it is a whole number >= 1, else null. */
export function roundsLoadedOf(draft: BuildDraft): number | null {
  const n = parseDecimal(draft.roundsLoaded);
  return n !== null && n >= 1 && Number.isInteger(n) ? n : null;
}

/** The charge series the ladder step previews and the workup will be created from. */
export function ladderPlan(draft: BuildDraft): {
  startChargeGr: number | null;
  series: number[];
  shotsPerCharge: number;
  rounds: number;
} {
  const startChargeGr = startChargeOf(draft);
  const series =
    startChargeGr === null
      ? []
      : generateChargeSeries({
          startChargeGr,
          incrementGr: draft.incrementGr,
          stepCount: draft.stepCount,
        });
  const shotsPerCharge = DEFAULT_SHOTS_PER_CHARGE[draft.ladderMethod];
  return { startChargeGr, series, shotsPerCharge, rounds: series.length * shotsPerCharge };
}

/**
 * The hard gates. Everything else is "numbers must parse", which `validateStep`
 * reports on the Next press; these disable Next outright.
 */
export function canAdvance(draft: BuildDraft, step: BuildStep): boolean {
  switch (step.key) {
    case 'rifle':
      return draft.rifleId !== null;
    case 'charging':
      return startChargeOf(draft) !== null && draft.chargeAcknowledged;
    case 'ladderPlan':
      return ladderPlan(draft).series.length > 0;
    case 'batchCount':
      return roundsLoadedOf(draft) !== null;
    default:
      return true;
  }
}

// --- naming -------------------------------------------------------------------

// Maker prefixes the catalog puts in front of a powder name. Dropped from the
// suggested load name so "Hodgdon H4350" reads as "H4350", the way loaders say
// it. IMR stays because "IMR 4064" without the IMR is just a number.
const POWDER_MAKER_PREFIXES = [
  'Hodgdon',
  'Alliant',
  'Vihtavuori',
  'Accurate',
  'Ramshot',
  'Winchester',
  'Norma',
];

export function shortPowderName(powder: string): string {
  const t = powder.trim();
  for (const maker of POWDER_MAKER_PREFIXES) {
    if (t.toLowerCase().startsWith(maker.toLowerCase() + ' ')) {
      const rest = t.slice(maker.length).trim();
      if (rest) return rest;
    }
  }
  return t;
}

/**
 * A name in the house style the form's placeholder shows — "140 ELD-M / H4350
 * 41.5" — from whatever the draft has. Empty when there is nothing to name.
 */
export function suggestLoadName(draft: BuildDraft): string {
  const weight = draft.bulletWeight.trim();
  const bullet = draft.bulletModel.trim() || draft.bulletMake.trim();
  const bulletPart = [weight, bullet].filter(Boolean).join(' ');
  const powder = shortPowderName(draft.powderName);
  const charge = draft.chargeGr.trim();
  const powderPart = [powder, charge].filter(Boolean).join(' ');
  return [bulletPart, powderPart].filter(Boolean).join(' / ');
}

// --- prefill ------------------------------------------------------------------

/** The version columns the form edits — same Omit the loads repository uses. */
export type VersionComponents = Omit<
  NewLoadVersion,
  'id' | 'loadId' | 'versionNumber' | 'parentVersionId' | 'createdAt' | 'updatedAt'
>;

/** What the wizard hands the load form. Partial: the form owns the full row. */
export type LoadFormPrefill = {
  name?: string;
  cartridge?: string | null;
  rifleId?: string | null;
  version?: Partial<VersionComponents>;
};

const str = (s: string): string | null => (s.trim() === '' ? null : s.trim());
const num = (s: string): number | null => (s.trim() === '' ? null : parseDecimal(s));

/**
 * Draft -> prefill. Only fields the walkthrough asked about are set, so the
 * form's own defaults stand for everything else. Unparseable numbers (only
 * possible if a step was bypassed) are left out rather than guessed.
 */
export function draftToPrefill(draft: BuildDraft): LoadFormPrefill {
  const firings = num(draft.brassFirings);
  const version: Partial<VersionComponents> = {
    bulletMake: str(draft.bulletMake),
    bulletModel: str(draft.bulletModel),
    bulletWeightGr: num(draft.bulletWeight),
    bcValue: num(draft.bcValue),
    bcModel: draft.bcModel,
    bulletLengthIn: num(draft.bulletLength),
    bulletDiameterIn: num(draft.bulletDiameter),
    powderName: str(draft.powderName),
    powderLotNumber: str(draft.powderLot),
    primer: str(draft.primer),
    primerLotNumber: str(draft.primerLot),
    primerSeatingDepthIn: num(draft.primerSeatingDepth),
    brass: str(draft.brass),
    brassFirings: firings != null ? Math.round(firings) : null,
    caseLotNumber: str(draft.caseLot),
    caseTrimLengthIn: num(draft.caseTrimLength),
    caseTrimmedTo: str(draft.caseTrimmedTo),
    caseNeckTurned: fromYesNo(draft.neckTurned),
    primerPocketUniformed: fromYesNo(draft.pocketUniformed),
    flashHoleDeburred: fromYesNo(draft.flashHoleDeburred),
    caseAnnealed: fromYesNo(draft.annealed),
    annealMethod: str(draft.annealMethod),
    casePrepNotes: str(draft.casePrepNotes),
    sizingDie: str(draft.sizingDie),
    sizingDieType: sizingDieTypeToStored(draft.sizingDieType),
    bushingSizeIn: num(draft.bushingSize),
    shoulderBumpIn: num(draft.shoulderBump),
    lubeMethod: str(draft.lubeMethod),
    pressName: str(draft.pressName),
    chargeGr: num(draft.chargeGr),
    chargeMethod: str(draft.chargeMethod),
    chargeVarianceGr: num(draft.chargeVariance),
    seatingDie: str(draft.seatingDie),
    seatingDieMicrometer: str(draft.seatingMicrometer),
    cbtoIn: num(draft.cbto),
    coalIn: num(draft.coal),
    jumpToLandsIn: num(draft.jumpToLands),
    neckTensionIn: num(draft.neckTension),
    crimp: str(draft.crimp),
    crimpDie: str(draft.crimpDie),
  };
  return {
    name: suggestLoadName(draft),
    cartridge: str(draft.cartridge),
    rifleId: draft.rifleId,
    version,
  };
}

/**
 * A prefill dressed as a LoadVersion so the form's `initialVersion?.x`
 * initialisers and the recipe helpers can read it. Placeholder ids and dates
 * are never written anywhere.
 */
export function prefillAsVersion(prefill: LoadFormPrefill | undefined): LoadVersion | undefined {
  if (!prefill?.version) return undefined;
  return {
    ...prefill.version,
    id: '',
    loadId: '',
    versionNumber: 1,
    parentVersionId: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  } as LoadVersion;
}
