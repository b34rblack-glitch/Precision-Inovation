import { Ionicons } from '@expo/vector-icons';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import * as Print from 'expo-print';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/Buttons';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { activeLoadsQuery } from '@/db/repositories/loads';
import { rifleByIdQuery } from '@/db/repositories/rifles';
import { useRangeCard } from '@/features/rangecard/useRangeCard';
import { CardDistancesModal } from '@/features/rangecard/CardDistancesModal';
import { rangeCardHtml } from '@/lib/rangecard/pdfHtml';
import { formatHold, ydToDistance } from '@/lib/units';
import { colors, radii, spacing, touchTarget, type } from '@/theme';

export default function RangeCardScreen() {
  const { rifleId, loadId } = useLocalSearchParams<{ rifleId: string; loadId?: string }>();
  const router = useRouter();
  const { data: rifleRows } = useLiveQuery(rifleByIdQuery(rifleId), [rifleId]);
  const { data: allLoads, updatedAt: loadsLoadedAt } = useLiveQuery(activeLoadsQuery());
  const rifle = rifleRows[0];

  const rifleLoads = useMemo(
    () => allLoads.filter((l) => l.rifleId === rifleId && l.currentVersionId),
    [allLoads, rifleId],
  );
  // Deep links (session detail, load detail) preselect their load.
  const [selectedLoadId, setSelectedLoadId] = useState<string | null>(loadId ?? null);
  const activeLoad =
    rifleLoads.find((l) => l.id === selectedLoadId) ?? rifleLoads[0] ?? null;

  const cardState = useRangeCard(rifle, activeLoad?.currentVersionId ?? null);
  const { rows, status, errorMessage, missing, card, version, mvFps, mvSource, confirmedCount } =
    cardState;
  // BC is constant for the whole card (the bullet's), shown on every row per request.
  const bcText = version?.bcValue != null ? version.bcValue.toFixed(3) : '—';
  const bcModelText = version?.bcModel ?? '';
  const [sharing, setSharing] = useState(false);
  // Guards preset switches and true-up against double-tap stacking writes/alerts.
  const [busy, setBusy] = useState(false);
  const [distancesOpen, setDistancesOpen] = useState(false);

  if (!rifle) return <Screen scroll={false} underHeader>{null}</Screen>;

  const loadLabel = activeLoad?.name ?? 'No load';
  const distanceUnit = rifle.distanceUnit;
  const turretUnit = rifle.turretUnit;
  const unitWord = distanceUnit === 'yd' ? 'yards' : 'meters';

  const sharePdf = async () => {
    if (status !== 'ready' || !activeLoad || mvFps == null || sharing) return;
    setSharing(true);
    try {
      const html = rangeCardHtml({
        rifleName: rifle.name,
        loadLabel,
        preset: card?.preset ?? 'bench',
        turretUnit,
        distanceUnit,
        mvFps,
        bcValue: version?.bcValue ?? null,
        bcModel: version?.bcModel ?? null,
        zeroLabel: `${rifle.zeroDistance} ${distanceUnit}`,
        rows,
        generatedOn: new Date(),
      });
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Range card' });
      }
    } catch (e) {
      Alert.alert('Could not create PDF', e instanceof Error ? e.message : String(e));
    } finally {
      setSharing(false);
    }
  };

  const runTrueUp = async () => {
    if (busy) return;
    setBusy(true);
    try {
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
    } catch (e) {
      Alert.alert('True-up failed', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const changePreset = (p: 'bench' | 'hunting') => {
    if (busy || card?.preset === p) return;
    setBusy(true);
    cardState
      .changePreset(p)
      .catch((e: unknown) =>
        Alert.alert('Could not switch preset', e instanceof Error ? e.message : String(e)),
      )
      .finally(() => setBusy(false));
  };

  const confirmReset = () => {
    Alert.alert(
      'Discard trued velocity?',
      "The card goes back to the load's stated muzzle velocity.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () =>
            cardState.clearTrueUp().catch((e: unknown) =>
              Alert.alert('Reset failed', e instanceof Error ? e.message : String(e)),
            ),
        },
      ],
    );
  };

  return (
    <Screen scroll={false} underHeader>
      <Stack.Screen options={{ title: `${rifle.name} — Card` }} />

      {!loadsLoadedAt ? (
        // Loads live query hasn't emitted yet — don't flash a false "no loads".
        <View style={styles.loadingArea}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : rifleLoads.length === 0 ? (
        <View style={{ paddingHorizontal: spacing.lg }}>
          <EmptyState
            icon="grid-outline"
            title="No loads for this rifle"
            message="A range card needs a load assigned to this rifle."
          />
          <Button
            label="New Load for this Rifle"
            onPress={() => router.push(`/loads/new?rifleId=${rifleId}`)}
          />
        </View>
      ) : (
        <>
          {/* Load picker + preset toggle */}
          <View style={styles.controls}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
              {rifleLoads.map((l) => (
                <Chip
                  key={l.id}
                  label={l.name}
                  selected={activeLoad?.id === l.id}
                  onPress={() => setSelectedLoadId(l.id)}
                  style={{ marginRight: spacing.sm }}
                />
              ))}
            </ScrollView>
            <View style={styles.presetRow}>
              {(['bench', 'hunting'] as const).map((p) => (
                <Pressable
                  key={p}
                  onPress={() => changePreset(p)}
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityState={{ selected: card?.preset === p, disabled: busy }}
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

            {card ? (
              <Pressable
                onPress={() => setDistancesOpen(true)}
                accessibilityRole="button"
                accessibilityLabel="Edit card distances"
                style={({ pressed }) => [styles.distancesRow, pressed && { opacity: 0.6 }]}
              >
                <Ionicons name="options-outline" size={18} color={colors.textSecondary} />
                <Text style={[type.secondary, { flex: 1 }]}>
                  {Math.round(ydToDistance(card.startDistanceYd, distanceUnit))}–
                  {Math.round(ydToDistance(card.endDistanceYd, distanceUnit))} {distanceUnit} ·{' '}
                  {Math.round(ydToDistance(card.incrementYd, distanceUnit))} {distanceUnit} steps
                </Text>
                <Text style={[type.secondary, { color: colors.accent, fontWeight: '700' }]}>
                  Edit
                </Text>
              </Pressable>
            ) : null}
          </View>

          {status === 'loading' ? (
            <View style={styles.loadingArea}>
              <ActivityIndicator color={colors.accent} />
            </View>
          ) : null}

          {status === 'error' ? (
            <Card style={{ marginHorizontal: spacing.lg }}>
              <Text style={type.heading}>Card failed to load</Text>
              <Text style={[type.secondary, { marginTop: spacing.sm }]}>
                {errorMessage ?? 'Something went wrong computing this card.'}
              </Text>
              <Button
                label="Retry"
                variant="secondary"
                onPress={cardState.refresh}
                style={{ marginTop: spacing.md }}
              />
            </Card>
          ) : null}

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
              {activeLoad ? (
                <Button
                  label="Edit Load"
                  variant="secondary"
                  onPress={() => router.push(`/loads/${activeLoad.id}/edit`)}
                  style={{ marginTop: spacing.md }}
                />
              ) : null}
            </Card>
          ) : null}

          {status === 'ready' ? (
            <>
              <View style={styles.mvRow}>
                <Text style={[type.secondary, { flex: 1 }]}>
                  MV {mvFps != null ? Math.round(mvFps) : '—'} fps
                  {mvSource === 'override' ? ' (trued)' : mvSource === 'measured' ? ' (chrono)' : ''}
                  {'  ·  '}BC {bcText} {bcModelText}
                  {'  ·  '}
                  {confirmedCount} confirmed
                </Text>
                {mvSource === 'override' ? (
                  <Pressable
                    onPress={confirmReset}
                    disabled={busy}
                    accessibilityRole="button"
                    accessibilityLabel="Reset trued muzzle velocity"
                    accessibilityState={{ disabled: busy }}
                    style={styles.mvBtn}
                  >
                    <Text style={[type.secondary, { color: colors.danger, fontWeight: '700' }]}>
                      Reset
                    </Text>
                  </Pressable>
                ) : (
                  <Pressable
                    onPress={runTrueUp}
                    disabled={busy}
                    accessibilityRole="button"
                    accessibilityLabel="True up muzzle velocity from confirmed DOPE"
                    accessibilityState={{ disabled: busy }}
                    style={styles.mvBtn}
                  >
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
                <Text style={[styles.cell, styles.headerCell]}>FPS</Text>
                <Text style={[styles.cell, styles.headerCell]}>BC</Text>
              </View>

              <ScrollView style={{ flex: 1 }}>
                {rows.map((r) => {
                  const dist = Math.round(ydToDistance(r.distanceYd, distanceUnit));
                  const subsonic = r.mach < 1.0;
                  const transonic = r.mach < 1.2;
                  const machMark = subsonic ? '‡‡' : transonic ? '‡' : '';
                  const machWord = subsonic ? ', subsonic' : transonic ? ', transonic' : '';
                  // Fade predictions in the transonic zone; confirmed holds stay lit.
                  const dimPred = transonic && !r.confirmed;
                  return (
                    <View
                      key={r.distanceYd}
                      accessible={true}
                      accessibilityLabel={`${dist} ${unitWord}, elevation ${formatHold(r.elevation, turretUnit)} ${turretUnit} ${r.confirmed ? 'confirmed' : 'predicted'}, wind ten ${formatHold(r.wind10Mph, turretUnit)}, ${Math.round(r.velocityFps)} fps, BC ${bcText}${machWord}`}
                      style={[styles.row, r.confirmed && styles.confirmedRow, dimPred && styles.transonicRow]}
                    >
                      <Text style={[styles.cell, styles.distCell]}>
                        {dist}
                        {machMark ? <Text style={styles.machMark}>{` ${machMark}`}</Text> : null}
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
                      <Text style={[styles.cell, styles.dimText]}>{Math.round(r.velocityFps)}</Text>
                      <Text style={[styles.cell, styles.dimText]}>{bcText}</Text>
                    </View>
                  );
                })}
                {rows.some((r) => r.mach < 1.2) ? (
                  <Text style={styles.footnote}>
                    {'‡ transonic (Mach < 1.2) · ‡‡ subsonic — predictions less reliable'}
                  </Text>
                ) : null}
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
                <Pressable
                  onPress={sharePdf}
                  disabled={sharing}
                  accessibilityRole="button"
                  accessibilityLabel="Share range card as PDF"
                  accessibilityState={{ busy: sharing }}
                  style={styles.pdfBtn}
                >
                  {sharing ? (
                    <ActivityIndicator color={colors.text} />
                  ) : (
                    <>
                      <Ionicons name="share-outline" size={22} color={colors.text} />
                      <Text style={{ color: colors.text, fontWeight: '700', marginLeft: 6 }}>
                        PDF
                      </Text>
                    </>
                  )}
                </Pressable>
              </View>
            </>
          ) : null}

          {card ? (
            <CardDistancesModal
              visible={distancesOpen}
              distanceUnit={distanceUnit}
              startYd={card.startDistanceYd}
              endYd={card.endDistanceYd}
              incrementYd={card.incrementYd}
              onClose={() => setDistancesOpen(false)}
              onApply={(s, e, i) =>
                cardState
                  .changeDistances(s, e, i)
                  .catch((err: unknown) =>
                    Alert.alert(
                      'Could not update distances',
                      err instanceof Error ? err.message : String(err),
                    ),
                  )
              }
            />
          ) : null}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  controls: { paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  distancesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
  },
  presetRow: {
    flexDirection: 'row',
    marginTop: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  presetBtn: {
    flex: 1,
    minHeight: touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetBtnActive: { backgroundColor: colors.accent },
  presetLabel: { color: colors.textSecondary, fontWeight: '700', fontSize: 14 },
  mvRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
  },
  mvBtn: {
    minHeight: touchTarget,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  loadingArea: { flex: 1, alignItems: 'center', justifyContent: 'center' },
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
  transonicRow: { opacity: 0.6 },
  machMark: { color: colors.textTertiary, fontSize: 12, fontWeight: '700' },
  footnote: {
    color: colors.textTertiary,
    fontSize: 12,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  cell: { flex: 1, textAlign: 'right', color: colors.text, fontVariant: ['tabular-nums'] },
  headerCell: {
    ...type.label,
    color: colors.textSecondary,
  },
  distCell: { textAlign: 'left', fontWeight: '700', fontSize: 16 },
  holdText: { color: colors.text, fontSize: 17, fontWeight: '600', fontVariant: ['tabular-nums'] },
  predSmall: { color: colors.textSecondary, fontSize: 12, fontVariant: ['tabular-nums'] },
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
    minWidth: 96,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
});
