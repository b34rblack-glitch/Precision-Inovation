import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/Buttons';
import { Chip } from '@/components/Chip';
import { Half, NumericField, Row, Stepper } from '@/components/Form';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { loadByIdQuery, versionsForLoadQuery } from '@/db/repositories/loads';
import { activeRiflesQuery } from '@/db/repositories/rifles';
import { createWorkup } from '@/db/repositories/workups';
import { parseDecimal } from '@/lib/parse';
import { distanceToYd } from '@/lib/units';
import {
  DEFAULT_SHOTS_PER_CHARGE,
  DEFAULT_STEP_COUNT,
  generateChargeSeries,
  totalRounds,
  WorkupType,
} from '@/lib/workup/seriesGenerator';
import { colors, radii, spacing, type } from '@/theme';

const METHODS: { key: Exclude<WorkupType, 'freeform'>; title: string; blurb: string }[] = [
  {
    key: 'velocity',
    title: 'Velocity ladder',
    blurb: '5-shot strings per charge over a chrono. Find flat spots and low SD/ES. (Satterlee)',
  },
  {
    key: 'ocw',
    title: 'OCW',
    blurb: '3-shot groups per charge at 100 yd. Find the charge window where POI stays put.',
  },
  {
    key: 'ladder',
    title: 'Ladder',
    blurb: '1 shot per charge at 300+ yd. Watch for vertical clusters on the target.',
  },
];

export default function NewWorkupScreen() {
  const { id: loadId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: loadRows } = useLiveQuery(loadByIdQuery(loadId), [loadId]);
  const { data: versions } = useLiveQuery(versionsForLoadQuery(loadId), [loadId]);
  const { data: rifles } = useLiveQuery(activeRiflesQuery());
  const load = loadRows[0];

  const [method, setMethod] = useState<Exclude<WorkupType, 'freeform'>>('velocity');
  const [rifleId, setRifleId] = useState<string | null>(null);
  // null until the user touches it — seeded from the load's current recipe charge.
  const [startCharge, setStartCharge] = useState<number | null>(null);
  const [increment, setIncrement] = useState(0.3);
  const [stepCount, setStepCount] = useState(DEFAULT_STEP_COUNT.velocity);
  const [distance, setDistance] = useState('');
  const [distanceError, setDistanceError] = useState<string | undefined>();
  const [creating, setCreating] = useState(false);

  if (!load) return <Screen underHeader>{null}</Screen>;
  const effectiveRifleId = rifleId ?? load.rifleId ?? rifles[0]?.id ?? null;
  // Test distance is entered in the chosen rifle's display unit, then stored in
  // canonical yards.
  const effectiveRifle = rifles.find((r) => r.id === effectiveRifleId);
  const distanceUnit = effectiveRifle?.distanceUnit ?? 'yd';
  const currentVersion = versions.find((v) => v.id === load.currentVersionId);
  const effectiveStartCharge = startCharge ?? currentVersion?.chargeGr ?? 40;

  const series = generateChargeSeries({
    startChargeGr: effectiveStartCharge,
    incrementGr: increment,
    stepCount,
  });
  const shotsPerCharge = DEFAULT_SHOTS_PER_CHARGE[method];
  const rounds = totalRounds({
    startChargeGr: effectiveStartCharge,
    incrementGr: increment,
    stepCount,
    shotsPerCharge,
  });

  const create = async () => {
    if (!effectiveRifleId) {
      Alert.alert(
        'No rifle',
        'Add a rifle first — a workup is always shot from a specific rifle.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Add Rifle', onPress: () => router.push('/rifles/new') },
        ],
      );
      return;
    }
    const parsedDistance = parseDecimal(distance);
    if (distance.trim() !== '' && parsedDistance === null) {
      setDistanceError('Enter a number like 100');
      return;
    }
    setCreating(true);
    try {
      const workup = await createWorkup({
        rifleId: effectiveRifleId,
        loadId: load.id,
        baseVersionId: load.currentVersionId,
        type: method,
        startChargeGr: effectiveStartCharge,
        incrementGr: increment,
        stepCount,
        shotsPerCharge,
        distanceYd:
          parsedDistance != null
            ? distanceToYd(parsedDistance, distanceUnit)
            : method === 'ladder'
              ? 300
              : 100,
        notes: null,
      });
      router.replace(`/loads/${load.id}/workups/${workup.id}`);
    } catch (e) {
      Alert.alert('Save failed', e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  };

  return (
    <Screen underHeader>
      <Text style={[type.label, { marginBottom: spacing.sm }]}>Method</Text>
      <View accessibilityRole="radiogroup" accessibilityLabel="Method">
        {METHODS.map((m) => (
          <Pressable
            key={m.key}
            onPress={() => {
              setMethod(m.key);
              setStepCount(DEFAULT_STEP_COUNT[m.key]);
            }}
            accessibilityRole="radio"
            accessibilityState={{ checked: method === m.key }}
            style={[styles.method, method === m.key && styles.methodActive]}
          >
            <Text style={[type.heading, method === m.key && { color: colors.accent }]}>
              {m.title}
            </Text>
            <Text style={[type.secondary, { marginTop: 2 }]}>{m.blurb}</Text>
          </Pressable>
        ))}
      </View>

      {rifles.length > 1 ? (
        <>
          <Text style={[type.label, { marginTop: spacing.md, marginBottom: spacing.sm }]}>
            Rifle
          </Text>
          <View style={styles.chipWrap}>
            {rifles.map((r) => (
              <Chip
                key={r.id}
                label={r.name}
                selected={effectiveRifleId === r.id}
                onPress={() => setRifleId(r.id)}
              />
            ))}
          </View>
        </>
      ) : null}

      <View style={{ marginTop: spacing.lg }}>
        <Stepper
          label="Start charge"
          value={effectiveStartCharge}
          step={0.5}
          decimals={1}
          suffix="gr"
          onChange={setStartCharge}
        />
        <Stepper
          label="Increment"
          value={increment}
          step={0.1}
          decimals={1}
          suffix="gr"
          min={0.1}
          onChange={setIncrement}
        />
        <Stepper
          label="Charges"
          value={stepCount}
          step={1}
          decimals={0}
          min={2}
          onChange={(v) => setStepCount(Math.round(v))}
        />
        <Row>
          <Half>
            <NumericField
              label="Test distance"
              value={distance}
              onChangeText={(v) => {
                setDistance(v);
                setDistanceError(undefined);
              }}
              placeholder={method === 'ladder' ? '300' : '100'}
              suffix={distanceUnit}
              error={distanceError}
            />
          </Half>
          <Half>
            <View />
          </Half>
        </Row>
      </View>

      <Card>
        <Text style={type.label}>Series preview</Text>
        <Text style={[type.body, { marginTop: spacing.sm, fontVariant: ['tabular-nums'] }]}>
          {series.join(' · ')} gr
        </Text>
        <Text style={[type.secondary, { marginTop: spacing.sm }]}>
          {stepCount} charges × {shotsPerCharge} {shotsPerCharge === 1 ? 'shot' : 'shots'} ={' '}
          {rounds} rounds to load
        </Text>
        <Text style={[type.secondary, { marginTop: spacing.xs, color: colors.textTertiary }]}>
          Work up from a published start load and watch for pressure signs — this app tracks your
          data, it doesn't validate loads.
        </Text>
      </Card>

      <Button label="Create Workup" onPress={create} loading={creating} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  method: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.sm,
  },
  methodActive: { borderColor: colors.accent },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
