import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/Buttons';
import { Half, NumericField, Row, Stepper } from '@/components/Form';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { loadByIdQuery } from '@/db/repositories/loads';
import { activeRiflesQuery } from '@/db/repositories/rifles';
import { createWorkup } from '@/db/repositories/workups';
import {
  DEFAULT_SHOTS_PER_CHARGE,
  DEFAULT_STEP_COUNT,
  generateChargeSeries,
  totalRounds,
  WorkupType,
} from '@/lib/workup/seriesGenerator';
import { colors, radii, spacing, touchTarget, type } from '@/theme';

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
  const { data: rifles } = useLiveQuery(activeRiflesQuery());
  const load = loadRows[0];

  const [method, setMethod] = useState<Exclude<WorkupType, 'freeform'>>('velocity');
  const [rifleId, setRifleId] = useState<string | null>(null);
  const [startCharge, setStartCharge] = useState(40.0);
  const [increment, setIncrement] = useState(0.3);
  const [stepCount, setStepCount] = useState(DEFAULT_STEP_COUNT.velocity);
  const [distance, setDistance] = useState('');

  if (!load) return <Screen>{null}</Screen>;
  const effectiveRifleId = rifleId ?? load.rifleId ?? rifles[0]?.id ?? null;

  const series = generateChargeSeries({ startChargeGr: startCharge, incrementGr: increment, stepCount });
  const shotsPerCharge = DEFAULT_SHOTS_PER_CHARGE[method];
  const rounds = totalRounds({
    startChargeGr: startCharge,
    incrementGr: increment,
    stepCount,
    shotsPerCharge,
  });

  const create = async () => {
    if (!effectiveRifleId) {
      Alert.alert('No rifle', 'Add a rifle first — a workup is always shot from a specific rifle.');
      return;
    }
    const workup = await createWorkup({
      rifleId: effectiveRifleId,
      loadId: load.id,
      baseVersionId: load.currentVersionId,
      type: method,
      startChargeGr: startCharge,
      incrementGr: increment,
      stepCount,
      shotsPerCharge,
      distanceYd: parseFloat(distance) || (method === 'ladder' ? 300 : 100),
      notes: null,
    });
    router.replace(`/loads/${load.id}/workups/${workup.id}`);
  };

  return (
    <Screen>
      <Text style={[type.label, { marginBottom: spacing.sm }]}>Method</Text>
      {METHODS.map((m) => (
        <Pressable
          key={m.key}
          onPress={() => {
            setMethod(m.key);
            setStepCount(DEFAULT_STEP_COUNT[m.key]);
          }}
          style={[styles.method, method === m.key && styles.methodActive]}
        >
          <Text style={[type.heading, method === m.key && { color: colors.accent }]}>
            {m.title}
          </Text>
          <Text style={[type.secondary, { marginTop: 2 }]}>{m.blurb}</Text>
        </Pressable>
      ))}

      {rifles.length > 1 ? (
        <>
          <Text style={[type.label, { marginTop: spacing.md, marginBottom: spacing.sm }]}>
            Rifle
          </Text>
          <View style={styles.chipWrap}>
            {rifles.map((r) => (
              <Pressable
                key={r.id}
                onPress={() => setRifleId(r.id)}
                style={[styles.chip, effectiveRifleId === r.id && styles.chipActive]}
              >
                <Text
                  style={[styles.chipLabel, effectiveRifleId === r.id && styles.chipLabelActive]}
                >
                  {r.name}
                </Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : null}

      <View style={{ marginTop: spacing.lg }}>
        <Stepper
          label="Start charge"
          value={startCharge}
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
              onChangeText={setDistance}
              placeholder={method === 'ladder' ? '300' : '100'}
              suffix="yd"
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

      <Button label="Create Workup" onPress={create} />
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
