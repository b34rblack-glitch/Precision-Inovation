import type { LoadVersion } from '@/db/schema';

// Presentation model for a load version, shared by the load form and the load
// detail screen so both read in the same order the loader actually works:
// ingredients first, then the process in stages (case prep -> sizing -> priming
// -> charging -> seating -> QC). Pure and UI-free — the screens only render it.

export type RecipeRow = { label: string; value: string };

/** Free-text block rendered as a paragraph rather than a label/value row. */
export type RecipeNote = { label: string; text: string };

export type StageKey = 'casePrep' | 'sizing' | 'priming' | 'charging' | 'seating' | 'qc';

export type RecipeStage = {
  key: StageKey;
  /** Numbered so the section list reads as a procedure, e.g. "1 · Case prep". */
  title: string;
  rows: RecipeRow[];
  notes: RecipeNote[];
};

/** Stage titles, in the order the loader performs them. */
export const STAGE_TITLES: Record<StageKey, string> = {
  casePrep: '1 · Case prep',
  sizing: '2 · Sizing & dies',
  priming: '3 · Priming',
  charging: '4 · Charging',
  seating: '5 · Seating',
  qc: '6 · QC & results',
};

export const STAGE_ORDER: readonly StageKey[] = [
  'casePrep',
  'sizing',
  'priming',
  'charging',
  'seating',
  'qc',
];

// --- formatting helpers -----------------------------------------------------

const trimmed = (s: string | null | undefined): string | null => {
  const t = s?.trim();
  return t ? t : null;
};

/** `0.263` -> `0.263"`. Null/undefined stays null so the row is dropped. */
const inches = (n: number | null | undefined): string | null => (n == null ? null : `${n}"`);

const grains = (n: number | null | undefined): string | null => (n == null ? null : `${n} gr`);

/** Only renders when the flag is on — an unchecked box is not recipe detail. */
const flag = (on: boolean | null | undefined, label: string): string | null => (on ? label : null);

const rows = (candidates: { label: string; value: string | null }[]): RecipeRow[] =>
  candidates.filter((r): r is RecipeRow => Boolean(r.value));

const noteBlocks = (candidates: { label: string; text: string | null }[]): RecipeNote[] =>
  candidates.filter((n): n is RecipeNote => Boolean(n.text));

// --- sizing die type: stored free text <-> UI choice -------------------------

/** The `—` choice means "not recorded" and stores null. */
export const SIZING_DIE_TYPE_CHOICES = ['—', 'Full-length', 'Neck', 'Body'] as const;

export type SizingDieTypeChoice = (typeof SIZING_DIE_TYPE_CHOICES)[number];

const SIZING_DIE_TYPE_STORED: Record<SizingDieTypeChoice, string | null> = {
  '—': null,
  'Full-length': 'full-length',
  Neck: 'neck',
  Body: 'body',
};

export function sizingDieTypeToStored(choice: SizingDieTypeChoice): string | null {
  return SIZING_DIE_TYPE_STORED[choice];
}

/** Unknown/legacy free text falls back to `—` so the segmented control is valid. */
export function sizingDieTypeToChoice(stored: string | null | undefined): SizingDieTypeChoice {
  const match = SIZING_DIE_TYPE_CHOICES.find(
    (c) => SIZING_DIE_TYPE_STORED[c] === stored?.trim().toLowerCase(),
  );
  return match ?? '—';
}

/** Display label for stored sizing die type, e.g. 'full-length' -> 'Full-length'. */
export function sizingDieTypeLabel(stored: string | null | undefined): string | null {
  const choice = sizingDieTypeToChoice(stored);
  return choice === '—' ? trimmed(stored) : choice;
}

// --- boolean <-> Yes/No segmented control ------------------------------------

export const YES_NO = ['Yes', 'No'] as const;

export type YesNo = (typeof YES_NO)[number];

