import * as ImagePicker from 'expo-image-picker';
import { useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/Buttons';
import { CollapsibleSection, Field, Half, NumericField, Row, Segmented } from '@/components/Form';
import { Rifle } from '@/db/schema';
import { parseDecimal } from '@/lib/parse';
import { mToYd, ydToM } from '@/lib/units';
import { colors, radii, spacing, type } from '@/theme';

// Only "name" is required — everything else is progressive disclosure.

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
};

const str = (s: string): string | null => (s.trim() === '' ? null : s.trim());

type Errors = Partial<Record<'name' | 'barrelLength' | 'sightHeight' | 'zeroDistance', string>>;

type Props = {
  initial?: Rifle;
  submitLabel: string;
  onSubmit: (values: RifleFormValues) => void | Promise<void>;
};

export function RifleForm({ initial, submitLabel, onSubmit }: Props) {
  const navigation = useNavigation();
  const [name, setName] = useState(initial?.name ?? '');
  const [make, setMake] = useState(initial?.make ?? '');
  const [model, setModel] = useState(initial?.model ?? '');
  const [cartridge, setCartridge] = useState(initial?.cartridge ?? '');
  const [barrelLength, setBarrelLength] = useState(initial?.barrelLengthIn?.toString() ?? '');
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
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);

  const dirty =
    name !== (initial?.name ?? '') ||
    make !== (initial?.make ?? '') ||
    model !== (initial?.model ?? '') ||
    cartridge !== (initial?.cartridge ?? '') ||
    barrelLength !== (initial?.barrelLengthIn?.toString() ?? '') ||
    twistRate !== (initial?.twistRate ?? '') ||
    twistDir !== (initial?.twistRight === false ? 'Left' : 'Right') ||
    scopeMake !== (initial?.scopeMake ?? '') ||
    scopeModel !== (initial?.scopeModel ?? '') ||
    sightHeight !== (initial?.sightHeightIn?.toString() ?? '1.9') ||
    turretUnit !== (initial?.turretUnit ?? 'MIL') ||
    distanceUnit !== (initial?.distanceUnit ?? 'yd') ||
    zeroDistance !== (initial?.zeroDistance?.toString() ?? '100') ||
    photoUri !== (initial?.photoUri ?? null) ||
    notes !== (initial?.notes ?? '');

  // While submitting the guard is down so the post-save navigation goes through;
  // a failed save re-arms it (submitting resets to false).
  usePreventRemove(dirty && !submitting, ({ data }) => {
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
    if (name.trim() === '') errs.name = 'Name is required — everything else is optional.';
    const barrelLengthIn = num(barrelLength, 'barrelLength');
    const sightHeightIn = num(sightHeight, 'sightHeight');
    const zeroDist = num(zeroDistance, 'zeroDistance');
    // Lower-bound safety checks (only when the field parsed to a number).
    if (zeroDist !== null && zeroDist <= 0 && !errs.zeroDistance)
      errs.zeroDistance = 'Zero distance must be greater than 0.';
    if (sightHeightIn !== null && sightHeightIn < 0 && !errs.sightHeight)
      errs.sightHeight = 'Sight height cannot be negative.';
    if (Object.values(errs).some(Boolean)) {
      setErrors(errs);
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      await onSubmit({
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
      </CollapsibleSection>

      <CollapsibleSection title="Photo & notes">
        <Pressable onPress={pickPhoto} style={styles.photoBox}>
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={styles.photo} resizeMode="cover" />
          ) : (
            <Text style={type.secondary}>Tap to add a photo</Text>
          )}
        </Pressable>
        <Field label="Notes" value={notes} onChangeText={setNotes} multiline placeholder="Trigger weight, bedding, torque specs…" />
      </CollapsibleSection>

      <Button label={submitLabel} onPress={submit} loading={submitting} style={{ marginTop: spacing.md }} />
    </View>
  );
}

const styles = StyleSheet.create({
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
