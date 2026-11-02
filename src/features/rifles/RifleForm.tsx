import * as ImagePicker from 'expo-image-picker';
import { useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useState } from 'react';
import { Alert, Image, Keyboard, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/Buttons';
import { CollapsibleSection, Field, Half, NumericField, Row, Segmented } from '@/components/Form';
import { Screen } from '@/components/Screen';
import { Rifle } from '@/db/schema';
import { parseDecimal } from '@/lib/parse';
import { mToYd, ydToM } from '@/lib/units';
import { colors, radii, spacing, type } from '@/theme';

// Only "name" is required — everything else is progressive disclosure.
// Sections that already hold data open on mount so nothing recorded hides.

export type RifleFormValues = {
  name: string;
  make: string | null;
  model: string | null;
  cartridge: string | null;
  barrelLengthIn: number | null;
  twistRate: string | null;
  twistRight: boolean;
  scopeMake: string | null;
  scopeModel: string | null;
  sightHeightIn: number;
  turretUnit: 'MIL' | 'MOA';
  distanceUnit: 'yd' | 'm';
  zeroDistance: number;
  photoUri: string | null;
  notes: string | null;
  // Chamber & throat
  headspaceIn: number | null;
  headspaceInsert: string | null;
  chamberSpec: string | null;
  freeboreIn: number | null;
  chamberNeckDiameterIn: number | null;
  magazineMaxCoalIn: number | null;
  // Barrel & muzzle
  barrelMaker: string | null;
  barrelContour: string | null;
  riflingType: string | null;
  barrelChamberedAt: Date | null;
  muzzleDevice: string | null;
  muzzleDeviceNotes: string | null;
  roundCountBaseline: number | null;
  // Action & trigger
  actionMake: string | null;
  actionModel: string | null;
  boltFace: string | null;
  stock: string | null;
  triggerMake: string | null;
  triggerPullLb: number | null;
  rifleWeightLb: number | null;
  // Optic detail
  reticle: string | null;
  focalPlane: 'FFP' | 'SFP' | null;
  clickValue: number | null;
  turretTravelPerRev: number | null;
  zeroStop: boolean;
  railCantMoa: number | null;
  ringHeightIn: number | null;
};

const str = (s: string): string | null => (s.trim() === '' ? null : s.trim());
const numStr = (n: number | null | undefined) => n?.toString() ?? '';

/** YYYY-MM-DD for the chambered-date field; local calendar day. */
const dateStr = (d: Date | null | undefined) =>
  d
    ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    : '';
function parseDateStr(s: string): Date | null | undefined {
  const t = s.trim();
  if (t === '') return null;
  const m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!m) return undefined;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

const FOCAL_CHOICES = ['—', 'FFP', 'SFP'] as const;
type FocalChoice = (typeof FOCAL_CHOICES)[number];
const YES_NO = ['Yes', 'No'] as const;

type Errors = Partial<
  Record<
    | 'name'
    | 'barrelLength'
    | 'sightHeight'
    | 'zeroDistance'
    | 'headspace'
    | 'freebore'
    | 'neckDiameter'
    | 'magazineMaxCoal'
    | 'chamberedAt'
    | 'roundCountBaseline'
    | 'triggerPull'
    | 'rifleWeight'
    | 'clickValue'
    | 'turretTravel'
    | 'railCant'
    | 'ringHeight',
    string
  >
>;

export type AfterSave = () => void;

type Props = {
  initial?: Rifle;
  submitLabel: string;
  /**
   * Persists the rifle. A rejection is shown as "Save failed". The returned
   * function, if any, leaves the screen; the form runs it on the next tick
   * after dropping its unsaved-changes guard.
   */
  onSubmit: (values: RifleFormValues) => void | AfterSave | Promise<void | AfterSave>;
};

/** Renders its own Screen so the save button sits in the pinned footer. */
export function RifleForm({ initial, submitLabel, onSubmit }: Props) {
  const navigation = useNavigation();
  const [name, setName] = useState(initial?.name ?? '');
  const [make, setMake] = useState(initial?.make ?? '');
  const [model, setModel] = useState(initial?.model ?? '');
  const [cartridge, setCartridge] = useState(initial?.cartridge ?? '');
  const [barrelLength, setBarrelLength] = useState(numStr(initial?.barrelLengthIn));
  const [twistRate, setTwistRate] = useState(initial?.twistRate ?? '');
  const [twistDir, setTwistDir] = useState<'Right' | 'Left'>(
    initial?.twistRight === false ? 'Left' : 'Right',
  );
  const [scopeMake, setScopeMake] = useState(initial?.scopeMake ?? '');
  const [scopeModel, setScopeModel] = useState(initial?.scopeModel ?? '');
  const [sightHeight, setSightHeight] = useState(initial?.sightHeightIn?.toString() ?? '1.9');
  const [turretUnit, setTurretUnit] = useState<'MIL' | 'MOA'>(initial?.turretUnit ?? 'MIL');
  const [distanceUnit, setDistanceUnit] = useState<'yd' | 'm'>(initial?.distanceUnit ?? 'yd');
  const [zeroDistance, setZeroDistance] = useState(initial?.zeroDistance?.toString() ?? '100');
  const [photoUri, setPhotoUri] = useState<string | null>(initial?.photoUri ?? null);
  const [notes, setNotes] = useState(initial?.notes ?? '');

  // Chamber & throat
  const [headspace, setHeadspace] = useState(numStr(initial?.headspaceIn));
  const [headspaceInsert, setHeadspaceInsert] = useState(initial?.headspaceInsert ?? '');
  const [chamberSpec, setChamberSpec] = useState(initial?.chamberSpec ?? '');
  const [freebore, setFreebore] = useState(numStr(initial?.freeboreIn));
  const [neckDiameter, setNeckDiameter] = useState(numStr(initial?.chamberNeckDiameterIn));
  const [magazineMaxCoal, setMagazineMaxCoal] = useState(numStr(initial?.magazineMaxCoalIn));

  // Barrel & muzzle
  const [barrelMaker, setBarrelMaker] = useState(initial?.barrelMaker ?? '');
  const [barrelContour, setBarrelContour] = useState(initial?.barrelContour ?? '');
  const [riflingType, setRiflingType] = useState(initial?.riflingType ?? '');
  const [chamberedAt, setChamberedAt] = useState(dateStr(initial?.barrelChamberedAt));
  const [muzzleDevice, setMuzzleDevice] = useState(initial?.muzzleDevice ?? '');
  const [muzzleDeviceNotes, setMuzzleDeviceNotes] = useState(initial?.muzzleDeviceNotes ?? '');
  const [roundCountBaseline, setRoundCountBaseline] = useState(numStr(initial?.roundCountBaseline));

  // Action & trigger
  const [actionMake, setActionMake] = useState(initial?.actionMake ?? '');
  const [actionModel, setActionModel] = useState(initial?.actionModel ?? '');
  const [boltFace, setBoltFace] = useState(initial?.boltFace ?? '');
  const [stock, setStock] = useState(initial?.stock ?? '');
  const [triggerMake, setTriggerMake] = useState(initial?.triggerMake ?? '');
  const [triggerPull, setTriggerPull] = useState(numStr(initial?.triggerPullLb));
  const [rifleWeight, setRifleWeight] = useState(numStr(initial?.rifleWeightLb));

  // Optic detail
  const [reticle, setReticle] = useState(initial?.reticle ?? '');
  const [focalPlane, setFocalPlane] = useState<FocalChoice>(initial?.focalPlane ?? '—');
  const [clickValue, setClickValue] = useState(numStr(initial?.clickValue));
  const [turretTravel, setTurretTravel] = useState(numStr(initial?.turretTravelPerRev));
  const [zeroStop, setZeroStop] = useState<'Yes' | 'No'>(initial?.zeroStop ? 'Yes' : 'No');
  const [railCant, setRailCant] = useState(numStr(initial?.railCantMoa));
  const [ringHeight, setRingHeight] = useState(numStr(initial?.ringHeightIn));

  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);

  const [chamberFilled] = useState(
    () =>
      initial != null &&
      [initial.headspaceIn, initial.headspaceInsert, initial.chamberSpec, initial.freeboreIn, initial.chamberNeckDiameterIn, initial.magazineMaxCoalIn].some(
        (v) => v != null,
      ),
  );
  const [barrelFilled] = useState(
    () =>
      initial != null &&
      [initial.barrelMaker, initial.barrelContour, initial.riflingType, initial.barrelChamberedAt, initial.muzzleDevice, initial.muzzleDeviceNotes, initial.roundCountBaseline].some(
        (v) => v != null,
      ),
  );
  const [actionFilled] = useState(
    () =>
      initial != null &&
      [initial.actionMake, initial.actionModel, initial.boltFace, initial.stock, initial.triggerMake, initial.triggerPullLb, initial.rifleWeightLb].some(
        (v) => v != null,
      ),
  );

  const dirty =
    name !== (initial?.name ?? '') ||
    make !== (initial?.make ?? '') ||
    model !== (initial?.model ?? '') ||
    cartridge !== (initial?.cartridge ?? '') ||
    barrelLength !== numStr(initial?.barrelLengthIn) ||
    twistRate !== (initial?.twistRate ?? '') ||
    twistDir !== (initial?.twistRight === false ? 'Left' : 'Right') ||
    scopeMake !== (initial?.scopeMake ?? '') ||
    scopeModel !== (initial?.scopeModel ?? '') ||
    sightHeight !== (initial?.sightHeightIn?.toString() ?? '1.9') ||
    turretUnit !== (initial?.turretUnit ?? 'MIL') ||
    distanceUnit !== (initial?.distanceUnit ?? 'yd') ||
    zeroDistance !== (initial?.zeroDistance?.toString() ?? '100') ||
    photoUri !== (initial?.photoUri ?? null) ||
    notes !== (initial?.notes ?? '') ||
    headspace !== numStr(initial?.headspaceIn) ||
    headspaceInsert !== (initial?.headspaceInsert ?? '') ||
    chamberSpec !== (initial?.chamberSpec ?? '') ||
    freebore !== numStr(initial?.freeboreIn) ||
    neckDiameter !== numStr(initial?.chamberNeckDiameterIn) ||
    magazineMaxCoal !== numStr(initial?.magazineMaxCoalIn) ||
    barrelMaker !== (initial?.barrelMaker ?? '') ||
    barrelContour !== (initial?.barrelContour ?? '') ||
    riflingType !== (initial?.riflingType ?? '') ||
    chamberedAt !== dateStr(initial?.barrelChamberedAt) ||
    muzzleDevice !== (initial?.muzzleDevice ?? '') ||
    muzzleDeviceNotes !== (initial?.muzzleDeviceNotes ?? '') ||
    roundCountBaseline !== numStr(initial?.roundCountBaseline) ||
    actionMake !== (initial?.actionMake ?? '') ||
    actionModel !== (initial?.actionModel ?? '') ||
    boltFace !== (initial?.boltFace ?? '') ||
    stock !== (initial?.stock ?? '') ||
    triggerMake !== (initial?.triggerMake ?? '') ||
    triggerPull !== numStr(initial?.triggerPullLb) ||
    rifleWeight !== numStr(initial?.rifleWeightLb) ||
    reticle !== (initial?.reticle ?? '') ||
    focalPlane !== (initial?.focalPlane ?? '—') ||
    clickValue !== numStr(initial?.clickValue) ||
    turretTravel !== numStr(initial?.turretTravelPerRev) ||
    zeroStop !== (initial?.zeroStop ? 'Yes' : 'No') ||
    railCant !== numStr(initial?.railCantMoa) ||
    ringHeight !== numStr(initial?.ringHeightIn);

  // While submitting the guard is down so the post-save navigation goes through;
  // a failed save re-arms it (submitting resets to false, saved stays false).
  usePreventRemove(dirty && !submitting && !saved, ({ data }) => {
    Alert.alert('Discard changes?', 'You have unsaved edits on this rifle.', [
      { text: 'Keep Editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => navigation.dispatch(data.action) },
    ]);
  });

  const clearError = (key: keyof Errors) =>
    setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));

  const pickPhoto = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.7,
      });
      if (!result.canceled && result.assets[0]) setPhotoUri(result.assets[0].uri);
    } catch (e) {
      Alert.alert('Could not open photos', e instanceof Error ? e.message : String(e));
    }
  };

  const submit = async () => {
    const errs: Errors = {};
    // Non-empty but unparseable numbers block submit; empty falls back to defaults.
    const num = (value: string, key: keyof Errors): number | null => {
      if (value.trim() === '') return null;
      const n = parseDecimal(value);
      if (n === null) errs[key] = 'Enter a number like 41.5';
      return n;
    };
    const numPos = (value: string, key: keyof Errors, label: string): number | null => {
      const n = num(value, key);
      if (n !== null && n <= 0 && !errs[key]) errs[key] = `${label} must be greater than 0.`;
      return n;
    };
    const numNonNeg = (value: string, key: keyof Errors, label: string): number | null => {
      const n = num(value, key);
      if (n !== null && n < 0 && !errs[key]) errs[key] = `${label} can't be negative.`;
      return n;
    };
    if (name.trim() === '') errs.name = 'Name is required — everything else is optional.';
    const barrelLengthIn = num(barrelLength, 'barrelLength');
    const sightHeightIn = num(sightHeight, 'sightHeight');
    const zeroDist = num(zeroDistance, 'zeroDistance');
    if (zeroDist !== null && zeroDist <= 0 && !errs.zeroDistance)
      errs.zeroDistance = 'Zero distance must be greater than 0.';
    if (sightHeightIn !== null && sightHeightIn < 0 && !errs.sightHeight)
      errs.sightHeight = 'Sight height cannot be negative.';
    const headspaceIn = numPos(headspace, 'headspace', 'Headspace');
    const freeboreIn = numNonNeg(freebore, 'freebore', 'Freebore');
    const chamberNeckDiameterIn = numPos(neckDiameter, 'neckDiameter', 'Neck diameter');
    const magazineMaxCoalIn = numPos(magazineMaxCoal, 'magazineMaxCoal', 'Magazine length');
    const barrelChamberedAt = parseDateStr(chamberedAt);
    if (barrelChamberedAt === undefined) errs.chamberedAt = 'Enter a date like 2026-03-15';
    const baseline = numNonNeg(roundCountBaseline, 'roundCountBaseline', 'Round count');
    const triggerPullLb = numPos(triggerPull, 'triggerPull', 'Trigger pull');
    const rifleWeightLb = numPos(rifleWeight, 'rifleWeight', 'Weight');
    const click = numPos(clickValue, 'clickValue', 'Click value');
    const turretTravelPerRev = numPos(turretTravel, 'turretTravel', 'Travel per revolution');
    const railCantMoa = numNonNeg(railCant, 'railCant', 'Rail cant');
    const ringHeightIn = numPos(ringHeight, 'ringHeight', 'Ring height');
    if (Object.values(errs).some(Boolean)) {
      setErrors(errs);
      return;
    }
    setErrors({});
    Keyboard.dismiss();
    setSubmitting(true);
    try {
      const after = await onSubmit({
        name: name.trim(),
        make: str(make),
        model: str(model),
        cartridge: str(cartridge),
        barrelLengthIn,
        twistRate: str(twistRate),
        twistRight: twistDir === 'Right',
        scopeMake: str(scopeMake),
        scopeModel: str(scopeModel),
        sightHeightIn: sightHeightIn ?? 1.9,
        turretUnit,
        distanceUnit,
        zeroDistance: zeroDist ?? 100,
        photoUri,
        notes: str(notes),
        headspaceIn,
        headspaceInsert: str(headspaceInsert),
        chamberSpec: str(chamberSpec),
        freeboreIn,
        chamberNeckDiameterIn,
        magazineMaxCoalIn,
        barrelMaker: str(barrelMaker),
        barrelContour: str(barrelContour),
        riflingType: str(riflingType),
        barrelChamberedAt: barrelChamberedAt ?? null,
        muzzleDevice: str(muzzleDevice),
        muzzleDeviceNotes: str(muzzleDeviceNotes),
        roundCountBaseline: baseline != null ? Math.round(baseline) : null,
        actionMake: str(actionMake),
        actionModel: str(actionModel),
        boltFace: str(boltFace),
        stock: str(stock),
        triggerMake: str(triggerMake),
        triggerPullLb,
        rifleWeightLb,
        reticle: str(reticle),
        focalPlane: focalPlane === '—' ? null : focalPlane,
        clickValue: click,
        turretTravelPerRev,
        zeroStop: zeroStop === 'Yes',
        railCantMoa,
        ringHeightIn,
      });
      setSaved(true);
      if (after) setTimeout(after, 0);
    } catch (e) {
      Alert.alert('Save failed', e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const numericField = (
    label: string,
    value: string,
    set: (v: string) => void,
    key: keyof Errors,
    suffix?: string,
    placeholder?: string,
  ) => (
    <NumericField
      label={label}
      value={value}
      onChangeText={(v) => {
        set(v);
        clearError(key);
      }}
      suffix={suffix}
      placeholder={placeholder}
      error={errors[key]}
    />
  );

  return (
    <Screen underHeader footer={<Button label={submitLabel} onPress={submit} loading={submitting} />}>
      <Field
        label="Name *"
        value={name}
        onChangeText={(v) => {
          setName(v);
          clearError('name');
        }}
        placeholder={'e.g. "6.5 CM Match"'}
        autoFocus={!initial}
        error={errors.name}
      />

      <Row>
        <Half>
          <Field label="Cartridge" value={cartridge} onChangeText={setCartridge} placeholder="6.5 Creedmoor" />
        </Half>
        <Half>
          <NumericField
            label="Zero distance"
            value={zeroDistance}
            onChangeText={(v) => {
              setZeroDistance(v);
              clearError('zeroDistance');
            }}
            suffix={distanceUnit}
            error={errors.zeroDistance}
          />
        </Half>
      </Row>

      <Row>
        <Half>
          <Segmented label="Turret units" options={['MIL', 'MOA'] as const} value={turretUnit} onChange={setTurretUnit} />
        </Half>
        <Half>
          <Segmented
            label="Distances"
            options={['yd', 'm'] as const}
            value={distanceUnit}
            onChange={(next) => {
              // zeroDistance is stored in the display unit — convert the field so
              // toggling yd/m preserves the physical zero (100 yd -> 91 m).
              if (next !== distanceUnit) {
                const current = parseDecimal(zeroDistance);
                if (current !== null) {
                  const converted = next === 'm' ? ydToM(current) : mToYd(current);
                  setZeroDistance(String(Math.round(converted)));
                  clearError('zeroDistance');
                }
              }
              setDistanceUnit(next);
            }}
          />
        </Half>
      </Row>

      <CollapsibleSection title="Rifle details">
        <Row>
          <Half>
            <Field label="Make" value={make} onChangeText={setMake} placeholder="Tikka" />
          </Half>
          <Half>
            <Field label="Model" value={model} onChangeText={setModel} placeholder="T3x CTR" />
          </Half>
        </Row>
        <Row>
          <Half>
            <NumericField
              label="Barrel length"
              value={barrelLength}
              onChangeText={(v) => {
                setBarrelLength(v);
                clearError('barrelLength');
              }}
              suffix="in"
              error={errors.barrelLength}
            />
          </Half>
          <Half>
            <Field label="Twist rate" value={twistRate} onChangeText={setTwistRate} placeholder="1:8" />
          </Half>
        </Row>
        <Segmented
          label="Twist direction"
          options={['Right', 'Left'] as const}
          value={twistDir}
          onChange={setTwistDir}
        />
        <Text style={type.secondary}>
          Spin drift and aerodynamic jump push the opposite way out of a left-hand barrel. Nearly
          all factory barrels are right-hand — leave this alone unless you know otherwise.
        </Text>
      </CollapsibleSection>

      <CollapsibleSection title="Chamber & throat" initiallyOpen={chamberFilled}>
        <Text style={[type.secondary, styles.hint]}>
          Headspace is a comparator reading on a fired case; the load form checks each load's
          shoulder bump against it. Magazine length flags loads seated too long to feed. Distance to
          the lands is logged per bullet on the rifle's detail screen.
        </Text>
        <Row>
          <Half>{numericField('Headspace (fired)', headspace, setHeadspace, 'headspace', 'in', '1.6185')}</Half>
          <Half>
            <Field label="Comparator insert" value={headspaceInsert} onChangeText={setHeadspaceInsert} placeholder="Hornady .420" />
          </Half>
        </Row>
        <Field label="Chamber / reamer" value={chamberSpec} onChangeText={setChamberSpec} placeholder="SAAMI, match, or reamer name" autoCapitalize="words" />
        <Row>
          <Half>{numericField('Freebore', freebore, setFreebore, 'freebore', 'in', '0.300')}</Half>
          <Half>{numericField('Chamber neck dia.', neckDiameter, setNeckDiameter, 'neckDiameter', 'in', '0.343')}</Half>
        </Row>
        {numericField('Magazine max COAL', magazineMaxCoal, setMagazineMaxCoal, 'magazineMaxCoal', 'in', '3.700')}
      </CollapsibleSection>

      <CollapsibleSection title="Barrel & muzzle" initiallyOpen={barrelFilled}>
        <Row>
          <Half>
            <Field label="Barrel maker" value={barrelMaker} onChangeText={setBarrelMaker} placeholder="Bartlein" autoCapitalize="words" />
          </Half>
          <Half>
            <Field label="Contour" value={barrelContour} onChangeText={setBarrelContour} placeholder="M24, Sendero…" />
          </Half>
        </Row>
        <Row>
          <Half>
            <Field label="Rifling" value={riflingType} onChangeText={setRiflingType} placeholder="Cut, button, 5R…" />
          </Half>
          <Half>
            <Field
              label="Chambered on"
              value={chamberedAt}
              onChangeText={(v) => {
                setChamberedAt(v);
                clearError('chamberedAt');
              }}
              placeholder="2026-03-15"
              keyboardType="numbers-and-punctuation"
              error={errors.chamberedAt}
            />
          </Half>
        </Row>
        <Field label="Muzzle device" value={muzzleDevice} onChangeText={setMuzzleDevice} placeholder="Bare, brake, suppressor…" />
        <Field
          label="Muzzle device notes"
          value={muzzleDeviceNotes}
          onChangeText={setMuzzleDeviceNotes}
          multiline
          placeholder="POI shift with the can on, velocity change…"
        />
        {numericField('Rounds fired before this app', roundCountBaseline, setRoundCountBaseline, 'roundCountBaseline', 'rds', '0')}
        <Text style={type.secondary}>
          The round count on the detail screen is this number plus every chronograph string's shot
          count logged for this rifle. Shots fired without a chronograph are not counted; add them
          here.
        </Text>
      </CollapsibleSection>

      <CollapsibleSection title="Action & trigger" initiallyOpen={actionFilled}>
        <Row>
          <Half>
            <Field label="Action make" value={actionMake} onChangeText={setActionMake} placeholder="Defiance" autoCapitalize="words" />
          </Half>
          <Half>
            <Field label="Action model" value={actionModel} onChangeText={setActionModel} placeholder="Deviant" autoCapitalize="words" />
          </Half>
        </Row>
        <Row>
          <Half>
            <Field label="Bolt face" value={boltFace} onChangeText={setBoltFace} placeholder="Magnum .540" />
          </Half>
          <Half>
            <Field label="Stock / chassis" value={stock} onChangeText={setStock} placeholder="MDT ACC" autoCapitalize="words" />
          </Half>
        </Row>
        <Row>
          <Half>
            <Field label="Trigger" value={triggerMake} onChangeText={setTriggerMake} placeholder="TriggerTech Diamond" autoCapitalize="words" />
          </Half>
          <Half>{numericField('Pull weight', triggerPull, setTriggerPull, 'triggerPull', 'lb', '1.5')}</Half>
        </Row>
        {numericField('Rifle weight (as shot)', rifleWeight, setRifleWeight, 'rifleWeight', 'lb', '14.2')}
      </CollapsibleSection>

      <CollapsibleSection title="Optic">
        <Row>
          <Half>
            <Field label="Scope make" value={scopeMake} onChangeText={setScopeMake} placeholder="Vortex" />
          </Half>
          <Half>
            <Field label="Scope model" value={scopeModel} onChangeText={setScopeModel} placeholder="Razor LHT" />
          </Half>
        </Row>
        <NumericField
          label="Sight height over bore"
          value={sightHeight}
          onChangeText={(v) => {
            setSightHeight(v);
            clearError('sightHeight');
          }}
          suffix="in"
          error={errors.sightHeight}
        />
        <Row>
          <Half>
            <Field label="Reticle" value={reticle} onChangeText={setReticle} placeholder="EBR-7C, TMR, H59…" />
          </Half>
          <Half>
            <Segmented label="Focal plane" options={FOCAL_CHOICES} value={focalPlane} onChange={setFocalPlane} />
          </Half>
        </Row>
        <Row>
          <Half>{numericField('Click value', clickValue, setClickValue, 'clickValue', turretUnit, turretUnit === 'MIL' ? '0.1' : '0.25')}</Half>
          <Half>{numericField('Travel per rev', turretTravel, setTurretTravel, 'turretTravel', turretUnit, turretUnit === 'MIL' ? '10' : '25')}</Half>
        </Row>
        <Text style={[type.secondary, styles.hint]}>
          With a click value set, range cards and field mode snap every hold to the nearest click.
        </Text>
        <Row>
          <Half>
            <Segmented label="Zero stop" options={YES_NO} value={zeroStop} onChange={setZeroStop} />
          </Half>
          <Half>{numericField('Rail cant', railCant, setRailCant, 'railCant', 'MOA', '20')}</Half>
        </Row>
        {numericField('Ring height', ringHeight, setRingHeight, 'ringHeight', 'in', '1.06')}
      </CollapsibleSection>

      <CollapsibleSection title="Photo & notes">
        <Pressable onPress={pickPhoto} style={styles.photoBox}>
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={styles.photo} resizeMode="cover" />
          ) : (
            <Text style={type.secondary}>Tap to add a photo</Text>
          )}
        </Pressable>
        <Field label="Notes" value={notes} onChangeText={setNotes} multiline placeholder="Bedding, torque specs…" />
      </CollapsibleSection>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hint: { marginBottom: spacing.md, color: colors.textTertiary },
  photoBox: {
    height: 160,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
    overflow: 'hidden',
  },
  photo: { width: '100%', height: '100%' },
});
