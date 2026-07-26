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
import { BRASS_OPTIONS, POWDER_OPTIONS, PRIMER_OPTIONS } from '@/data/componentCatalog';
import { parseDecimal } from '@/lib/parse';
import { BulletCatalogModal } from '@/features/loads/BulletCatalogModal';
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
    | 'mvTempSens',
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
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [powderPickerOpen, setPowderPickerOpen] = useState(false);
  const [primerPickerOpen, setPrimerPickerOpen] = useState(false);
  const [brassPickerOpen, setBrassPickerOpen] = useState(false);

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
    notes !== (initialVersion?.notes ?? '');

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
        },
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View>
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

      <CollapsibleSection title="Bullet" initiallyOpen>
        <Button
          label="Choose from Catalog"
          variant="secondary"
          onPress={() => setCatalogOpen(true)}
          style={{ marginBottom: spacing.md }}
        />
        <Row>
          <Half>
            <Field label="Make" value={bulletMake} onChangeText={setBulletMake} placeholder="Hornady" />
          </Half>
          <Half>
            <Field label="Model" value={bulletModel} onChangeText={setBulletModel} placeholder="ELD-M" />
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
              label="BC"
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
          Length + diameter enable the spin-drift estimate on range cards.
        </Text>
      </CollapsibleSection>

      <CollapsibleSection title="Velocity-banded BC (advanced)">
        <Text style={[type.secondary, styles.sectionHint]}>
          Sierra-style bands: each BC applies at or above its min velocity. Leave empty to use
          the single BC above everywhere.
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

      <CollapsibleSection title="Powder & primer" initiallyOpen>
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
          style={{ marginTop: spacing.sm }}
        />
      </CollapsibleSection>

      <CollapsibleSection title="Brass & seating">
        <Button
          label="Choose Brass"
          variant="secondary"
          onPress={() => setBrassPickerOpen(true)}
          style={{ marginBottom: spacing.md }}
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
        <Field label="Crimp" value={crimp} onChangeText={setCrimp} placeholder="None" />
      </CollapsibleSection>

      <CollapsibleSection title="Velocity & notes">
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
    </View>
  );
}

const styles = StyleSheet.create({
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  sectionHint: { marginBottom: spacing.md, color: colors.textTertiary },
});
