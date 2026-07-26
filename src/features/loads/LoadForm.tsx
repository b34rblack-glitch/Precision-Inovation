import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/Buttons';
import { Chip } from '@/components/Chip';
import { CollapsibleSection, Field, Half, NumericField, Row, Segmented } from '@/components/Form';
import { LoadComponentValues } from '@/db/repositories/loads';
import { activeRiflesQuery } from '@/db/repositories/rifles';
import { Load, LoadVersion } from '@/db/schema';
import { ListPickerModal } from '@/components/ListPickerModal';
import { bestBc, CatalogBullet } from '@/data/bulletCatalog';
import {
  BRASS_OPTIONS,
  POWDER_OPTIONS,
  PRESS_OPTIONS,
  PRIMER_OPTIONS,
  SEATING_DIE_OPTIONS,
  SIZING_DIE_OPTIONS,
} from '@/data/componentCatalog';
import { parseDecimal } from '@/lib/parse';
import { BulletCatalogModal } from '@/features/loads/BulletCatalogModal';
import {
  filledStageKeys,
  fromYesNo,
  SIZING_DIE_TYPE_CHOICES,
  SizingDieTypeChoice,
  sizingDieTypeToChoice,
  sizingDieTypeToStored,
  STAGE_TITLES,
  toYesNo,
  YES_NO,
  YesNo,
} from '@/features/loads/recipe';
import { colors, spacing, type } from '@/theme';

export type LoadFormResult = {
  meta: { name: string; cartridge: string | null; rifleId: string | null };
  components: LoadComponentValues;
};

const str = (s: string): string | null => (s.trim() === '' ? null : s.trim());

type Errors = Partial<
  Record<
    | 'name'
    | 'bulletWeight'
    | 'bcValue'
    | 'bulletLength'
    | 'bulletDiameter'
    | 'bcSegments'
    | 'chargeGr'
    | 'brassFirings'
    | 'cbto'
    | 'coal'
    | 'mv'
    | 'mvTempRef'
    | 'mvTempSens'
    | 'caseTrimLength'
    | 'neckWall'
    | 'caseVolume'
    | 'caseWeight'
    | 'bushingSize'
    | 'expanderMandrel'
    | 'shoulderBump'
    | 'primerSeatingDepth'
    | 'chargeVariance'
    | 'jumpToLands'
    | 'neckTension'
    | 'runout'
    | 'loadedWeight',
    string
  >
>;

// Velocity-banded BC entry rows (Sierra-style). Fixed row count keeps the UI
// simple; unused rows stay blank and are dropped on save.
const BC_SEGMENT_ROWS = 4;

const bcSegsFromVersion = (v?: LoadVersion): { vel: string; bc: string }[] =>
  Array.from({ length: BC_SEGMENT_ROWS }, (_, i) => ({
    vel: v?.bcSegments?.[i]?.minVelocityFps?.toString() ?? '',
    bc: v?.bcSegments?.[i]?.bc?.toString() ?? '',
  }));

type Props = {
  initialLoad?: Load;
  initialVersion?: LoadVersion;
  /** Preselects a rifle when creating a new load (ignored when editing). */
  defaultRifleId?: string | null;
  submitLabel: string;
  onSubmit: (result: LoadFormResult) => void | Promise<void>;
};

