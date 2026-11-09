import type { LoadVersion } from '@/db/schema';
import type { StageKey } from '@/features/loads/recipe';

// The load form's optional field groups and the rule for showing them.
// Someone who never crimps marks Crimp "not used" once and the group stays
// out of every load form from then on; a group that holds data on the load
// being edited always shows, so nothing recorded is ever hidden. Pure.

export type FormGroupKey =
  | 'bulletDetail'
  | 'caseLot'
  | 'caseSorting'
  | 'trimming'
  | 'neckTurning'
  | 'pocketPrep'
  | 'annealing'
  | 'casePrepNotes'
  | 'sizingDie'
  | 'bushingMandrel'
  | 'shoulderBump'
  | 'lube'
  | 'press'
  | 'primerLot'
  | 'primerSeating'
  | 'chargeMethod'
  | 'powderLot'
  | 'chargeTolerance'
  | 'seatingDie'
  | 'jump'
  | 'neckTension'
  | 'bulletLot'
  | 'crimp'
  | 'runout'
  | 'loadedWeight'
  | 'mvDetail';

export type FormMode = 'simple' | 'full';

export type FormGroup = {
  key: FormGroupKey;
  title: string;
  /** The stage section the group sits in; bulletDetail has its own section. */
  stage: StageKey | 'bulletDetail';
  /** Shown in Simple mode. */
  core: boolean;
  /** The version columns the group edits; any set value keeps the group visible. */
  fields: readonly (keyof LoadVersion)[];
};

export const FORM_GROUPS: readonly FormGroup[] = [
  { key: 'bulletDetail', title: 'Bullet length, diameter and BC bands', stage: 'bulletDetail', core: false, fields: ['bulletLengthIn', 'bulletDiameterIn', 'bcSegments'] },
  { key: 'caseLot', title: 'Case lot', stage: 'casePrep', core: false, fields: ['caseLotNumber'] },
  { key: 'caseSorting', title: 'Case weight and volume', stage: 'casePrep', core: false, fields: ['caseWeightGr', 'caseVolumeGrH2O'] },
  { key: 'trimming', title: 'Trimming', stage: 'casePrep', core: true, fields: ['caseTrimLengthIn', 'caseTrimmedTo'] },
  { key: 'neckTurning', title: 'Neck turning', stage: 'casePrep', core: false, fields: ['caseNeckTurned', 'neckWallThicknessIn'] },
  { key: 'pocketPrep', title: 'Primer pocket and flash hole', stage: 'casePrep', core: false, fields: ['primerPocketUniformed', 'flashHoleDeburred'] },
  { key: 'annealing', title: 'Annealing', stage: 'casePrep', core: false, fields: ['caseAnnealed', 'annealMethod'] },
  { key: 'casePrepNotes', title: 'Prep notes', stage: 'casePrep', core: false, fields: ['casePrepNotes'] },
  { key: 'sizingDie', title: 'Sizing die', stage: 'sizing', core: true, fields: ['sizingDie', 'sizingDieType'] },
  { key: 'bushingMandrel', title: 'Bushing and mandrel', stage: 'sizing', core: false, fields: ['bushingSizeIn', 'expanderMandrelIn'] },
  { key: 'shoulderBump', title: 'Shoulder bump', stage: 'sizing', core: true, fields: ['shoulderBumpIn'] },
  { key: 'lube', title: 'Lube', stage: 'sizing', core: false, fields: ['lubeMethod'] },
  { key: 'press', title: 'Press', stage: 'sizing', core: false, fields: ['pressName'] },
  { key: 'primerLot', title: 'Primer lot', stage: 'priming', core: false, fields: ['primerLotNumber'] },
  { key: 'primerSeating', title: 'Primer seating depth', stage: 'priming', core: false, fields: ['primerSeatingDepthIn'] },
  { key: 'chargeMethod', title: 'Charge method', stage: 'charging', core: false, fields: ['chargeMethod'] },
  { key: 'powderLot', title: 'Powder lot', stage: 'charging', core: false, fields: ['powderLotNumber'] },
  { key: 'chargeTolerance', title: 'Charge tolerance', stage: 'charging', core: false, fields: ['chargeVarianceGr'] },
  { key: 'seatingDie', title: 'Seating die and micrometer', stage: 'seating', core: false, fields: ['seatingDie', 'seatingDieMicrometer'] },
  { key: 'jump', title: 'Jump to lands', stage: 'seating', core: true, fields: ['jumpToLandsIn'] },
  { key: 'neckTension', title: 'Neck tension', stage: 'seating', core: false, fields: ['neckTensionIn'] },
  { key: 'bulletLot', title: 'Bullet lot and sorting', stage: 'seating', core: false, fields: ['bulletLotNumber', 'bulletSortedBy'] },
  { key: 'crimp', title: 'Crimp', stage: 'seating', core: false, fields: ['crimp', 'crimpDie'] },
  { key: 'runout', title: 'Runout', stage: 'qc', core: false, fields: ['runoutIn'] },
  { key: 'loadedWeight', title: 'Loaded round weight', stage: 'qc', core: false, fields: ['loadedRoundWeightGr'] },
  { key: 'mvDetail', title: 'Powder temperature', stage: 'qc', core: false, fields: ['mvTempRefF', 'mvTempSensFpsPerDegF'] },
];

export const FORM_GROUP_BY_KEY: Record<FormGroupKey, FormGroup> = Object.fromEntries(
  FORM_GROUPS.map((g) => [g.key, g]),
) as Record<FormGroupKey, FormGroup>;

/** A value counts as data unless it is null, blank, false, or an empty list. */
const isSet = (v: unknown): boolean => {
  if (v == null || v === false) return false;
  if (typeof v === 'string') return v.trim() !== '';
  if (Array.isArray(v)) return v.length > 0;
  return true;
};

export function groupHasData(key: FormGroupKey, version: LoadVersion | null | undefined): boolean {
  if (!version) return false;
  return FORM_GROUP_BY_KEY[key].fields.some((f) => isSet(version[f]));
}

export type FormPrefs = { mode: FormMode; notUsed: ReadonlySet<FormGroupKey> };

/**
 * Visible when the load has data in it, or when the preferences allow it:
 * never marked "not used", and either Full mode or a core group.
 */
export function isGroupVisible(
  key: FormGroupKey,
  prefs: FormPrefs,
  version: LoadVersion | null | undefined,
): boolean {
  if (groupHasData(key, version)) return true;
  if (prefs.notUsed.has(key)) return false;
  return prefs.mode === 'full' || FORM_GROUP_BY_KEY[key].core;
}

/** Hidden for preference only (shown in Full mode as a one-line "Show" row). */
export function isGroupNotUsed(key: FormGroupKey, prefs: FormPrefs, version: LoadVersion | null | undefined): boolean {
  return !isGroupVisible(key, prefs, version) && prefs.notUsed.has(key);
}

/** Whether a stage section has anything to show at all. */
export function stageHasVisibleGroups(
  stage: FormGroup['stage'],
  prefs: FormPrefs,
  version: LoadVersion | null | undefined,
  /** Groups the section always carries regardless of preference (e.g. CBTO/COAL in seating). */
  alwaysVisible = false,
): boolean {
  if (alwaysVisible) return true;
  return FORM_GROUPS.some((g) => g.stage === stage && (isGroupVisible(g.key, prefs, version) || (prefs.mode === 'full' && prefs.notUsed.has(g.key))));
}
