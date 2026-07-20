import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/Buttons';
import { CollapsibleSection, Field, Half, NumericField, Row } from '@/components/Form';
import { Screen } from '@/components/Screen';
import { activeLoadsQuery } from '@/db/repositories/loads';
import { activeRiflesQuery } from '@/db/repositories/rifles';
import { createSession } from '@/db/repositories/sessions';
import { useLastUsed } from '@/stores/lastUsedStore';
import { colors, radii, spacing, touchTarget, type } from '@/theme';

const num = (s: string): number | null => {
  const v = parseFloat(s);
  return Number.isFinite(v) ? v : null;
};

export default function NewSessionScreen() {
  const router = useRouter();
  const lastUsed = useLastUsed();
  const { data: rifles } = useLiveQuery(activeRiflesQuery());
  const { data: loads } = useLiveQuery(activeLoadsQuery());

  const [rifleId, setRifleId] = useState<string | null>(lastUsed.rifleId);
  const [loadId, setLoadId] = useState<string | null>(lastUsed.loadId);
  const [location, setLocation] = useState(lastUsed.location ?? '');
  const [tempF, setTempF] = useState('');
  const [pressureInHg, setPressureInHg] = useState('');
  const [altitudeFt, setAltitudeFt] = useState('');
  const [humidityPct, setHumidityPct] = useState('');
  const [windSpeedMph, setWindSpeedMph] = useState('');
  const [notes, setNotes] = useState('');

  const rifleLoads = useMemo(
    () => loads.filter((l) => l.rifleId === rifleId || l.rifleId === null),
    [loads, rifleId],
  );

  const start = async () => {
    if (!rifleId) {
      Alert.alert('Pick a rifle', 'A session needs a rifle. The load is optional but recommended.');
      return;
    }
    const load = loads.find((l) => l.id === loadId);
    const session = await createSession({
      rifleId,
      loadVersionId: load?.currentVersionId ?? null,
      date: new Date(),
      location: location.trim() || null,
      tempF: num(tempF),
      pressureInHg: num(pressureInHg),
      altitudeFt: num(altitudeFt),
      humidityPct: num(humidityPct),
      windSpeedMph: num(windSpeedMph),
      windDirClock: null,
      targetPhotoUri: null,
      notes: notes.trim() || null,
    });
    lastUsed.remember({ rifleId, loadId, location: location.trim() || null });
    router.replace(`/range/sessions/${session.id}`);
  };

  return (
    <Screen>
      <Text style={[type.label, { marginBottom: spacing.xs }]}>Rifle *</Text>
      <View style={styles.chipWrap}>
        {rifles.map((r) => (
          <Pressable
            key={r.id}
            onPress={() => setRifleId(r.id)}
            style={[styles.chip, rifleId === r.id && styles.chipActive]}
          >
            <Text style={[styles.chipLabel, rifleId === r.id && styles.chipLabelActive]}>
              {r.name}
            </Text>
          </Pressable>
        ))}
        {rifles.length === 0 ? (
          <Text style={type.secondary}>No rifles yet — add one in the Rifles tab first.</Text>
        ) : null}
      </View>

      <Text style={[type.label, { marginBottom: spacing.xs, marginTop: spacing.md }]}>Load</Text>
      <View style={styles.chipWrap}>
        <Pressable
          onPress={() => setLoadId(null)}
          style={[styles.chip, loadId === null && styles.chipActive]}
        >
          <Text style={[styles.chipLabel, loadId === null && styles.chipLabelActive]}>None</Text>
        </Pressable>
        {rifleLoads.map((l) => (
          <Pressable
            key={l.id}
            onPress={() => setLoadId(l.id)}
            style={[styles.chip, loadId === l.id && styles.chipActive]}
          >
            <Text style={[styles.chipLabel, loadId === l.id && styles.chipLabelActive]}>
              {l.name}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={{ marginTop: spacing.lg }}>
        <Field label="Location" value={location} onChangeText={setLocation} placeholder="Home range" />
      </View>

      <CollapsibleSection title="Conditions">
        <Row>
          <Half>
            <NumericField label="Temp" value={tempF} onChangeText={setTempF} suffix="°F" />
          </Half>
          <Half>
            <NumericField label="Wind" value={windSpeedMph} onChangeText={setWindSpeedMph} suffix="mph" />
          </Half>
        </Row>
        <Row>
          <Half>
            <NumericField label="Pressure" value={pressureInHg} onChangeText={setPressureInHg} suffix="inHg" />
          </Half>
          <Half>
            <NumericField label="Altitude" value={altitudeFt} onChangeText={setAltitudeFt} suffix="ft" />
          </Half>
        </Row>
        <NumericField label="Humidity" value={humidityPct} onChangeText={setHumidityPct} suffix="%" />
        <Field label="Notes" value={notes} onChangeText={setNotes} multiline />
      </CollapsibleSection>

      <Button label="Start Session" onPress={start} style={{ marginTop: spacing.md }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    minHeight: touchTarget - 8,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipLabel: { color: colors.text, fontSize: 15, fontWeight: '600' },
  chipLabelActive: { color: colors.onAccent },
});