export const toYesNo = (b: boolean | null | undefined): YesNo => (b ? 'Yes' : 'No');

export const fromYesNo = (v: YesNo): boolean => v === 'Yes';

// --- ingredients -------------------------------------------------------------

/**
 * The scannable "what goes in it" list, the way a recipe lists ingredients
 * before the method. Rows with no value are dropped.
 */
export function ingredientRows(v: LoadVersion): RecipeRow[] {
  return rows([
    {
      label: 'Bullet',
      value:
        [v.bulletMake, v.bulletModel, v.bulletWeightGr ? `${v.bulletWeightGr}gr` : null]
          .filter(Boolean)
          .join(' ') || null,
    },
    { label: 'BC', value: v.bcValue ? `${v.bcValue} ${v.bcModel ?? ''}`.trim() : null },
    {
      label: 'Powder',
      value: v.powderName ? `${v.chargeGr ? `${v.chargeGr}gr ` : ''}${v.powderName}` : null,
    },
    { label: 'Primer', value: trimmed(v.primer) },
    {
      label: 'Brass',
      value: v.brass
        ? `${v.brass}${v.brassFirings != null ? ` (${v.brassFirings}x fired)` : ''}`
        : null,
    },
    { label: 'Case lot', value: trimmed(v.caseLotNumber) },
  ]);
}

// --- process stages ----------------------------------------------------------

function stageFor(key: StageKey, v: LoadVersion): RecipeStage {
  switch (key) {
    case 'casePrep':
      return {
        key,
        title: STAGE_TITLES[key],
        rows: rows([
          { label: 'Case weight', value: grains(v.caseWeightGr) },
          {
            label: 'Case volume',
            value: v.caseVolumeGrH2O == null ? null : `${v.caseVolumeGrH2O} gr H₂O`,
          },
          { label: 'Trim length', value: inches(v.caseTrimLengthIn) },
          { label: 'Trimmed with', value: trimmed(v.caseTrimmedTo) },
          { label: 'Neck turned', value: flag(v.caseNeckTurned, 'Yes') },
          { label: 'Neck wall', value: inches(v.neckWallThicknessIn) },
          { label: 'Primer pocket', value: flag(v.primerPocketUniformed, 'Uniformed') },
          { label: 'Flash hole', value: flag(v.flashHoleDeburred, 'Deburred') },
          {
            label: 'Annealed',
            value: v.caseAnnealed ? (trimmed(v.annealMethod) ?? 'Yes') : trimmed(v.annealMethod),
          },
        ]),
        notes: noteBlocks([{ label: 'Prep notes', text: trimmed(v.casePrepNotes) }]),
      };
    case 'sizing':
      return {
        key,
        title: STAGE_TITLES[key],
        rows: rows([
          { label: 'Sizing die', value: sizingLine(v) },
          { label: 'Bushing', value: inches(v.bushingSizeIn) },
          { label: 'Expander mandrel', value: inches(v.expanderMandrelIn) },
          { label: 'Shoulder bump', value: inches(v.shoulderBumpIn) },
          { label: 'Lube', value: trimmed(v.lubeMethod) },
          { label: 'Press', value: trimmed(v.pressName) },
        ]),
        notes: [],
      };
    case 'priming':
      return {
        key,
        title: STAGE_TITLES[key],
        rows: rows([
          { label: 'Primer', value: trimmed(v.primer) },
          { label: 'Primer lot', value: trimmed(v.primerLotNumber) },
          {
            label: 'Seating depth',
            value:
              v.primerSeatingDepthIn == null ? null : `${v.primerSeatingDepthIn}" below flush`,
          },
        ]),
        notes: [],
      };
    case 'charging':
      return {
        key,
        title: STAGE_TITLES[key],
        rows: rows([
          {
            label: 'Charge',
            value:
              v.chargeGr == null ? null : `${v.chargeGr}gr${v.powderName ? ` ${v.powderName}` : ''}`,
          },
          { label: 'Powder lot', value: trimmed(v.powderLotNumber) },
          { label: 'Method', value: trimmed(v.chargeMethod) },
          {
            label: 'Tolerance',
            value: v.chargeVarianceGr == null ? null : `±${v.chargeVarianceGr} gr`,
          },
        ]),
        notes: [],
      };
    case 'seating':
      return {
        key,
        title: STAGE_TITLES[key],
        rows: rows([
          { label: 'Seating die', value: trimmed(v.seatingDie) },
          { label: 'Micrometer', value: trimmed(v.seatingDieMicrometer) },
          { label: 'CBTO', value: inches(v.cbtoIn) },
          { label: 'COAL', value: inches(v.coalIn) },
          { label: 'Jump to lands', value: jumpLine(v.jumpToLandsIn) },
          { label: 'Neck tension', value: inches(v.neckTensionIn) },
          { label: 'Bullet lot', value: trimmed(v.bulletLotNumber) },
          { label: 'Bullets sorted by', value: trimmed(v.bulletSortedBy) },
          { label: 'Crimp', value: trimmed(v.crimp) },
          { label: 'Crimp die', value: trimmed(v.crimpDie) },
        ]),
        notes: [],
      };
    case 'qc':
      return {
        key,
        title: STAGE_TITLES[key],
        rows: rows([
          { label: 'Runout (TIR)', value: inches(v.runoutIn) },
          { label: 'Loaded weight', value: grains(v.loadedRoundWeightGr) },
          {
            label: 'Avg MV',
            value: v.muzzleVelocityFps == null ? null : `${v.muzzleVelocityFps} fps`,
          },
          { label: 'MV measured at', value: v.mvTempRefF == null ? null : `${v.mvTempRefF} °F` },
          {
            label: 'Temp sensitivity',
            value:
              v.mvTempSensFpsPerDegF == null ? null : `${v.mvTempSensFpsPerDegF} fps/°F`,
          },
        ]),
        notes: noteBlocks([
          { label: 'Assembly notes', text: trimmed(v.assemblyNotes) },
          { label: 'Notes', text: trimmed(v.notes) },
        ]),
      };
  }
}