export function LoadForm({ initialLoad, initialVersion, defaultRifleId, submitLabel, onSubmit }: Props) {
  const navigation = useNavigation();
  const { data: rifles } = useLiveQuery(activeRiflesQuery());

  const initialRifleId = initialLoad ? (initialLoad.rifleId ?? null) : (defaultRifleId ?? null);
  const [name, setName] = useState(initialLoad?.name ?? '');
  const [cartridge, setCartridge] = useState(initialLoad?.cartridge ?? '');
  const [rifleId, setRifleId] = useState<string | null>(initialRifleId);

  const [bulletMake, setBulletMake] = useState(initialVersion?.bulletMake ?? '');
  const [bulletModel, setBulletModel] = useState(initialVersion?.bulletModel ?? '');
  const [bulletWeight, setBulletWeight] = useState(initialVersion?.bulletWeightGr?.toString() ?? '');
  const [bcValue, setBcValue] = useState(initialVersion?.bcValue?.toString() ?? '');
  const [bcModel, setBcModel] = useState<'G1' | 'G7'>(initialVersion?.bcModel ?? 'G7');
  const [bulletLength, setBulletLength] = useState(initialVersion?.bulletLengthIn?.toString() ?? '');
  const [bulletDiameter, setBulletDiameter] = useState(
    initialVersion?.bulletDiameterIn?.toString() ?? '',
  );
  const [bcSegs, setBcSegs] = useState<{ vel: string; bc: string }[]>(() =>
    bcSegsFromVersion(initialVersion),
  );
  const [powderName, setPowderName] = useState(initialVersion?.powderName ?? '');
  const [chargeGr, setChargeGr] = useState(initialVersion?.chargeGr?.toString() ?? '');
  const [primer, setPrimer] = useState(initialVersion?.primer ?? '');
  const [brass, setBrass] = useState(initialVersion?.brass ?? '');
  const [brassFirings, setBrassFirings] = useState(initialVersion?.brassFirings?.toString() ?? '');
  const [cbto, setCbto] = useState(initialVersion?.cbtoIn?.toString() ?? '');
  const [coal, setCoal] = useState(initialVersion?.coalIn?.toString() ?? '');
  const [crimp, setCrimp] = useState(initialVersion?.crimp ?? '');
  const [mv, setMv] = useState(initialVersion?.muzzleVelocityFps?.toString() ?? '');
  const [mvTempRef, setMvTempRef] = useState(initialVersion?.mvTempRefF?.toString() ?? '');
  const [mvTempSens, setMvTempSens] = useState(
    initialVersion?.mvTempSensFpsPerDegF?.toString() ?? '',
  );
  const [notes, setNotes] = useState(initialVersion?.notes ?? '');

  // 1 · Case prep
  const [caseLot, setCaseLot] = useState(initialVersion?.caseLotNumber ?? '');
  const [caseWeight, setCaseWeight] = useState(initialVersion?.caseWeightGr?.toString() ?? '');
  const [caseVolume, setCaseVolume] = useState(initialVersion?.caseVolumeGrH2O?.toString() ?? '');
  const [caseTrimLength, setCaseTrimLength] = useState(
    initialVersion?.caseTrimLengthIn?.toString() ?? '',
  );
  const [caseTrimmedTo, setCaseTrimmedTo] = useState(initialVersion?.caseTrimmedTo ?? '');
  const [neckTurned, setNeckTurned] = useState<YesNo>(toYesNo(initialVersion?.caseNeckTurned));
  const [neckWall, setNeckWall] = useState(initialVersion?.neckWallThicknessIn?.toString() ?? '');
  const [pocketUniformed, setPocketUniformed] = useState<YesNo>(
    toYesNo(initialVersion?.primerPocketUniformed),
  );
  const [flashHoleDeburred, setFlashHoleDeburred] = useState<YesNo>(
    toYesNo(initialVersion?.flashHoleDeburred),
  );
  const [annealed, setAnnealed] = useState<YesNo>(toYesNo(initialVersion?.caseAnnealed));
  const [annealMethod, setAnnealMethod] = useState(initialVersion?.annealMethod ?? '');
  const [casePrepNotes, setCasePrepNotes] = useState(initialVersion?.casePrepNotes ?? '');

  // 2 · Sizing & dies
  const [sizingDie, setSizingDie] = useState(initialVersion?.sizingDie ?? '');
  const [sizingDieType, setSizingDieType] = useState<SizingDieTypeChoice>(
    sizingDieTypeToChoice(initialVersion?.sizingDieType),
  );
  const [bushingSize, setBushingSize] = useState(initialVersion?.bushingSizeIn?.toString() ?? '');
  const [expanderMandrel, setExpanderMandrel] = useState(
    initialVersion?.expanderMandrelIn?.toString() ?? '',
  );
  const [shoulderBump, setShoulderBump] = useState(initialVersion?.shoulderBumpIn?.toString() ?? '');
  const [lubeMethod, setLubeMethod] = useState(initialVersion?.lubeMethod ?? '');
  const [pressName, setPressName] = useState(initialVersion?.pressName ?? '');

  // 3 · Priming
  const [primerLot, setPrimerLot] = useState(initialVersion?.primerLotNumber ?? '');
  const [primerSeatingDepth, setPrimerSeatingDepth] = useState(
    initialVersion?.primerSeatingDepthIn?.toString() ?? '',
  );

  // 4 · Charging
  const [powderLot, setPowderLot] = useState(initialVersion?.powderLotNumber ?? '');
  const [chargeMethod, setChargeMethod] = useState(initialVersion?.chargeMethod ?? '');
  const [chargeVariance, setChargeVariance] = useState(
    initialVersion?.chargeVarianceGr?.toString() ?? '',
  );

  // 5 · Seating
  const [seatingDie, setSeatingDie] = useState(initialVersion?.seatingDie ?? '');
  const [seatingMicrometer, setSeatingMicrometer] = useState(
    initialVersion?.seatingDieMicrometer ?? '',
  );
  const [jumpToLands, setJumpToLands] = useState(initialVersion?.jumpToLandsIn?.toString() ?? '');
  const [neckTension, setNeckTension] = useState(initialVersion?.neckTensionIn?.toString() ?? '');
  const [crimpDie, setCrimpDie] = useState(initialVersion?.crimpDie ?? '');
  const [bulletLot, setBulletLot] = useState(initialVersion?.bulletLotNumber ?? '');
  const [bulletSortedBy, setBulletSortedBy] = useState(initialVersion?.bulletSortedBy ?? '');

  // 6 · QC & results
  const [runout, setRunout] = useState(initialVersion?.runoutIn?.toString() ?? '');
  const [loadedWeight, setLoadedWeight] = useState(
    initialVersion?.loadedRoundWeightGr?.toString() ?? '',
  );
  const [assemblyNotes, setAssemblyNotes] = useState(initialVersion?.assemblyNotes ?? '');

  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [powderPickerOpen, setPowderPickerOpen] = useState(false);
  const [primerPickerOpen, setPrimerPickerOpen] = useState(false);
  const [brassPickerOpen, setBrassPickerOpen] = useState(false);
  const [sizingDiePickerOpen, setSizingDiePickerOpen] = useState(false);
  const [seatingDiePickerOpen, setSeatingDiePickerOpen] = useState(false);
  const [pressPickerOpen, setPressPickerOpen] = useState(false);

  // A stage that already holds data opens on mount, so editing an existing
  // recipe never hides what was recorded behind a collapsed header.
  const [filledStages] = useState(() => filledStageKeys(initialVersion));
  const bulletDetailFilled =
    initialVersion?.bulletLengthIn != null ||
    initialVersion?.bulletDiameterIn != null ||
    (initialVersion?.bcSegments?.length ?? 0) > 0;

  const dirty =
    name !== (initialLoad?.name ?? '') ||
    cartridge !== (initialLoad?.cartridge ?? '') ||
    rifleId !== initialRifleId ||
    bulletMake !== (initialVersion?.bulletMake ?? '') ||
    bulletModel !== (initialVersion?.bulletModel ?? '') ||
    bulletWeight !== (initialVersion?.bulletWeightGr?.toString() ?? '') ||
    bcValue !== (initialVersion?.bcValue?.toString() ?? '') ||
    bcModel !== (initialVersion?.bcModel ?? 'G7') ||
    bulletLength !== (initialVersion?.bulletLengthIn?.toString() ?? '') ||
    bulletDiameter !== (initialVersion?.bulletDiameterIn?.toString() ?? '') ||
    JSON.stringify(bcSegs) !== JSON.stringify(bcSegsFromVersion(initialVersion)) ||
    powderName !== (initialVersion?.powderName ?? '') ||
    chargeGr !== (initialVersion?.chargeGr?.toString() ?? '') ||
    primer !== (initialVersion?.primer ?? '') ||
    brass !== (initialVersion?.brass ?? '') ||
    brassFirings !== (initialVersion?.brassFirings?.toString() ?? '') ||
    cbto !== (initialVersion?.cbtoIn?.toString() ?? '') ||
    coal !== (initialVersion?.coalIn?.toString() ?? '') ||
    crimp !== (initialVersion?.crimp ?? '') ||
    mv !== (initialVersion?.muzzleVelocityFps?.toString() ?? '') ||
    mvTempRef !== (initialVersion?.mvTempRefF?.toString() ?? '') ||
    mvTempSens !== (initialVersion?.mvTempSensFpsPerDegF?.toString() ?? '') ||
    notes !== (initialVersion?.notes ?? '') ||
    caseLot !== (initialVersion?.caseLotNumber ?? '') ||
    caseWeight !== (initialVersion?.caseWeightGr?.toString() ?? '') ||
    caseVolume !== (initialVersion?.caseVolumeGrH2O?.toString() ?? '') ||
    caseTrimLength !== (initialVersion?.caseTrimLengthIn?.toString() ?? '') ||
    caseTrimmedTo !== (initialVersion?.caseTrimmedTo ?? '') ||
    neckTurned !== toYesNo(initialVersion?.caseNeckTurned) ||
    neckWall !== (initialVersion?.neckWallThicknessIn?.toString() ?? '') ||
    pocketUniformed !== toYesNo(initialVersion?.primerPocketUniformed) ||
    flashHoleDeburred !== toYesNo(initialVersion?.flashHoleDeburred) ||
    annealed !== toYesNo(initialVersion?.caseAnnealed) ||
    annealMethod !== (initialVersion?.annealMethod ?? '') ||
    casePrepNotes !== (initialVersion?.casePrepNotes ?? '') ||
    sizingDie !== (initialVersion?.sizingDie ?? '') ||
    sizingDieType !== sizingDieTypeToChoice(initialVersion?.sizingDieType) ||
    bushingSize !== (initialVersion?.bushingSizeIn?.toString() ?? '') ||
    expanderMandrel !== (initialVersion?.expanderMandrelIn?.toString() ?? '') ||
    shoulderBump !== (initialVersion?.shoulderBumpIn?.toString() ?? '') ||
    lubeMethod !== (initialVersion?.lubeMethod ?? '') ||
    pressName !== (initialVersion?.pressName ?? '') ||
    primerLot !== (initialVersion?.primerLotNumber ?? '') ||
    primerSeatingDepth !== (initialVersion?.primerSeatingDepthIn?.toString() ?? '') ||
    powderLot !== (initialVersion?.powderLotNumber ?? '') ||
    chargeMethod !== (initialVersion?.chargeMethod ?? '') ||
    chargeVariance !== (initialVersion?.chargeVarianceGr?.toString() ?? '') ||
    seatingDie !== (initialVersion?.seatingDie ?? '') ||
    seatingMicrometer !== (initialVersion?.seatingDieMicrometer ?? '') ||
    jumpToLands !== (initialVersion?.jumpToLandsIn?.toString() ?? '') ||
    neckTension !== (initialVersion?.neckTensionIn?.toString() ?? '') ||
    crimpDie !== (initialVersion?.crimpDie ?? '') ||
    bulletLot !== (initialVersion?.bulletLotNumber ?? '') ||
    bulletSortedBy !== (initialVersion?.bulletSortedBy ?? '') ||
    runout !== (initialVersion?.runoutIn?.toString() ?? '') ||
    loadedWeight !== (initialVersion?.loadedRoundWeightGr?.toString() ?? '') ||
    assemblyNotes !== (initialVersion?.assemblyNotes ?? '');

  // While submitting the guard is down so the post-save navigation goes through;
  // a failed save re-arms it (submitting resets to false).
  usePreventRemove(dirty && !submitting, ({ data }) => {
    Alert.alert('Discard changes?', 'You have unsaved edits on this load.', [
      { text: 'Keep Editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => navigation.dispatch(data.action) },
    ]);
  });

  const clearError = (key: keyof Errors) =>
    setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));

  // Catalog pick prefills the bullet's make/model/weight and its best BC
  // (G7 preferred). Every field stays editable afterward.
  const applyCatalogBullet = (bullet: CatalogBullet) => {
    setBulletMake(bullet.maker);
    setBulletModel(bullet.model);
    setBulletWeight(bullet.weightGr.toString());
    // The catalog knows diameter but not length — length stays hand-entered.
    setBulletDiameter(bullet.diameterIn.toString());
    const bc = bestBc(bullet);
    if (bc) {
      setBcValue(bc.bcValue.toString());
      setBcModel(bc.bcModel);
    }
    setErrors((e) => ({ ...e, bulletWeight: undefined, bcValue: undefined, bulletDiameter: undefined }));
  };

  const setBcSeg = (i: number, patch: Partial<{ vel: string; bc: string }>) => {
    setBcSegs((rows) => rows.map((row, j) => (j === i ? { ...row, ...patch } : row)));
    clearError('bcSegments');
  };

  const submit = async () => {
    const errs: Errors = {};
    // Non-empty but unparseable numbers block submit; empty stays null.
    const num = (value: string, key: keyof Errors): number | null => {
      if (value.trim() === '') return null;
      const n = parseDecimal(value);
      if (n === null) errs[key] = 'Enter a number like 41.5';
      return n;
    };
    // A physical dimension that can't be zero or negative (a thickness, a weight).
    const numPos = (value: string, key: keyof Errors, label: string): number | null => {
      const n = num(value, key);
      if (n !== null && n <= 0 && !errs[key]) errs[key] = `${label} must be greater than 0.`;
      return n;
    };
    // Zero is meaningful (no bump, perfect runout, flush primer) but negative isn't.
    const numNonNeg = (value: string, key: keyof Errors, label: string): number | null => {
      const n = num(value, key);
      if (n !== null && n < 0 && !errs[key]) errs[key] = `${label} can't be negative.`;
      return n;
    };
    if (name.trim() === '') errs.name = 'Name is required — everything else is optional.';
    const bulletWeightGr = num(bulletWeight, 'bulletWeight');
    const bc = num(bcValue, 'bcValue');
    if (bc !== null && bc <= 0 && !errs.bcValue) errs.bcValue = 'BC must be greater than 0.';
    const bulletLengthIn = num(bulletLength, 'bulletLength');
    if (bulletLengthIn !== null && bulletLengthIn <= 0 && !errs.bulletLength)
      errs.bulletLength = 'Length must be greater than 0.';
    const bulletDiameterIn = num(bulletDiameter, 'bulletDiameter');
    if (bulletDiameterIn !== null && bulletDiameterIn <= 0 && !errs.bulletDiameter)
      errs.bulletDiameter = 'Diameter must be greater than 0.';
    const charge = num(chargeGr, 'chargeGr');
    const firings = num(brassFirings, 'brassFirings');
    const cbtoIn = num(cbto, 'cbto');
    const coalIn = num(coal, 'coal');
    const muzzleVelocityFps = num(mv, 'mv');
    const mvTempRefF = num(mvTempRef, 'mvTempRef');
    const mvTempSensFpsPerDegF = num(mvTempSens, 'mvTempSens');
    // Case prep
    const caseWeightGr = numPos(caseWeight, 'caseWeight', 'Case weight');
    const caseVolumeGrH2O = numPos(caseVolume, 'caseVolume', 'Case volume');
    const caseTrimLengthIn = numPos(caseTrimLength, 'caseTrimLength', 'Trim length');
    const neckWallThicknessIn = numPos(neckWall, 'neckWall', 'Neck wall thickness');
    // Sizing & dies
    const bushingSizeIn = numPos(bushingSize, 'bushingSize', 'Bushing size');
    const expanderMandrelIn = numPos(expanderMandrel, 'expanderMandrel', 'Mandrel diameter');
    const shoulderBumpIn = numNonNeg(shoulderBump, 'shoulderBump', 'Shoulder bump');
    // Priming & charging
    const primerSeatingDepthIn = numNonNeg(
      primerSeatingDepth,
      'primerSeatingDepth',
      'Primer seating depth',
    );
    const chargeVarianceGr = numNonNeg(chargeVariance, 'chargeVariance', 'Charge tolerance');
    // Seating — jump is signed: negative means the bullet is jammed into the lands.
    const jumpToLandsIn = num(jumpToLands, 'jumpToLands');
    const neckTensionIn = numPos(neckTension, 'neckTension', 'Neck tension');
    // QC
    const runoutIn = numNonNeg(runout, 'runout', 'Runout');
    const loadedRoundWeightGr = numPos(loadedWeight, 'loadedWeight', 'Loaded round weight');
    // BC bands: a row counts only when BOTH halves are present and valid; a
    // half-filled or garbage row blocks submit instead of being dropped.
    const segments: { minVelocityFps: number; bc: number }[] = [];
    for (const row of bcSegs) {
      if (row.vel.trim() === '' && row.bc.trim() === '') continue;
      const vel = parseDecimal(row.vel);
      const segBc = parseDecimal(row.bc);
      if (vel === null || vel < 0 || segBc === null || segBc <= 0) {
        errs.bcSegments = 'Each band needs a min velocity (fps) and a BC greater than 0.';
        break;
      }
      segments.push({ minVelocityFps: vel, bc: segBc });
    }
    if (Object.values(errs).some(Boolean)) {
      setErrors(errs);
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      await onSubmit({
        meta: { name: name.trim(), cartridge: str(cartridge), rifleId },
        components: {
          bulletMake: str(bulletMake),
          bulletModel: str(bulletModel),
          bulletWeightGr,
          bcValue: bc,
          bcModel,
          bulletLengthIn,
          bulletDiameterIn,
          bcSegments: segments.length > 0 ? segments : null,
          powderName: str(powderName),
          chargeGr: charge,
          primer: str(primer),
          brass: str(brass),
          brassFirings: firings != null ? Math.round(firings) : null,
          cbtoIn,
          coalIn,
          crimp: str(crimp),
          muzzleVelocityFps,
          mvTempRefF,
          mvTempSensFpsPerDegF,
          notes: str(notes),
          caseLotNumber: str(caseLot),
          caseWeightGr,
          caseVolumeGrH2O,
          caseTrimLengthIn,
          caseTrimmedTo: str(caseTrimmedTo),
          caseNeckTurned: fromYesNo(neckTurned),
          neckWallThicknessIn,
          primerPocketUniformed: fromYesNo(pocketUniformed),
          flashHoleDeburred: fromYesNo(flashHoleDeburred),
          caseAnnealed: fromYesNo(annealed),
          annealMethod: str(annealMethod),
          casePrepNotes: str(casePrepNotes),
          sizingDie: str(sizingDie),
          sizingDieType: sizingDieTypeToStored(sizingDieType),
          bushingSizeIn,
          expanderMandrelIn,
          shoulderBumpIn,
          lubeMethod: str(lubeMethod),
          pressName: str(pressName),
          primerLotNumber: str(primerLot),
          primerSeatingDepthIn,
          powderLotNumber: str(powderLot),
          chargeMethod: str(chargeMethod),
          chargeVarianceGr,
          seatingDie: str(seatingDie),
          seatingDieMicrometer: str(seatingMicrometer),
          jumpToLandsIn,
          neckTensionIn,
          crimpDie: str(crimpDie),
          bulletLotNumber: str(bulletLot),
          bulletSortedBy: str(bulletSortedBy),
          runoutIn,
          loadedRoundWeightGr,
          assemblyNotes: str(assemblyNotes),
        },
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View>
      <Text style={[type.secondary, styles.formHint]}>
        Only Name is required — fill in as much or as little of the rest as you track.
      </Text>
      <Field
        label="Name *"
        value={name}
        onChangeText={(v) => {
          setName(v);
          clearError('name');
        }}
        placeholder={'e.g. "140 ELD-M / H4350 41.5"'}
        autoFocus={!initialLoad}
        error={errors.name}
      />
      <Field label="Cartridge" value={cartridge} onChangeText={setCartridge} placeholder="6.5 Creedmoor" />

      <Text style={type.label}>Rifle</Text>
      <View style={{ marginBottom: spacing.lg, marginTop: spacing.xs }}>
        {rifles.length === 0 ? (
          <Text style={type.secondary}>No rifles yet — this load can stay unassigned.</Text>
        ) : (
          <View style={styles.chipWrap}>
            <Chip label="Unassigned" selected={rifleId === null} onPress={() => setRifleId(null)} />
            {rifles.map((r) => (
              <Chip key={r.id} label={r.name} selected={rifleId === r.id} onPress={() => setRifleId(r.id)} />
            ))}
          </View>
        )}
      </View>

      <CollapsibleSection title="Ingredients" initiallyOpen>
        <Text style={[type.secondary, styles.sectionHint]}>
          What goes in the round. The numbered steps below record how you put it together.
        </Text>
        <Button
          label="Choose from Catalog"
          variant="secondary"
          onPress={() => setCatalogOpen(true)}
          style={{ marginBottom: spacing.md }}
        />
        <Row>
          <Half>
            <Field label="Bullet make" value={bulletMake} onChangeText={setBulletMake} placeholder="Hornady" />
          </Half>
          <Half>
            <Field label="Bullet model" value={bulletModel} onChangeText={setBulletModel} placeholder="ELD-M" />
          </Half>
        </Row>
        <Row>
          <Half>
            <NumericField
              label="Weight"
              value={bulletWeight}
              onChangeText={(v) => {
                setBulletWeight(v);
                clearError('bulletWeight');
              }}
              suffix="gr"
              error={errors.bulletWeight}
            />
          </Half>
          <Half>
            <NumericField
              label="BC (for range cards)"
              value={bcValue}
              onChangeText={(v) => {
                setBcValue(v);
                clearError('bcValue');
              }}
              placeholder="0.326"
              error={errors.bcValue}
            />
          </Half>
        </Row>
        <Segmented label="BC model" options={['G7', 'G1'] as const} value={bcModel} onChange={setBcModel} />
        <Button
          label="Choose Powder"
          variant="secondary"
          onPress={() => setPowderPickerOpen(true)}
          style={{ marginBottom: spacing.md }}
        />
        <Row>
          <Half>
            <Field label="Powder" value={powderName} onChangeText={setPowderName} placeholder="H4350" />
          </Half>
          <Half>
            <NumericField
              label="Charge"
              value={chargeGr}
              onChangeText={(v) => {
                setChargeGr(v);
                clearError('chargeGr');
              }}
              suffix="gr"
              error={errors.chargeGr}
            />
          </Half>
        </Row>
        <Field label="Primer" value={primer} onChangeText={setPrimer} placeholder="CCI BR-2" />
        <Button
          label="Choose Primer"
          variant="secondary"
          onPress={() => setPrimerPickerOpen(true)}
          style={{ marginBottom: spacing.lg }}
        />
        <Row>
          <Half>
            <Field label="Brass" value={brass} onChangeText={setBrass} placeholder="Lapua" />
          </Half>
          <Half>
            <NumericField
              label="Firings"
              value={brassFirings}
              onChangeText={(v) => {
                setBrassFirings(v);
                clearError('brassFirings');
              }}
              integer
              error={errors.brassFirings}
            />
          </Half>
        </Row>
        <Button label="Choose Brass" variant="secondary" onPress={() => setBrassPickerOpen(true)} />
      </CollapsibleSection>

      <CollapsibleSection title="Bullet ballistics detail" initiallyOpen={bulletDetailFilled}>
        <Text style={[type.secondary, styles.sectionHint]}>
          Length + diameter enable the spin-drift estimate on range cards.
        </Text>
        <Row>
          <Half>
            <NumericField
              label="Length"
              value={bulletLength}
              onChangeText={(v) => {
                setBulletLength(v);
                clearError('bulletLength');
              }}
              suffix="in"
              placeholder="1.40"
              error={errors.bulletLength}
            />
          </Half>
          <Half>
            <NumericField
              label="Diameter"
              value={bulletDiameter}
              onChangeText={(v) => {
                setBulletDiameter(v);
                clearError('bulletDiameter');
              }}
              suffix="in"
              placeholder="0.264"
              error={errors.bulletDiameter}
            />
          </Half>
        </Row>
        <Text style={[type.secondary, styles.sectionHint]}>
          Velocity-banded BC (Sierra-style): each BC applies at or above its min velocity. Leave
          empty to use the single BC above everywhere.
        </Text>
        {bcSegs.map((seg, i) => (
          <Row key={i}>
            <Half>
              <NumericField
                label={`Band ${i + 1} min velocity`}
                value={seg.vel}
                onChangeText={(v) => setBcSeg(i, { vel: v })}
                suffix="fps"
              />
            </Half>
            <Half>
              <NumericField
                label={`Band ${i + 1} BC`}
                value={seg.bc}
                onChangeText={(v) => setBcSeg(i, { bc: v })}
                placeholder="0.326"
              />
            </Half>
          </Row>
        ))}
        {errors.bcSegments ? (
          <Text style={{ color: colors.danger, marginBottom: spacing.md }}>
            {errors.bcSegments}
          </Text>
        ) : null}
      </CollapsibleSection>

      <CollapsibleSection title={STAGE_TITLES.casePrep} initiallyOpen={filledStages.has('casePrep')}>
        <Row>
          <Half>
            <Field label="Case lot #" value={caseLot} onChangeText={setCaseLot} placeholder="Lot 4823" />
          </Half>
          <Half>
            <NumericField
              label="Case weight"
              value={caseWeight}
              onChangeText={(v) => {
                setCaseWeight(v);
                clearError('caseWeight');
              }}
              suffix="gr"
              error={errors.caseWeight}
            />
          </Half>
        </Row>
        <Row>
          <Half>
            <NumericField
              label="Case volume"
              value={caseVolume}
              onChangeText={(v) => {
                setCaseVolume(v);
                clearError('caseVolume');
              }}
              suffix="gr H₂O"
              error={errors.caseVolume}
            />
          </Half>
          <Half>
            <NumericField
              label="Trim length"
              value={caseTrimLength}
              onChangeText={(v) => {
                setCaseTrimLength(v);
                clearError('caseTrimLength');
              }}
              suffix="in"
              placeholder="1.910"
              error={errors.caseTrimLength}
            />
          </Half>
        </Row>
        <Field
          label="Trimmed with"
          value={caseTrimmedTo}
          onChangeText={setCaseTrimmedTo}
          placeholder="Giraud"
          autoCapitalize="words"
        />
        <Row>
          <Half>
            <Segmented label="Neck turned" options={YES_NO} value={neckTurned} onChange={setNeckTurned} />
          </Half>
          <Half>
            <NumericField
              label="Neck wall"
              value={neckWall}
              onChangeText={(v) => {
                setNeckWall(v);
                clearError('neckWall');
              }}
              suffix="in"
              placeholder="0.0135"
              error={errors.neckWall}
            />
          </Half>
        </Row>
        <Row>
          <Half>
            <Segmented
              label="Pocket uniformed"
              options={YES_NO}
              value={pocketUniformed}
              onChange={setPocketUniformed}
            />
          </Half>
          <Half>
            <Segmented
              label="Flash hole deburred"
              options={YES_NO}
              value={flashHoleDeburred}
              onChange={setFlashHoleDeburred}
            />
          </Half>
        </Row>
        <Row>
          <Half>
            <Segmented label="Annealed" options={YES_NO} value={annealed} onChange={setAnnealed} />
          </Half>
          <Half>
            <Field
              label="Anneal method"
              value={annealMethod}
              onChangeText={setAnnealMethod}
              placeholder="AMP mode 62"
            />
          </Half>
        </Row>
        <Field
          label="Prep notes"
          value={casePrepNotes}
          onChangeText={setCasePrepNotes}
          multiline
          placeholder="Chamfer, deburr, pocket uniforming…"
        />
      </CollapsibleSection>

      <CollapsibleSection title={STAGE_TITLES.sizing} initiallyOpen={filledStages.has('sizing')}>
        <Field
          label="Sizing die"
          value={sizingDie}
          onChangeText={setSizingDie}
          placeholder="Redding Type S Full Length Bushing"
          autoCapitalize="words"
        />
        <Button
          label="Choose Sizing Die"
          variant="secondary"
          onPress={() => setSizingDiePickerOpen(true)}
          style={{ marginBottom: spacing.lg }}
        />
        <Segmented
          label="Sizes"
          options={SIZING_DIE_TYPE_CHOICES}
          value={sizingDieType}
          onChange={setSizingDieType}
        />
        <Row>
          <Half>
            <NumericField
              label="Bushing"
              value={bushingSize}
              onChangeText={(v) => {
                setBushingSize(v);
                clearError('bushingSize');
              }}
              suffix="in"
              placeholder="0.289"
              error={errors.bushingSize}
            />
          </Half>
          <Half>
            <NumericField
              label="Expander mandrel"
              value={expanderMandrel}
              onChangeText={(v) => {
                setExpanderMandrel(v);
                clearError('expanderMandrel');
              }}
              suffix="in"
              placeholder="0.2625"
              error={errors.expanderMandrel}
            />
          </Half>
        </Row>
        <NumericField
          label="Shoulder bump"
          value={shoulderBump}
          onChangeText={(v) => {
            setShoulderBump(v);
            clearError('shoulderBump');
          }}
          suffix="in"
          placeholder="0.002"
          error={errors.shoulderBump}
        />
        <Field
          label="Lube"
          value={lubeMethod}
          onChangeText={setLubeMethod}
          placeholder="Imperial wax, graphite necks"
        />
        <Field
          label="Press"
          value={pressName}
          onChangeText={setPressName}
          placeholder="Forster Co-Ax"
          autoCapitalize="words"
        />
        <Button label="Choose Press" variant="secondary" onPress={() => setPressPickerOpen(true)} />
      </CollapsibleSection>

      <CollapsibleSection title={STAGE_TITLES.priming} initiallyOpen={filledStages.has('priming')}>
        <Text style={[type.secondary, styles.sectionHint]}>
          The primer itself is in Ingredients — this is the lot and how deep it seated.
        </Text>
        <Row>
          <Half>
            <Field label="Primer lot #" value={primerLot} onChangeText={setPrimerLot} placeholder="Lot 91-2" />
          </Half>
          <Half>
            <NumericField
              label="Below flush"
              value={primerSeatingDepth}
              onChangeText={(v) => {
                setPrimerSeatingDepth(v);
                clearError('primerSeatingDepth');
              }}
              suffix="in"
              placeholder="0.003"
              error={errors.primerSeatingDepth}
            />
          </Half>
        </Row>
      </CollapsibleSection>

      <CollapsibleSection title={STAGE_TITLES.charging} initiallyOpen={filledStages.has('charging')}>
        <Text style={[type.secondary, styles.sectionHint]}>
          Powder and charge weight are in Ingredients — this is how the charge was thrown.
        </Text>
        <Field
          label="Charge method"
          value={chargeMethod}
          onChangeText={setChargeMethod}
          placeholder="Autotrickler V4"
        />
        <Row>
          <Half>
            <Field label="Powder lot #" value={powderLot} onChangeText={setPowderLot} placeholder="Lot 8021" />
          </Half>
          <Half>
            <NumericField
              label="Tolerance (±)"
              value={chargeVariance}
              onChangeText={(v) => {
                setChargeVariance(v);
                clearError('chargeVariance');
              }}
              suffix="gr"
              placeholder="0.02"
              error={errors.chargeVariance}
            />
          </Half>
        </Row>
      </CollapsibleSection>

      <CollapsibleSection title={STAGE_TITLES.seating} initiallyOpen={filledStages.has('seating')}>
        <Field
          label="Seating die"
          value={seatingDie}
          onChangeText={setSeatingDie}
          placeholder="Redding Competition Seating"
          autoCapitalize="words"
        />
        <Button
          label="Choose Seating Die"
          variant="secondary"
          onPress={() => setSeatingDiePickerOpen(true)}
          style={{ marginBottom: spacing.lg }}
        />
        <Field
          label="Micrometer setting"
          value={seatingMicrometer}
          onChangeText={setSeatingMicrometer}
          placeholder="4.5 on the dial"
        />
        <Row>
          <Half>
            <NumericField
              label="CBTO"
              value={cbto}
              onChangeText={(v) => {
                setCbto(v);
                clearError('cbto');
              }}
              suffix="in"
              error={errors.cbto}
            />
          </Half>
          <Half>
            <NumericField
              label="COAL"
              value={coal}
              onChangeText={(v) => {
                setCoal(v);
                clearError('coal');
              }}
              suffix="in"
              error={errors.coal}
            />
          </Half>
        </Row>
        <Row>
          <Half>
            <NumericField
              label="Jump to lands"
              value={jumpToLands}
              onChangeText={(v) => {
                setJumpToLands(v);
                clearError('jumpToLands');
              }}
              suffix="in"
              signed
              placeholder="0.020"
              error={errors.jumpToLands}
            />
          </Half>
          <Half>
            <NumericField
              label="Neck tension"
              value={neckTension}
              onChangeText={(v) => {
                setNeckTension(v);
                clearError('neckTension');
              }}
              suffix="in"
              placeholder="0.002"
              error={errors.neckTension}
            />
          </Half>
        </Row>
        <Text style={[type.secondary, styles.sectionHint]}>
          Jump is measured off the lands — enter a negative value if the bullet is jammed in.
        </Text>
        <Row>
          <Half>
            <Field label="Bullet lot #" value={bulletLot} onChangeText={setBulletLot} placeholder="Lot 3390" />
          </Half>
          <Half>
            <Field
              label="Bullets sorted by"
              value={bulletSortedBy}
              onChangeText={setBulletSortedBy}
              placeholder="base-to-ogive"
            />
          </Half>
        </Row>
        <Row>
          <Half>
            <Field label="Crimp" value={crimp} onChangeText={setCrimp} placeholder="None" />
          </Half>
          <Half>
            <Field
              label="Crimp die"
              value={crimpDie}
              onChangeText={setCrimpDie}
              placeholder="Lee Factory Crimp"
              autoCapitalize="words"
            />
          </Half>
        </Row>
      </CollapsibleSection>

      <CollapsibleSection title={STAGE_TITLES.qc} initiallyOpen={filledStages.has('qc')}>
        <Row>
          <Half>
            <NumericField
              label="Runout (TIR)"
              value={runout}
              onChangeText={(v) => {
                setRunout(v);
                clearError('runout');
              }}
              suffix="in"
              placeholder="0.001"
              error={errors.runout}
            />
          </Half>
          <Half>
            <NumericField
              label="Loaded weight"
              value={loadedWeight}
              onChangeText={(v) => {
                setLoadedWeight(v);
                clearError('loadedWeight');
              }}
              suffix="gr"
              error={errors.loadedWeight}
            />
          </Half>
        </Row>
        <NumericField
          label="Muzzle velocity (avg)"
          value={mv}
          onChangeText={(v) => {
            setMv(v);
            clearError('mv');
          }}
          suffix="fps"
          error={errors.mv}
        />
        <Row>
          <Half>
            <NumericField
              label="MV measured at"
              value={mvTempRef}
              onChangeText={(v) => {
                setMvTempRef(v);
                clearError('mvTempRef');
              }}
              suffix="°F"
              signed
              placeholder="70"
              error={errors.mvTempRef}
            />
          </Half>
          <Half>
            <NumericField
              label="Temp sensitivity"
              value={mvTempSens}
              onChangeText={(v) => {
                setMvTempSens(v);
                clearError('mvTempSens');
              }}
              suffix="fps/°F"
              placeholder="1.0"
              error={errors.mvTempSens}
            />
          </Half>
        </Row>
        <Text style={[type.secondary, styles.sectionHint]}>
          Range cards shift MV by sensitivity × (session temp − measured-at temp).
        </Text>
        <Field
          label="Assembly notes"
          value={assemblyNotes}
          onChangeText={setAssemblyNotes}
          multiline
          placeholder="Anything odd about how this batch went together…"
        />
        <Field label="Notes" value={notes} onChangeText={setNotes} multiline placeholder="Anything worth remembering about this recipe…" />
      </CollapsibleSection>

      <Text style={[type.secondary, { marginBottom: spacing.md, color: colors.textTertiary }]}>
        Editing a load that already has range history creates a new version automatically — your
        old results stay tied to the exact recipe that produced them.
      </Text>

      <Button label={submitLabel} onPress={submit} loading={submitting} />

      <BulletCatalogModal
        visible={catalogOpen}
        onClose={() => setCatalogOpen(false)}
        onSelect={applyCatalogBullet}
      />
      <ListPickerModal
        visible={powderPickerOpen}
        title="Powders"
        options={POWDER_OPTIONS}
        placeholder="Search h4350, varget, RL16…"
        footer="Product names only — enter your own worked-up charge weight. Always start from published load data and watch for pressure."
        onClose={() => setPowderPickerOpen(false)}
        onSelect={setPowderName}
      />
      <ListPickerModal
        visible={primerPickerOpen}
        title="Primers"
        options={PRIMER_OPTIONS}
        placeholder="Search CCI, 210M, magnum…"
        onClose={() => setPrimerPickerOpen(false)}
        onSelect={setPrimer}
      />
      <ListPickerModal
        visible={brassPickerOpen}
        title="Brass"
        options={BRASS_OPTIONS}
        placeholder="Search Lapua, Peterson…"
        onClose={() => setBrassPickerOpen(false)}
        onSelect={setBrass}
      />
      <ListPickerModal
        visible={sizingDiePickerOpen}
        title="Sizing Dies"
        options={SIZING_DIE_OPTIONS}
        placeholder="Search Redding, bushing, body…"
        onClose={() => setSizingDiePickerOpen(false)}
        onSelect={setSizingDie}
      />
      <ListPickerModal
        visible={seatingDiePickerOpen}
        title="Seating Dies"
        options={SEATING_DIE_OPTIONS}
        placeholder="Search Wilson, micrometer, arbor…"
        onClose={() => setSeatingDiePickerOpen(false)}
        onSelect={setSeatingDie}
      />
      <ListPickerModal
        visible={pressPickerOpen}
        title="Presses"
        options={PRESS_OPTIONS}
        placeholder="Search Co-Ax, arbor, turret…"
        onClose={() => setPressPickerOpen(false)}
        onSelect={setPressName}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  formHint: { marginBottom: spacing.lg, color: colors.textTertiary },
  sectionHint: { marginBottom: spacing.md, color: colors.textTertiary },
});
