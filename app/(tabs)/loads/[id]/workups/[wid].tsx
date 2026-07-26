import Ionicons from '@expo/vector-icons/Ionicons';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Circle, Line, Polyline, Text as SvgText } from 'react-native-svg';
import { Button } from '@/components/Buttons';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { Half, NumericField, Row } from '@/components/Form';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { rifleByIdQuery } from '@/db/repositories/rifles';
import { addShotString, deleteShotString } from '@/db/repositories/sessions';
import {
  archiveWorkup,
  promoteChargeToVersion,
  stepsForWorkupQuery,
  stringsForStepsQuery,
  updateStepResult,
  updateWorkupStatus,
  workupByIdQuery,
} from '@/db/repositories/workups';
import { WorkupStep } from '@/db/schema';
import { parseDecimal, parseVelocityList } from '@/lib/parse';
import { ydToDistance } from '@/lib/units';
import { ChargePoint, findFlatSpots } from '@/lib/workup/stats';
import { colors, radii, spacing, touchTarget, type } from '@/theme';

const TITLES: Record<string, string> = {
  ladder: 'Ladder Test',
  ocw: 'OCW Test',
  velocity: 'Velocity Ladder',
  freeform: 'Workup',
};

const saveFailed = (e: unknown) =>
  Alert.alert('Save failed', e instanceof Error ? e.message : String(e));