/** Sizing die + how it sizes, e.g. `Redding Type S (Full-length)`. */
function sizingLine(v: LoadVersion): string | null {
  const die = trimmed(v.sizingDie);
  const type = sizingDieTypeLabel(v.sizingDieType);
  if (die && type) return `${die} (${type})`;
  return die ?? type;
}

/** Negative jump is a jam into the lands — spell it out rather than show a minus. */
function jumpLine(jump: number | null | undefined): string | null {
  if (jump == null) return null;
  return jump < 0 ? `${Math.abs(jump)}" jam` : `${jump}"`;
}

/** Every stage, in order, with empty ones dropped. */
export function recipeStages(v: LoadVersion | undefined | null): RecipeStage[] {
  if (!v) return [];
  return STAGE_ORDER.map((key) => stageFor(key, v)).filter(
    (s) => s.rows.length > 0 || s.notes.length > 0,
  );
}

/** Stage keys that already hold data — drives auto-expanding a populated form. */
export function filledStageKeys(v: LoadVersion | undefined | null): Set<StageKey> {
  return new Set(recipeStages(v).map((s) => s.key));
}

/**
 * Flat one-card summary used by the version-history cards, where a full stage
 * breakdown per old version would bury the page.
 */
export function recipeRows(v: LoadVersion): RecipeRow[] {
  return [
    ...ingredientRows(v),
    ...rows([
      { label: 'CBTO', value: inches(v.cbtoIn) },
      { label: 'COAL', value: inches(v.coalIn) },
      { label: 'Crimp', value: trimmed(v.crimp) },
      {
        label: 'Avg MV',
        value: v.muzzleVelocityFps == null ? null : `${v.muzzleVelocityFps} fps`,
      },
    ]),
  ];
}
