import { Ionicons } from '@expo/vector-icons';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import * as Print from 'expo-print';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/Buttons';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { activeLoadsQuery } from '@/db/repositories/loads';
import { rifleByIdQuery } from '@/db/repositories/rifles';
import { useRangeCard } from '@/features/rangecard/useRangeCard';
import { rangeCardHtml } from '@/lib/rangecard/pdfHtml';
import { formatHold, ydToDistance } from '@/lib/units';
import { colors, radii, spacing, touchTarget, type } from '@/theme';

export default function RangeCardScreen() {
  const { rifleId } = useLocalSearchParams<{ rifleId: string }>();
  const router = useRouter();
  const { data: rifleRows } = useLiveQuery(rifleByIdQuery(rifleId), [rifleId]);
  const { data: allLoads } = useLiveQuery(activeLoadsQuery());
  const rifle = rifleRows[0];

  const rifleLoads = useMemo(
    () => allLoads.filter((l) => l.rifleId === rifleId && l.currentVersionId),
    [allLoads, rifleId],
  );
  const [selectedLoadId, setSelectedLoadId] = useState<string | null>(null);
  const activeLoad =
    rifleLoads.find((l) => l.id === selectedLoadId) ?? rifleLoads[0] ?? null;

  const cardState = useRangeCard(rifle, activeLoad?.currentVersionId ?? null);
  const { rows, status, missing, card, mvFps, mvSource, confirmedCount } = cardState;

  if (!rifle) return <Screen>{null}</Screen>;

  const loadLabel = activeLoad?.name ?? 'No load';
  const distanceUnit = rifle.distanceUnit;
  const turretUnit = rifle.turretUnit;

  const sharePdf = async () => {
    if (status !== 'ready' || !activeLoad || mvFps == null) return;
    const html = rangeCardHtml({
      rifleName: rifle.name,
      loadLabel,
      preset: card?.preset ?? 'bench',
      turretUnit,
      distanceUnit,
      mvFps,
      zeroLabel: `${rifle.zeroDistance} ${distanceUnit}`,
      rows,
      generatedOn: new Date(),
    });
    const { uri } = await Print.printToFileAsync({ html });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Range card' });
    }
  };

  const runTrueUp = async () => {
    const trued = await cardState.trueUp();
    if (trued == null) {
      Alert.alert(
        'Not enough DOPE',
        'Truing needs at least one confirmed elevation hold at 300+ yards for this rifle and load.',
      );
    } else {
      Alert.alert(
        'Velocity trued',
        `Muzzle velocity calibrated to ${trued} fps from your confirmed DOPE. Predictions updated.`,
      );
    }
  };

  return (
    <Screen scroll={false}>
      <Stack.Screen options={{ title: `${rifle.name} — Card` }} />

      {rifleLoads.length === 0 ? (
        <EmptyState
          icon="grid-outline"
          title="No loads for this rifle"
          message="Assign a load to this rifle in the Loads tab, then come back for its range card."
        />
      ) : (
        <>
          {/* Load picker + preset toggle */}
          <View style={styles.controls}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
              {rifleLoads.map((l) => (
                <Pressable
                  key={l.id}
                  onPress={() => setSelectedLoadId(l.id)}
                  style={[styles.chip, activeLoad?.id === l.id && styles.chipActive]}
                >
                  <Text
                    style={[styles.chipLabel, activeLoad?.id === l.id && styles.chipLabelActive]}
                  >
                    {l.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            <View style={styles.presetRow}>
              {(['bench', 'hunting'] as const).map((p) => (
                <Pressable
                  key={p}
                  onPress={() => cardState.changePreset(p)}
                  style={[styles.presetBtn, card?.preset === p && styles.presetBtnActive]}
                >
                  <Text
                    style={[
                      styles.presetLabel,
                      card?.preset === p && { color: colors.onAccent },
                    ]}
                  >
                    {p === 'bench' ? 'Bench' : 'Hunting'}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {status === 'missing-data' ? (
            <Card style={{ marginHorizontal: spacing.lg }}>
              <Text style={type.heading}>Almost there</Text>
              <Text style={[type.secondary, { marginTop: spacing.sm }]}>
                To compute this card the app still needs:
              </Text>
              {missing.map((m) => (
                <Text key={m} style={[type.body, { marginTop: spacing.xs }]}>
                  • {m}
                </Text>
              ))}
            </Card>
          ) : null}

          {status === 'ready' ? (
            <>
              <View style={styles.mvRow}>
                <Text style={[type.secondary, { flex: 1 }]}>
                  MV {mvFps != null ? Math.round(mvFps) : '—'} fps
                  {mvSource === 'override' ? ' (trued)' : mvSource === 'measured' ? ' (chrono)' : ''}
                  {'  ·  '}
                  {confirmedCount} confirmed
                </Text>
                {mvSource === 'override' ? (
                  <Pressable onPress={cardState.clearTrueUp} hitSlop={8}>
                    <Text style={[type.secondary, { color: colors.danger }]}>Reset</Text>
                  </Pressable>
                ) : (
                  <Pressable onPress={runTrueUp} hitSlop={8}>
                    <Text style={[type.secondary, { color: colors.accent, fontWeight: '700' }]}>
                      True-up MV
                    </Text>
                  </Pressable>
                )}
              </View>

              {/* Header row */}
              <View style={[styles.row, styles.headerRow]}>
                <Text style={[styles.cell, styles.headerCell, styles.distCell]}>
                  {distanceUnit.toUpperCase()}
                </Text>
                <Text style={[styles.cell, styles.headerCell]}>ELEV {turretUnit}</Text>
                <Text style={[styles.cell, styles.headerCell]}>W5</Text>
                <Text style={[styles.cell, styles.headerCell]}>W10</Text>
                <Text style={[styles.cell, styles.headerCell]}>
                  {card?.preset === 'bench' ? 'FPS' : 'FT·LB'}
                </Text>
              </View>

              <ScrollView style={{ flex: 1 }}>
                {rows.map((r) => (
                  <View
                    key={r.distanceYd}
                    style={[styles.row, r.confirmed && styles.confirmedRow]}
                  >
                    <Text style={[styles.cell, styles.distCell]}>
                      {Math.round(ydToDistance(r.distanceYd, distanceUnit))}
                    </Text>
                    <View style={[styles.cell, { alignItems: 'flex-end' }]}>
                      <Text
                        style={[
                          styles.holdText,
                          r.confirmed && { color: colors.confirmed, fontWeight: '800' },
                        ]}
                      >
                        {formatHold(r.elevation, turretUnit)}
                        {r.confirmed ? ' ●' : ''}
                      </Text>
                      {r.confirmed &&
                      Math.abs(r.elevation - r.predictedElevation) >
                        (turretUnit === 'MIL' ? 0.05 : 0.15) ? (
                        <Text style={styles.predSmall}>
                          pred {formatHold(r.predictedElevation, turretUnit)}
                        </Text>
                      ) : null}
                    </View>
                    <Text style={[styles.cell, styles.dimText]}>
                      {formatHold(r.wind5Mph, turretUnit)}
                    </Text>
                    <Text style={[styles.cell, styles.dimText]}>
                      {formatHold(r.wind10Mph, turretUnit)}
                    </Text>
                    <Text style={[styles.cell, styles.dimText]}>
                      {card?.preset === 'bench'
                        ? Math.round(r.velocityFps)
                        : r.energyFtLb != null
                          ? Math.round(r.energyFtLb)
                          : '—'}
                    </Text>
                  </View>
                ))}
                <View style={{ height: spacing.xxl }} />
              </ScrollView>

              <View style={styles.actions}>
                <Button
                  label="Field Mode"
                  onPress={() =>
                    router.push(
                      `/field-card/${rifle.id}?loadVersionId=${activeLoad?.currentVersionId}`,
                    )
                  }
                  style={{ flex: 1 }}
                />
                <Pressable onPress={sharePdf} style={styles.pdfBtn}>
                  <Ionicons name="share-outline" size={22} color={colors.text} />
                  <Text style={{ color: colors.text, fontWeight: '700', marginLeft: 6 }}>PDF</Text>
                </Pressable>
              </View>
            </>
          ) : null}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  controls: { paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  chip: {
    minHeight: touchTarget - 10,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: spacing.sm,
  },
  chipActive: { backgroundColor: colors.surfaceRaised, borderColor: colors.accent },
  chipLabel: { color: colors.textSecondary, fontSize: 14, fontWeight: '600' },
  chipLabelActive: { color: colors.text },
  presetRow: {
    flexDirection: 'row',
    marginTop: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  presetBtn: { flex: 1, paddingVertical: spacing.sm + 2, alignItems: 'center' },
  presetBtnActive: { backgroundColor: colors.accent },
  presetLabel: { color: colors.textSecondary, fontWeight: '700', fontSize: 14 },
  mvRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerRow: { borderBottomWidth: 1.5, borderBottomColor: colors.textSecondary },
  confirmedRow: { backgroundColor: colors.surface },
  cell: { flex: 1, textAlign: 'right', color: colors.text, fontVariant: ['tabular-nums'] },
  headerCell: {
    ...type.label,
    color: colors.textSecondary,
  },
  distCell: { textAlign: 'left', fontWeight: '700', fontSize: 16 },
  holdText: { color: colors.text, fontSize: 17, fontWeight: '600', fontVariant: ['tabular-nums'] },
  predSmall: { color: colors.textTertiary, fontSize: 11, fontVariant: ['tabular-nums'] },
  dimText: { color: colors.textSecondary, fontSize: 14 },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  pdfBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
});
