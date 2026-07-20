import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/Buttons';
import { Chip } from '@/components/Chip';
import { CollapsibleSection, Field, Half, NumericField, Row } from '@/components/Form';
import { Screen } from '@/components/Screen';
import { activeLoadsQuery } from '@/db/repositories/loads';
import { activeRiflesQuery } from '@/db/repositories/rifles';
import { createSession } from '@/db/repositories/sessions';
import { parseDecimal } from '@/lib/parse';
import { useLastUsed } from '@/stores/lastUsedStore';
import { spacing, type } from '@/theme';

export default function NewSessionScreen() {
  const router = useRouter();
  // Deep-link entry (load detail / workup promotion) overrides last-used.
  const params = useLocalSearchParams<{ rifleId?: string; loadId?: string }>();
  const lastUsed = useLastUsed();
  const { data: rifles, updatedAt: riflesLoadedAt } = useLiveQuery(activeRiflesQuery());
  const { data: loads, updatedAt: loadsLoadedAt } = useLiveQuery(activeLoadsQuery());

  const [rifleId, setRifleId] = useState<string | null>(params.rifleId ?? lastUsed.rifleId);
  const [loadId, setLoadId] = useState<string | null>(params.loadId ?? lastUsed.loadId);
  const [location, setLocation] = useState(lastUsed.location ?? '');
  const [tempF, setTempF] = useState('');
  const [pressureInHg, setPressureInHg] = useState('');
  const [altitudeFt, setAltitudeFt] = useState('');
  const [humidityPct, setHumidityPct] = useState('');
  const [windSpeedMph, setWindSpeedMph] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const rifleLoads = useMemo(
    () => loads.filter((l) => l.rifleId === rifleId || l.rifleId === null),
    [loads, rifleId],
  );

  // Drop stale selections (archived rifle/load remembered from a previous
  // session) once the live queries have actually run.
  useEffect(() => {
    if (riflesLoadedAt && rifleId && !rifles.some((r) => r.id === rifleId)) {
      setRifleId(null);
    }
  }, [riflesLoadedAt, rifles, rifleId]);
  useEffect(() => {
    if (loadsLoadedAt && loadId && !rifleLoads.some((l) => l.id === loadId)) {
      setLoadId(null);
    }
  }, [loadsLoadedAt, rifleLoads, loadId]);

  const selectRifle = (id: string) => {
    setRifleId(id);
    // Keep the load only if it's valid for the newly selected rifle.
    const nextLoads = loads.filter((l) => l.rifleId === id || l.rifleId === null);
    if (loadId && !nextLoads.some((l) => l.id === loadId)) setLoadId(null);
  };

  const start = async () => {
    if (!rifleId) return;
    setSubmitting(true);
    try {
      // Resolve from the rifle-filtered list so a stale loadId can't attach a
      // different rifle's load to this session.
      const load = rifleLoads.find((l) => l.id === loadId);
      const session = await createSession({
        rifleId,
        loadVersionId: load?.currentVersionId ?? null,
        date: new Date(),
        location: location.trim() || null,
        tempF: parseDecimal(tempF),
        pressureInHg: parseDecimal(pressureInHg),
        altitudeFt: parseDecimal(altitudeFt),
        humidityPct: parseDecimal(humidityPct),
        windSpeedMph: parseDecimal(windSpeedMph),
        windDirClock: null,
        targetPhotoUri: null,
        notes: notes.trim() || null,
      });
      lastUsed.remember({ rifleId, loadId: load?.id ?? null, location: location.trim() || null });
      router.replace(`/range/sessions/${session.id}`);
    } catch (e) {
      Alert.alert('Could not start session', e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen underHeader>
      <Text style={[type.label, { marginBottom: spacing.xs }]}>Rifle *</Text>
      {rifles.length === 0 ? (
        <>
          <Text style={[type.secondary, { marginBottom: spacing.md }]}>
            A session needs a rifle to log DOPE against.
          </Text>
          <Button label="Add a Rifle First" onPress={() => router.push('/rifles/new')} />
        </>
      ) : (
        <View style={styles.chipWrap}>
          {rifles.map((r) => (
            <Chip
              key={r.id}
              label={r.name}
              selected={rifleId === r.id}
              onPress={() => selectRifle(r.id)}
            />
          ))}
        </View>
      )}

      <Text style={[type.label, { marginBottom: spacing.xs, marginTop: spacing.md }]}>Load</Text>
      <View style={styles.chipWrap}>
        <Chip label="None" selected={loadId === null} onPress={() => setLoadId(null)} />
        {rifleLoads.map((l) => (
          <Chip
            key={l.id}
            label={l.name}
            selected={loadId === l.id}
            onPress={() => setLoadId(l.id)}
          />
        ))}
      </View>

      <View style={{ marginTop: spacing.lg }}>
        <Field label="Location" value={location} onChangeText={setLocation} placeholder="Home range" />
      </View>

      <CollapsibleSection title="Conditions">
        <Row>
          <Half>
            <NumericField label="Temp" value={tempF} onChangeText={setTempF} suffix="°F" signed />
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

      <Button
        label="Start Session"
        onPress={start}
        disabled={!rifleId}
        loading={submitting}
        style={{ marginTop: spacing.md }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
