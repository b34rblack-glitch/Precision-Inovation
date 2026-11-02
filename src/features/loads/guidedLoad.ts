import type { LoadVersion, NewLoadVersion } from '@/db/schema';
import {
  fromYesNo,
  ingredientRows,
  recipeStages,
  type RecipeRow,
  type RecipeStage,
  type SizingDieTypeChoice,
  sizingDieTypeToStored,
  type YesNo,
} from '@/features/loads/recipe';
import { parseDecimal } from '@/lib/parse';

// The guided "Build a Load" walkthrough, minus the UI. The wizard screen owns
// a `GuidedDraft` (every input as the raw string the user typed), advances
// through `GUIDED_STEPS` in order, and on the last step turns the draft into
// the same { meta, components } shape the full load form submits. Keeping the
// step list, validation and conversion here means they can be unit-tested
// without React Native and can't drift from what actually gets saved.
//
// Pure: no React Native, no Expo (see __tests__/purity.test.ts).

/** Everything the walkthrough collects, as typed. Numbers stay strings until save. */
export type GuidedDraft = {
  // Rifle & cartridge
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
  // Powder & charge
  powderName: string;
  chargeGr: string;
  powderLot: string;
  chargeMethod: string;
  // Primer
  primer: string;
  primerLot: string;
  // Brass
  brass: string;
  brassFirings: string;
  caseLot: string;
  // Case prep
  caseTrimLength: string;
  caseTrimmedTo: string;
  neckTurned: YesNo;
  pocketUniformed: YesNo;
  flashHoleDeburred: YesNo;
  annealed: YesNo;
  annealMethod: string;
  // Sizing & dies
  sizingDie: string;
  sizingDieType: SizingDieTypeChoice;
  bushingSize: string;
  shoulderBump: string;
  pressName: string;
  // Seating
  seatingDie: string;
  cbto: string;
  coal: string;
  jumpToLands: string;
  neckTension: string;
  // Review
  name: string;
  notes: string;
};

export type GuidedField = keyof GuidedDraft;

export type GuidedErrors = Partial<Record<GuidedField, string>>;

export type GuidedStepKey =
  | 'rifle'
  | 'bullet'
  | 'powder'
  | 'primer'
  | 'brass'
  | 'casePrep'
  | 'sizing'
  | 'seating'
  | 'review';

export type GuidedStep = {
  key: GuidedStepKey;
  /** Short screen title, e.g. "Bullet". */
  title: string;
  /** One or two plain sentences on what this step records and why it matters. */
  blurb: string;
  /** Optional steps show "Skip for now" while nothing on them is filled in. */
  optional: boolean;
  /** Draft fields edited on this step — drives per-step validation and "filled" state. */
  fields: readonly GuidedField[];
};

/** The walkthrough, in the order a loader actually works: pick parts, then assemble. */
export const GUIDED_STEPS: readonly GuidedStep[] = [
  {
    key: 'rifle',
    title: 'Rifle & cartridge',
    blurb:
      'Which rifle is this load for? Assigning it now is what lets range sessions, workups and the range card find it later. A load can stay unassigned.',
    optional: true,
    fields: ['rifleId', 'cartridge'],
  },
  {
    key: 'bullet',
    title: 'Bullet',
    blurb:
      'The bullet and its ballistic coefficient are what the range card is built from — weight and BC matter more than anything else you enter. Pick from the catalog to prefill published numbers.',
    optional: false,
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
    title: 'Powder & charge',
    blurb:
      'Powder and charge weight are the heart of the recipe. Enter the charge you plan to start from — a workup will walk it up from here. Always start from published load data.',
    optional: false,
    fields: ['powderName', 'chargeGr', 'powderLot', 'chargeMethod'],
  },
  {
    key: 'primer',
    title: 'Primer',
    blurb:
      'Record the primer so a future primer swap shows up as a new version instead of a mystery velocity shift.',
    optional: true,
    fields: ['primer', 'primerLot'],
  },
  {
    key: 'brass',
    title: 'Brass',
    blurb:
      'Brand and firing count. Case capacity drifts with brand and with every firing, so this is worth tracking from day one.',
    optional: true,
    fields: ['brass', 'brassFirings', 'caseLot'],
  },
  {
    key: 'casePrep',
    title: 'Case prep',
    blurb:
      'How the brass was prepared before sizing. Skip this if you load as-is — you can always add it later.',
    optional: true,
    fields: [
      'caseTrimLength',
      'caseTrimmedTo',
      'neckTurned',
      'pocketUniformed',
      'flashHoleDeburred',
      'annealed',
      'annealMethod',
    ],
  },
  {
    key: 'sizing',
    title: 'Sizing & dies',
    blurb:
      'The sizing die, how far you bump the shoulder, and the press. Consistent sizing is consistent chamber fit.',
    optional: true,
    fields: ['sizingDie', 'sizingDieType', 'bushingSize', 'shoulderBump', 'pressName'],
  },
  {
    key: 'seating',
    title: 'Seating',
    blurb:
      'Seating depth decides jump to the lands and whether the round fits the magazine. CBTO is the repeatable number; COAL is the one you check against the mag.',
    optional: true,
    fields: ['seatingDie', 'cbto', 'coal', 'jumpToLands', 'neckTension'],
  },
  {
    key: 'review',
    title: 'Name & save',
    blurb:
      'Check the recipe, give it a name, and save. Velocity, runout and the rest of the QC results are added after you shoot it.',
    optional: false,
    fields: ['name', 'notes'],
  },
];

