import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/Buttons';
import { CollapsibleSection, Field, Half, NumericField, Row, Segmented } from '@/components/Form';
import { Rifle } from '@/db/schema';
import { colors, radii, spacing, type } from '@/theme';

// Only "name" is required — everything else is progressive disclosure.

export type RifleFormValues = {
  name: string;
  make: string | null;
  model: string | null;
  cartridge: string | null;
  barrelLengthIn: number | null;
  twistRate: string | null;
  scopeMake: string | null;
  scopeModel: string | null;
  sightHeightIn: number;
  turretUnit: 'MIL' | 'MOA';
  distanceUnit: 'yd' | 'm';
  zeroDistance: number;
  photoUri: string | null;
  notes: string | null;
};

const num = (s: string): number | null => {
  const v = parseFloat(s);
  return Number.isFinite(v) ? v : null;
};
const str = (s: string): string | null => (s.trim() === '' ? null : s.trim());

type Props = {
  initial?: Rifle;
  submitLabel: string;
  onSubmit: (values: RifleFormValues) => void;
};

export function RifleForm({ initial, submitLabel, onSubmit }: Props) {
  const [name, setName] = useState(initial?.name ?? '');
  const [make, setMake] = useState(initial?.make ?? '');
  const [model, setModel] = useState(initial?.model ?? '');
  const [cartridge, setCartridge] = useState(initial?.cartridge ?? '');
  const [barrelLength, setBarrelLength] = useState(initial?.barrelLengthIn?.toString() ?? '');
  const [twistRate, setTwistRate] = useState(initial?.twistRate ?? '');
  const [scopeMake, setScopeMake] = useState(initial?.scopeMake ?? '');
  const [scopeModel, setScopeModel] = useState(initial?.scopeModel ?? '');
  const [sightHeight, setSightHeight] = useState(initial?.sightHeightIn?.toString() ?? '1.9');
  const [turretUnit, setTurretUnit] = useState<'MIL' | 'MOA'>(initial?.turretUnit ?? 'MIL');
  const [distanceUnit, setDistanceUnit] = useState<'yd' | 'm'>(initial?.distanceUnit ?? 'yd');
  const [zeroDistance, setZeroDistance] = useState(initial?.zeroDistance?.toString() ?? '100');
  const [photoUri, setPhotoUri] = useState<string | null>(initial?.photoUri ?? null);
  const [notes, setNotes] = useState(initial?.notes ?? '');

  const pickPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) setPhotoUri(result.assets[0].uri);
  };

  const submit = () => {
    if (name.trim() === '') {
      Alert.alert('Name required', 'Give this rifle a name — everything else is optional.');
      return;
    }
    onSubmit({
      name: name.trim(),
      make: str(make),
      model: str(model),
      cartridge: str(cartridge),
      barrelLengthIn: num(barrelLength),
      twistRate: str(twistRate),
      scopeMake: str(scopeMake),
      scopeModel: str(scopeModel),
      sightHeightIn: num(sightHeight) ?? 1.9,
      turretUnit,
      distanceUnit,
      zeroDistance: num(zeroDistance) ?? 100,
      photoUri,
      notes: str(notes),
    });
  };

  return (
    <View>
      <Field
        label="Name *"
        value={name}
        onChangeText={setName}
        placeholder={'e.g. "6.5 CM Match"'}
        autoFocus={!initial}
      />

      <Row>
        <Half>
          <Field label="Cartridge" value={cartridge} onChangeText={setCartridge} placeholder="6.5 Creedmoor" />
        </Half>
        <Half>
          <NumericField label="Zero distance" value={zeroDistance} onChangeText={setZeroDistance} suffix={distanceUnit} />
        </Half>
      </Row>

      <Row>
        <Half>
          <Segmented label="Turret units" options={['MIL', 'MOA'] as const} value={turretUnit} onChange={setTurretUnit} />
        </Half>
        <Half>
          <Segmented label="Distances" options={['yd', 'm'] as const} value={distanceUnit} onChange={setDistanceUnit} />
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
            <NumericField label="Barrel length" value={barrelLength} onChangeText={setBarrelLength} suffix="in" />
          </Half>
          <Half>
            <Field label="Twist rate" value={twistRate} onChangeText={setTwistRate} placeholder="1:8" />
          </Half>
        </Row>
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
        <NumericField label="Sight height over bore" value={sightHeight} onChangeText={setSightHeight} suffix="in" />
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

      <Button label={submitLabel} onPress={submit} style={{ marginTop: spacing.md }} />
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