function StepCard({
  step,
  showGroup,
  summary,
  onSaveVelocities,
  onSaveResult,
  onClearString,
}: {
  step: WorkupStep;
  showGroup: boolean;
  summary: { avgFps: number | null; sdFps: number | null; esFps: number | null; shotCount: number | null } | null;
  onSaveVelocities: (velocities: number[]) => Promise<void>;
  onSaveResult: (result: {
    groupSizeIn: number | null;
    poiXIn: number | null;
    poiYIn: number | null;
  }) => Promise<void>;
  onClearString: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [velText, setVelText] = useState('');
  const [velError, setVelError] = useState<string | undefined>();
  const [groupText, setGroupText] = useState(step.groupSizeIn?.toString() ?? '');
  const [groupError, setGroupError] = useState<string | undefined>();
  // POI up (Y) / right (X) in inches; signed values allowed.
  const [poiYText, setPoiYText] = useState(step.poiYIn?.toString() ?? '');
  const [poiXText, setPoiXText] = useState(step.poiXIn?.toString() ?? '');
  const [poiError, setPoiError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  const parsedVelocities = useMemo(
    () => (velText.trim() ? parseVelocityList(velText) : []),
    [velText],
  );

  const save = async () => {
    // Validate everything before saving anything.
    if (velText.trim() !== '' && parsedVelocities.length === 0) {
      setVelError("Couldn't read any velocities");
      return;
    }
    const groupSize = parseDecimal(groupText);
    if (showGroup && groupText.trim() !== '' && groupSize === null) {
      setGroupError('Enter a number like 0.75');
      return;
    }
    const poiY = parseDecimal(poiYText);
    const poiX = parseDecimal(poiXText);
    if (
      showGroup &&
      ((poiYText.trim() !== '' && poiY === null) || (poiXText.trim() !== '' && poiX === null))
    ) {
      setPoiError('Enter a number like 0.3 or -0.5');
      return;
    }
    setSaving(true);
    try {
      if (parsedVelocities.length > 0) await onSaveVelocities(parsedVelocities);
      if (showGroup) await onSaveResult({ groupSizeIn: groupSize, poiXIn: poiX, poiYIn: poiY });
      setVelText('');
      setOpen(false);
    } catch (e) {
      saveFailed(e);
    } finally {
      setSaving(false);
    }
  };

  const clear = () => {
    Alert.alert("Clear this charge's data?", 'The saved chronograph string will be removed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: async () => {
          setSaving(true);
          try {
            await onClearString();
          } catch (e) {
            saveFailed(e);
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  };

  const hasData =
    summary?.avgFps != null ||
    step.groupSizeIn != null ||
    step.poiXIn != null ||
    step.poiYIn != null;
  const chargeLabel = `${step.chargeGr.toFixed(2).replace(/0$/, '')} gr`;

  return (
    <Card>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        style={styles.stepHeader}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={
          `${step.chargeGr} grains, ` +
          (summary?.avgFps != null
            ? `average ${Math.round(summary.avgFps)} feet per second`
            : 'no data yet')
        }
      >
        <Text style={[type.heading, { fontVariant: ['tabular-nums'] }]}>{chargeLabel}</Text>
        <View style={{ flex: 1, marginLeft: spacing.lg }}>
          {summary?.avgFps != null ? (
            <Text style={[type.body, { fontVariant: ['tabular-nums'] }]}>
              {Math.round(summary.avgFps)} fps
              {summary.sdFps != null ? `  SD ${summary.sdFps.toFixed(1)}` : ''}
              {summary.esFps != null ? `  ES ${Math.round(summary.esFps)}` : ''}
            </Text>
          ) : (
            <Text style={type.secondary}>No data yet</Text>
          )}
          {showGroup && step.groupSizeIn != null ? (
            <Text style={type.secondary}>{step.groupSizeIn}" group</Text>
          ) : null}
          {showGroup && (step.poiXIn != null || step.poiYIn != null) ? (
            <Text style={type.secondary}>
              {`POI ${step.poiYIn ?? 0}" up, ${step.poiXIn ?? 0}" right`}
            </Text>
          ) : null}
        </View>
        <Ionicons
          name={hasData ? 'checkmark-circle' : open ? 'chevron-up' : 'chevron-down'}
          size={22}
          color={hasData ? colors.success : colors.textTertiary}
        />
      </Pressable>

      {open ? (
        <View style={{ marginTop: spacing.md }}>
          <Text style={type.label}>Velocities (fps)</Text>
          <TextInput
            style={[styles.velInput, velError ? { borderColor: colors.danger } : null]}
            value={velText}
            onChangeText={(v) => {
              setVelText(v);
              setVelError(undefined);
            }}
            placeholder="2701 2698 2711"
            placeholderTextColor={colors.textTertiary}
            keyboardType={Platform.select({ ios: 'numbers-and-punctuation', default: 'default' })}
            accessibilityLabel="Velocities in feet per second"
            multiline
          />
          {velError ? (
            <Text style={styles.errorText}>{velError}</Text>
          ) : velText.trim() ? (
            <Text style={styles.previewText}>
              {parsedVelocities.length} {parsedVelocities.length === 1 ? 'shot' : 'shots'} parsed
            </Text>
          ) : null}
          {showGroup ? (
            <>
              <Text style={[type.label, { marginTop: spacing.sm }]}>Group size (in)</Text>
              <TextInput
                style={[styles.velInput, groupError ? { borderColor: colors.danger } : null]}
                value={groupText}
                onChangeText={(v) => {
                  setGroupText(v);
                  setGroupError(undefined);
                }}
                keyboardType="decimal-pad"
                placeholder="0.75"
                placeholderTextColor={colors.textTertiary}
                accessibilityLabel="Group size in inches"
              />
              {groupError ? <Text style={styles.errorText}>{groupError}</Text> : null}
              <Text style={[type.label, { marginTop: spacing.md }]}>Point of impact (in)</Text>
              <Row>
                <Half>
                  <NumericField
                    label="Up"
                    value={poiYText}
                    onChangeText={(v) => {
                      setPoiYText(v);
                      setPoiError(undefined);
                    }}
                    placeholder="0.0"
                    suffix="in"
                    signed
                    error={poiError}
                  />
                </Half>
                <Half>
                  <NumericField
                    label="Right"
                    value={poiXText}
                    onChangeText={(v) => {
                      setPoiXText(v);
                      setPoiError(undefined);
                    }}
                    placeholder="0.0"
                    suffix="in"
                    signed
                  />
                </Half>
              </Row>
            </>
          ) : null}
          <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.md }}>
            <Button label="Save" onPress={save} loading={saving} style={{ flex: 1 }} />
            {summary?.avgFps != null ? (
              <Button label="Clear" variant="secondary" onPress={clear} disabled={saving} />
            ) : null}
          </View>
        </View>
      ) : null}
    </Card>
  );
}

function VelocityChart({
  points,
  flatCenters,
}: {
  points: ChargePoint[];
  flatCenters: number[];
}) {
  const W = 320;
  const H = 170;
  const PAD = 34;
  const charges = points.map((p) => p.chargeGr);
  const speeds = points.map((p) => p.avgFps);
  const minC = Math.min(...charges);
  const maxC = Math.max(...charges);
  const minV = Math.min(...speeds);
  const maxV = Math.max(...speeds);
  const x = (c: number) => PAD + ((c - minC) / (maxC - minC || 1)) * (W - PAD - 12);
  const y = (v: number) => H - 24 - ((v - minV) / (maxV - minV || 1)) * (H - 24 - 12);
  const poly = points.map((p) => `${x(p.chargeGr)},${y(p.avgFps)}`).join(' ');

  return (
    <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
      <Line x1={PAD} y1={H - 24} x2={W - 8} y2={H - 24} stroke={colors.border} strokeWidth={1} />
      <Line x1={PAD} y1={8} x2={PAD} y2={H - 24} stroke={colors.border} strokeWidth={1} />
      <SvgText x={4} y={y(maxV) + 4} fill={colors.textSecondary} fontSize={10}>
        {Math.round(maxV)}
      </SvgText>
      <SvgText x={4} y={y(minV) + 4} fill={colors.textSecondary} fontSize={10}>
        {Math.round(minV)}
      </SvgText>
      <Polyline points={poly} fill="none" stroke={colors.textSecondary} strokeWidth={1.5} />
      {points.map((p) => {
        const isFlat = flatCenters.some((c) => Math.abs(c - p.chargeGr) < 1e-6);
        return (
          <Circle
            key={p.chargeGr}
            cx={x(p.chargeGr)}
            cy={y(p.avgFps)}
            r={isFlat ? 5 : 3.5}
            fill={isFlat ? colors.accent : colors.surfaceRaised}
            stroke={isFlat ? colors.accent : colors.textSecondary}
            strokeWidth={1.5}
          />
        );
      })}
      {points.map((p, i) =>
        i % 2 === 0 ? (
          <SvgText
            key={`label-${p.chargeGr}`}
            x={x(p.chargeGr)}
            y={H - 10}
            fill={colors.textSecondary}
            fontSize={9}
            textAnchor="middle"
          >
            {p.chargeGr.toFixed(1)}
          </SvgText>
        ) : null,
      )}
    </Svg>
  );
}

export default function WorkupDetailScreen() {
  const { id: loadId, wid } = useLocalSearchParams<{ id: string; wid: string }>();
  const router = useRouter();
  const { data: workupRows, updatedAt } = useLiveQuery(workupByIdQuery(wid), [wid]);
  const { data: steps } = useLiveQuery(stepsForWorkupQuery(wid), [wid]);
  const { data: stepStrings } = useLiveQuery(stringsForStepsQuery(wid), [wid]);
  const workup = workupRows[0];
  // The test distance is stored canonical (yd); display it in the rifle's unit.
  const { data: rifleRows } = useLiveQuery(rifleByIdQuery(workup?.rifleId ?? ''), [workup?.rifleId]);
  const distanceUnit = rifleRows[0]?.distanceUnit ?? 'yd';
  const [promoting, setPromoting] = useState(false);
  const [completing, setCompleting] = useState(false);

  const summaries = useMemo(() => {
    const map = new Map<
      string,
      { id: string; avgFps: number | null; sdFps: number | null; esFps: number | null; shotCount: number | null }
    >();
    for (const { string, step } of stepStrings) {
      map.set(step.id, {
        id: string.id,
        avgFps: string.avgFps,
        sdFps: string.sdFps,
        esFps: string.esFps,
        shotCount: string.shotCount,
      });
    }
    return map;
  }, [stepStrings]);

  const chargePoints: ChargePoint[] = useMemo(
    () =>
      steps
        .map((s) => ({ chargeGr: s.chargeGr, avgFps: summaries.get(s.id)?.avgFps ?? null }))
        .filter((p): p is ChargePoint => p.avgFps != null),
    [steps, summaries],
  );

  const flatSpots = useMemo(
    () => (chargePoints.length >= 3 ? findFlatSpots(chargePoints) : []),
    [chargePoints],
  );

  if (!workup) {
    // updatedAt is undefined until the live query's first emission — stay blank
    // while loading; only after it emits with no row is this truly not found.
    if (updatedAt === undefined) return <Screen underHeader>{null}</Screen>;
    return (
      <Screen underHeader>
        <EmptyState
          icon="alert-circle-outline"
          title="Workup not found"
          message="This workup may have been archived or deleted."
          action={{ label: 'Back to Load', onPress: () => router.replace(`/loads/${loadId}`) }}
        />
      </Screen>
    );
  }
  const showGroup = workup.type === 'ocw' || workup.type === 'ladder';

  const promote = (chargeGr: number) => {
    if (promoting) return;
    Alert.alert(
      `Promote ${chargeGr} gr?`,
      'This becomes the new current version of the load, ready for confirmation and DOPE.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Promote',
          onPress: async () => {
            setPromoting(true);
            try {
              await promoteChargeToVersion(workup.id, chargeGr);
              router.back();
              Alert.alert(`Promoted ${chargeGr} gr`, 'Confirm it at the range when you can.', [
                { text: 'Done', style: 'cancel' },
                {
                  text: 'Start Range Session',
                  onPress: () =>
                    router.push(
                      `/range/sessions/new?rifleId=${workup.rifleId}&loadId=${loadId}`,
                    ),
                },
              ]);
            } catch (e) {
              saveFailed(e);
            } finally {
              setPromoting(false);
            }
          },
        },
      ],
    );
  };

  const markComplete = async () => {
    setCompleting(true);
    try {
      await updateWorkupStatus(workup.id, 'complete');
    } catch (e) {
      saveFailed(e);
    } finally {
      setCompleting(false);
    }
  };

  const confirmArchive = () => {
    Alert.alert('Archive workup?', 'It will be hidden from this load, but its data is kept.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Archive',
        style: 'destructive',
        onPress: async () => {
          try {
            await archiveWorkup(workup.id);
            router.back();
          } catch (e) {
            saveFailed(e);
          }
        },
      },
    ]);
  };

  return (
    <Screen underHeader>
      <Stack.Screen options={{ title: TITLES[workup.type] ?? 'Workup' }} />

      <Card>
        <Text style={type.secondary}>
          {workup.stepCount} charges · {workup.shotsPerCharge}{' '}
          {workup.shotsPerCharge === 1 ? 'shot' : 'shots'} each ·{' '}
          {workup.distanceYd != null
            ? `${Math.round(ydToDistance(workup.distanceYd, distanceUnit))} ${distanceUnit}`
            : '—'}
        </Text>
        <Text style={[type.secondary, { marginTop: 2, color: colors.textTertiary }]}>
          Enter chrono velocities per charge{showGroup ? ' and group size' : ''}. Flat spots light
          up automatically once three or more charges have data.
        </Text>
      </Card>

      {chargePoints.length >= 3 ? (
        <Card>
          <Text style={[type.label, { marginBottom: spacing.sm }]}>Velocity vs charge</Text>
          <View
            accessible
            accessibilityLabel={
              `Velocity versus charge chart, ${chargePoints.length} charges plotted` +
              (flatSpots.length > 0
                ? `, flat spots near ${flatSpots.map((f) => f.centerChargeGr).join(', ')} grains`
                : ', no flat spots detected yet')
            }
          >
            <VelocityChart
              points={chargePoints}
              flatCenters={flatSpots.map((f) => f.centerChargeGr)}
            />
          </View>
          {flatSpots.length > 0 ? (
            flatSpots.map((f) => (
              <View key={f.centerChargeGr} style={styles.flatRow}>
                <View style={{ flex: 1 }}>
                  <Text style={type.body}>
                    Flat spot around{' '}
                    <Text style={{ color: colors.accent, fontWeight: '800' }}>
                      {f.centerChargeGr} gr
                    </Text>
                  </Text>
                  <Text style={type.secondary}>
                    {f.spreadFps.toFixed(0)} fps spread across the window
                  </Text>
                </View>
                <Button
                  label="Promote"
                  onPress={() => promote(f.centerChargeGr)}
                  loading={promoting}
                />
              </View>
            ))
          ) : (
            <Text style={[type.secondary, { marginTop: spacing.sm }]}>
              No velocity flat spots detected yet — keep filling in charges, or pick a winner
              manually below.
            </Text>
          )}
        </Card>
      ) : null}

      {steps.map((step) => (
        <View key={step.id}>
          <StepCard
            step={step}
            showGroup={showGroup}
            summary={summaries.get(step.id) ?? null}
            onSaveVelocities={async (velocities) => {
              const existing = summaries.get(step.id);
              if (existing) await deleteShotString(existing.id);
              await addShotString({ workupStepId: step.id, velocitiesFps: velocities });
              if (workup.status === 'planned') await updateWorkupStatus(workup.id, 'in_progress');
            }}
            onSaveResult={(result) => updateStepResult(step.id, result)}
            onClearString={async () => {
              const existing = summaries.get(step.id);
              if (existing) await deleteShotString(existing.id);
            }}
          />
        </View>
      ))}

      <Text style={[type.label, { marginVertical: spacing.sm }]}>Pick a winner manually</Text>
      <View style={styles.chipWrap}>
        {steps.map((s) => (
          <Chip key={s.id} label={`${s.chargeGr} gr`} onPress={() => promote(s.chargeGr)} />
        ))}
      </View>

      <View style={styles.footer}>
        {workup.status !== 'complete' ? (
          <Button
            label="Mark Complete"
            variant="secondary"
            onPress={markComplete}
            loading={completing}
          />
        ) : null}
        <Button label="Archive Workup" variant="danger" onPress={confirmArchive} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stepHeader: { flexDirection: 'row', alignItems: 'center' },
  velInput: {
    marginTop: spacing.xs,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    color: colors.text,
    fontSize: 16,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: touchTarget,
  },
  errorText: { ...type.caption, color: colors.danger, marginTop: spacing.xs },
  previewText: { ...type.caption, color: colors.textSecondary, marginTop: spacing.xs },
  flatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  footer: {
    marginTop: spacing.xl,
    marginBottom: spacing.xxl,
    gap: spacing.md,
  },
});