export const GUIDED_STEP_COUNT = GUIDED_STEPS.length;

export function guidedStepIndex(key: GuidedStepKey): number {
  return GUIDED_STEPS.findIndex((s) => s.key === key);
}

/** Starting values; a rifle (and its cartridge) can be pre-seeded from a deep link. */
export function emptyDraft(seed?: {
  rifleId?: string | null;
  cartridge?: string | null;
}): GuidedDraft {
  return {
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
    chargeGr: '',
    powderLot: '',
    chargeMethod: '',
    primer: '',
    primerLot: '',
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
    sizingDie: '',
    sizingDieType: '—',
    bushingSize: '',
    shoulderBump: '',
    pressName: '',
    seatingDie: '',
    cbto: '',
    coal: '',
    jumpToLands: '',
    neckTension: '',
    name: '',
    notes: '',
  };
}

const BLANK = emptyDraft();

/** True when any field on the step differs from its untouched default. */
export function isStepFilled(draft: GuidedDraft, step: GuidedStep): boolean {
  return step.fields.some((f) => draft[f] !== BLANK[f]);
}

/** True when anything at all has been entered — drives the unsaved-changes guard. */
export function isDraftDirty(draft: GuidedDraft, seed: GuidedDraft = BLANK): boolean {
  return (Object.keys(draft) as GuidedField[]).some((f) => draft[f] !== seed[f]);
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
export function suggestLoadName(draft: GuidedDraft): string {
  const weight = draft.bulletWeight.trim();
  const bullet = draft.bulletModel.trim() || draft.bulletMake.trim();
  const bulletPart = [weight, bullet].filter(Boolean).join(' ');
  const powder = shortPowderName(draft.powderName);
  const charge = draft.chargeGr.trim();
  const powderPart = [powder, charge].filter(Boolean).join(' ');
  return [bulletPart, powderPart].filter(Boolean).join(' / ');
}

// --- validation ---------------------------------------------------------------

type NumRule = 'any' | 'positive' | 'nonNegative';

const NUMERIC_FIELDS: { field: GuidedField; rule: NumRule; label: string }[] = [
  { field: 'bulletWeight', rule: 'any', label: 'Weight' },
  { field: 'bcValue', rule: 'positive', label: 'BC' },
  { field: 'bulletLength', rule: 'positive', label: 'Length' },
  { field: 'bulletDiameter', rule: 'positive', label: 'Diameter' },
  { field: 'chargeGr', rule: 'any', label: 'Charge' },
  { field: 'brassFirings', rule: 'any', label: 'Firings' },
  { field: 'caseTrimLength', rule: 'positive', label: 'Trim length' },
  { field: 'bushingSize', rule: 'positive', label: 'Bushing size' },
  { field: 'shoulderBump', rule: 'nonNegative', label: 'Shoulder bump' },
  { field: 'cbto', rule: 'any', label: 'CBTO' },
  { field: 'coal', rule: 'any', label: 'COAL' },
  // Jump is signed: negative means the bullet is jammed into the lands.
  { field: 'jumpToLands', rule: 'any', label: 'Jump to lands' },
  { field: 'neckTension', rule: 'positive', label: 'Neck tension' },
];

/**
 * Same rules as the full load form: a blank number is "not recorded", a
 * non-empty one must parse, and physical dimensions can't be zero or negative.
 * Pass `fields` to check only one step; the name is only required when the
 * review step is being checked.
 */
export function validateDraft(draft: GuidedDraft, fields?: readonly GuidedField[]): GuidedErrors {
  const errs: GuidedErrors = {};
  const inScope = (f: GuidedField) => !fields || fields.includes(f);
  for (const { field, rule, label } of NUMERIC_FIELDS) {
    if (!inScope(field)) continue;
    const raw = draft[field] as string;
    if (raw.trim() === '') continue;
    const n = parseDecimal(raw);
    if (n === null) {
      errs[field] = 'Enter a number like 41.5';
    } else if (rule === 'positive' && n <= 0) {
      errs[field] = `${label} must be greater than 0.`;
    } else if (rule === 'nonNegative' && n < 0) {
      errs[field] = `${label} can't be negative.`;
    }
  }
  if (inScope('name') && draft.name.trim() === '') {
    errs.name = 'Give the load a name — everything else is optional.';
  }
  return errs;
}

/** Index of the first step carrying one of these errors, or -1. */
export function firstStepWithErrors(errors: GuidedErrors): number {
  const keys = Object.keys(errors) as GuidedField[];
  return GUIDED_STEPS.findIndex((s) => s.fields.some((f) => keys.includes(f) && errors[f]));
}

// --- conversion ---------------------------------------------------------------

/** What `createLoad` takes for the version row — identical to the form's shape. */
export type GuidedComponents = Omit<
  NewLoadVersion,
  'id' | 'loadId' | 'versionNumber' | 'parentVersionId' | 'createdAt' | 'updatedAt'
>;

export type GuidedResult = {
  meta: { name: string; cartridge: string | null; rifleId: string | null };
  components: GuidedComponents;
};

const str = (s: string): string | null => (s.trim() === '' ? null : s.trim());
const num = (s: string): number | null => (s.trim() === '' ? null : parseDecimal(s));

/**
 * Draft -> the exact payload the full form would save. Call only after
 * `validateDraft` came back empty. Every column is set explicitly (null when
 * the walkthrough didn't ask for it) so the saved row matches one from the
 * form field-for-field.
 */
export function draftToResult(draft: GuidedDraft): GuidedResult {
  const firings = num(draft.brassFirings);
  return {
    meta: { name: draft.name.trim(), cartridge: str(draft.cartridge), rifleId: draft.rifleId },
    components: {
      bulletMake: str(draft.bulletMake),
      bulletModel: str(draft.bulletModel),
      bulletWeightGr: num(draft.bulletWeight),
      bcValue: num(draft.bcValue),
      bcModel: draft.bcModel,
      bulletLengthIn: num(draft.bulletLength),
      bulletDiameterIn: num(draft.bulletDiameter),
      bcSegments: null,
      powderName: str(draft.powderName),
      chargeGr: num(draft.chargeGr),
      primer: str(draft.primer),
      brass: str(draft.brass),
      brassFirings: firings != null ? Math.round(firings) : null,
      cbtoIn: num(draft.cbto),
      coalIn: num(draft.coal),
      crimp: null,
      muzzleVelocityFps: null,
      mvTempRefF: null,
      mvTempSensFpsPerDegF: null,
      notes: str(draft.notes),
      caseLotNumber: str(draft.caseLot),
      caseWeightGr: null,
      caseVolumeGrH2O: null,
      caseTrimLengthIn: num(draft.caseTrimLength),
      caseTrimmedTo: str(draft.caseTrimmedTo),
      caseNeckTurned: fromYesNo(draft.neckTurned),
      neckWallThicknessIn: null,
      primerPocketUniformed: fromYesNo(draft.pocketUniformed),
      flashHoleDeburred: fromYesNo(draft.flashHoleDeburred),
      caseAnnealed: fromYesNo(draft.annealed),
      annealMethod: str(draft.annealMethod),
      casePrepNotes: null,
      sizingDie: str(draft.sizingDie),
      sizingDieType: sizingDieTypeToStored(draft.sizingDieType),
      bushingSizeIn: num(draft.bushingSize),
      expanderMandrelIn: null,
      shoulderBumpIn: num(draft.shoulderBump),
      lubeMethod: null,
      pressName: str(draft.pressName),
      primerLotNumber: str(draft.primerLot),
      primerSeatingDepthIn: null,
      powderLotNumber: str(draft.powderLot),
      chargeMethod: str(draft.chargeMethod),
      chargeVarianceGr: null,
      seatingDie: str(draft.seatingDie),
      seatingDieMicrometer: null,
      jumpToLandsIn: num(draft.jumpToLands),
      neckTensionIn: num(draft.neckTension),
      crimpDie: null,
      bulletLotNumber: null,
      bulletSortedBy: null,
      runoutIn: null,
      loadedRoundWeightGr: null,
      assemblyNotes: null,
    },
  };
}

/**
 * The review step's summary, rendered through the same recipe presenter the
 * load detail screen uses — so what you see before saving is exactly what the
 * saved load will show.
 */
export function draftPreview(draft: GuidedDraft): {
  ingredients: RecipeRow[];
  stages: RecipeStage[];
} {
  const { components } = draftToResult(draft);
  const version = {
    ...components,
    id: '',
    loadId: '',
    versionNumber: 1,
    parentVersionId: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  } as LoadVersion;
  return { ingredients: ingredientRows(version), stages: recipeStages(version) };
}
