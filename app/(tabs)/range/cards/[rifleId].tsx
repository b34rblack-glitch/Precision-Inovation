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
import { CardBallisticsModal } from '@/features/rangecard/CardBallisticsModal';
import { CardDistancesModal } from '@/features/rangecard/CardDistancesModal';
import { QuickDopeModal, QuickDopeValues } from '@/features/rangecard/QuickDopeModal';
import { quickAddDope } from '@/db/repositories/sessions';
import { CardRow } from '@/lib/rangecard/merge';
import { rangeCardHtml } from '@/lib/rangecard/pdfHtml';
import { formatHold, holdToUnit, TurretUnit, ydToDistance } from '@/lib/units';
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
  const {
    rows,
    status,
    errorMessage,
    missing,
    card,
    version,
    mvFps,
    mvSource,
    mvTempAdjusted,
    loggedWind,
    advanced,
    confirmedCount,
    bcScale,
  } = cardState;
  // BC is constant for the whole card (the bullet's), shown on every row per
  // request. When drag truing is active the rows show the calibrated BC.
  const effectiveBc = version?.bcValue != null ? version.bcValue * (bcScale ?? 1) : null;
  const bcText = effectiveBc != null ? effectiveBc.toFixed(3) : '—';
  const bcModelText = version?.bcModel ?? '';
  const [sharing, setSharing] = useState(false);
  // Guards preset switches and true-up against double-tap stacking writes/alerts.
  const [busy, setBusy] = useState(false);
  const [distancesOpen, setDistancesOpen] = useState(false);
  // Quick-add confirmed holds without leaving the card. Tapping a row seeds
  // the sheet with that row's distance and prediction.
  const [quickDope, setQuickDope] = useState<{ distanceYd: number | null; predicted: number | null } | null>(
    null,
  );
  const [loggingDope, setLoggingDope] = useState(false);
  const [ballisticsOpen, setBallisticsOpen] = useState(false);
  // Which unit the hold columns display in. Null = the rifle's turret unit;
  // switch to MIL for mil-dot reticle holdovers (or MOA) regardless of turret.
  const [holdUnitOverride, setHoldUnitOverride] = useState<TurretUnit | null>(null);

  if (!rifle) return <Screen scroll={false} underHeader>{null}</Screen>;

  const loadLabel = activeLoad?.name ?? 'No load';
  const distanceUnit = rifle.distanceUnit;
  const turretUnit = rifle.turretUnit;
  const holdUnit: TurretUnit = holdUnitOverride ?? turretUnit;
  // Convert a hold value stored in the rifle's turret unit to the display unit.
  const toHold = (v: number) => holdToUnit(v, turretUnit, holdUnit);
  const unitWord = distanceUnit === 'yd' ? 'yards' : 'meters';

  // DRIFT column only earns its space when the effect is visible on paper.
  const driftActive = rows.some((r) => Math.abs(r.driftIn) > 0.05);
  // Logged-wind column: shown only when the card opted in AND a session
  // actually logged a wind speed.
  const wLog = card?.useLoggedWind ? loggedWind : null;
  // DRIFT shows the HOLD for spin + Coriolis: driftIn > 0 = impact drifts
  // RIGHT, so the shooter holds LEFT ('L'); negative drifts left → 'R'.
  // driftMil/driftMoa already carry both units — no toHold conversion needed.
  const driftText = (r: CardRow) =>
    `${formatHold(Math.abs(holdUnit === 'MIL' ? r.driftMil : r.driftMoa), holdUnit)} ${
      r.driftIn > 0 ? 'L' : 'R'
    }`;
  // W·LOG scales the solver's 10 mph reference hold linearly to the logged
  // crosswind (|cross|/10). Direction is the hold INTO the wind: crossMph < 0
  // = wind from the RIGHT (3 o'clock) deflects the bullet left → hold RIGHT
  // ('R'); crossMph > 0 = wind from the left → hold LEFT ('L').
  const wLogText = (r: CardRow) =>
    wLog
      ? `${formatHold(toHold(r.wind10Mph) * (Math.abs(wLog.crossMph) / 10), holdUnit)} ${
          wLog.crossMph < 0 ? 'R' : 'L'
        }`
      : '';

  const advancedSummary = (() => {
    if (!card) return 'Advanced: off';
    const parts: string[] = [];
    if (card.latitudeDeg != null && card.azimuthDeg != null)
      parts.push(`lat ${card.latitudeDeg} · az ${card.azimuthDeg}°`);
    if (card.inclineDeg != null)
      parts.push(`${card.inclineDeg >= 0 ? '+' : ''}${card.inclineDeg}°`);
    if (advanced.spinActive) parts.push('spin ✓');
    if (card.useLoggedWind) parts.push('wind log');
    return parts.length > 0 ? parts.join(' · ') : 'Advanced: off';
  })();

  const sharePdf = async () => {
    if (status !== 'ready' || !activeLoad || mvFps == null || sharing) return;
    setSharing(true);
    try {
      const html = rangeCardHtml({
        rifleName: rifle.name,
        loadLabel,
        preset: card?.preset ?? 'bench',
        turretUnit,
        holdUnit,
        distanceUnit,
        mvFps,
        // Print the calibrated BC the card actually solved with.
        bcValue: effectiveBc,
        bcModel: version?.bcModel ?? null,
        zeroLabel: `${rifle.zeroDistance} ${distanceUnit}`,
        rows,
        generatedOn: new Date(),
        advanced: {
          spinDrift: advanced.spinActive,
          coriolis:
            card?.latitudeDeg != null && card?.azimuthDeg != null
              ? { latitudeDeg: card.latitudeDeg, azimuthDeg: card.azimuthDeg }
              : null,
          inclineDeg: card?.inclineDeg ?? null,
          mvTempAdjusted,
        },
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

  /**
   * Log a confirmed hold straight from the card. quickAddDope reuses today's
   * session for this rifle + load (or opens one silently), so the shooter
   * never has to bounce to the Range tab mid-string.
   */
  const submitQuickDope = async (values: QuickDopeValues) => {
    if (loggingDope) return;
    setLoggingDope(true);
    try {
      const { createdSession } = await quickAddDope({
        rifleId: rifle.id,
        loadVersionId: activeLoad?.currentVersionId ?? null,
        distanceYd: values.distanceYd,
        elevationHold: values.elevationHold,
        windageHold: values.windageHold,
        holdUnit: turretUnit,
        confirmed: values.confirmed,
      });
      setQuickDope(null);
      cardState.refresh();
      if (createdSession) {
        Alert.alert(
          'Hold logged',
          'Started a new range session for today — add conditions to it from the Range tab whenever you like.',
        );
      }
    } catch (e) {
      Alert.alert('Could not log the hold', e instanceof Error ? e.message : String(e));
    } finally {
      setLoggingDope(false);
    }
  };

  const applyTrueUp = async (mode: 'mv' | 'drag') => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await cardState.trueUp(mode);
      if (result.mode === 'none') {
        Alert.alert('Not enough DOPE', result.reason);
      } else if (result.mode === 'mv') {
        Alert.alert(
          'Velocity calibrated',
          `Muzzle velocity solved to ${result.mvFps} fps from your confirmed DOPE. Predictions updated.`,
        );
      } else {
        Alert.alert(
          'Drag calibrated',
          `BC scaled ×${result.bcScale.toFixed(3)} (effective BC ${(
            (version?.bcValue ?? 0) * result.bcScale
          ).toFixed(3)}) from your long-range DOPE. Muzzle velocity was left alone.`,
        );
      }
    } catch (e) {
      Alert.alert('True-up failed', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  /**
   * Two-stage truing, industry standard (AB "DSF" / Hornady "axial form
   * factor"): velocity first, then drag. Which knob is correct depends on
   * whether the muzzle velocity is already trustworthy — bending MV to fit a
   * long shot when it came from a chronograph mis-models the whole curve.
   */
  const runTrueUp = () => {
    if (busy) return;
    if (mvSource === 'measured') {
      // MV came from a chrono string: velocity is measured, so the residual
      // long-range error is drag. Calibrate BC without asking.
      applyTrueUp('drag');
      return;
    }
    Alert.alert(
      'Calibrate against your DOPE',
      'Which value should be solved?\n\n' +
        '• Velocity — if your muzzle velocity is a guess or from a manual.\n' +
        '• Drag (BC) — if your muzzle velocity is measured with a chronograph; long-range error is then the drag model, not the speed.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Velocity', onPress: () => applyTrueUp('mv') },
        { text: 'Drag (BC)', onPress: () => applyTrueUp('drag') },
      ],
    );
  };

  const confirmResetBc = () => {
    Alert.alert('Discard drag calibration?', 'The card returns to the published BC.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () =>
          cardState
            .clearBcScale()
            .catch((e: unknown) =>
              Alert.alert('Reset failed', e instanceof Error ? e.message : String(e)),
            ),
      },
    ]);
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

            {card ? (
              <Pressable
                onPress={() => setBallisticsOpen(true)}
                accessibilityRole="button"
                accessibilityLabel="Edit advanced ballistics"
                style={({ pressed }) => [styles.distancesRow, pressed && { opacity: 0.6 }]}
              >
                <Ionicons name="compass-outline" size={18} color={colors.textSecondary} />
                <Text style={[type.secondary, { flex: 1 }]} numberOfLines={1}>
                  {advancedSummary}
                </Text>
                <Text style={[type.secondary, { color: colors.accent, fontWeight: '700' }]}>
                  Advanced
                </Text>
              </Pressable>
            ) : null}

            {/* Hold display unit — pick MIL for mil-dot reticle holdovers. */}
            <View style={styles.holdUnitRow}>
              <Text style={[type.secondary, { marginRight: spacing.sm }]}>Holds in</Text>
              {(['MIL', 'MOA'] as const).map((u) => (
                <Pressable
                  key={u}
                  onPress={() => setHoldUnitOverride(u)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: holdUnit === u }}
                  style={[styles.holdUnitBtn, holdUnit === u && styles.holdUnitBtnActive]}
                >
                  <Text
                    style={[
                      styles.holdUnitLabel,
                      holdUnit === u && { color: colors.onAccent },
                    ]}
                  >
                    {u}
                  </Text>
                </Pressable>
              ))}
            </View>
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
                  {mvTempAdjusted ? ' (temp adj)' : ''}
                  {'  ·  '}BC {bcText} {bcModelText}
                  {bcScale != null && version?.bcValue != null
                    ? ` (trued ×${bcScale.toFixed(3)} from ${version.bcValue.toFixed(3)})`
                    : ''}
                  {'  ·  '}
                  {confirmedCount} confirmed
                </Text>
                <Pressable
                  onPress={runTrueUp}
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityLabel="Calibrate velocity or drag from confirmed DOPE"
                  accessibilityState={{ disabled: busy }}
                  style={styles.mvBtn}
                >
                  <Text style={[type.secondary, { color: colors.accent, fontWeight: '700' }]}>
                    True-up
                  </Text>
                </Pressable>
              </View>

              {mvSource === 'override' || bcScale != null ? (
                <View style={styles.mvRow}>
                  <Text style={[type.secondary, { flex: 1, color: colors.textTertiary }]}>
                    Calibration applied
                  </Text>
                  {mvSource === 'override' ? (
                    <Pressable
                      onPress={confirmReset}
                      disabled={busy}
                      accessibilityRole="button"
                      accessibilityLabel="Reset trued muzzle velocity"
                      style={styles.mvBtn}
                    >
                      <Text style={[type.secondary, { color: colors.danger, fontWeight: '700' }]}>
                        Reset MV
                      </Text>
                    </Pressable>
                  ) : null}
                  {bcScale != null ? (
                    <Pressable
                      onPress={confirmResetBc}
                      disabled={busy}
                      accessibilityRole="button"
                      accessibilityLabel="Reset drag calibration"
                      style={styles.mvBtn}
                    >
                      <Text style={[type.secondary, { color: colors.danger, fontWeight: '700' }]}>
                        Reset BC
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}

              {/* Header row */}
              <View style={[styles.row, styles.headerRow]}>
                <Text style={[styles.cell, styles.headerCell, styles.distCell]}>
                  {distanceUnit.toUpperCase()}
                </Text>
                <Text style={[styles.cell, styles.headerCell]}>ELEV {holdUnit}</Text>
                {/* When the logged-wind column is on, W5 is dropped: with an
                    optional DRIFT column too, seven data columns don't fit a
                    phone-width row. W10 stays as the fixed scaling reference. */}
                {wLog ? (
                  <Text style={[styles.cell, styles.headerCell]}>W·LOG</Text>
                ) : (
                  <Text style={[styles.cell, styles.headerCell]}>W5</Text>
                )}
                <Text style={[styles.cell, styles.headerCell]}>W10</Text>
                {driftActive ? (
                  <Text style={[styles.cell, styles.headerCell]}>DRIFT</Text>
                ) : null}
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
                  const elevDisp = toHold(r.elevation);
                  const predDisp = toHold(r.predictedElevation);
                  // 'L'/'R' in DRIFT and W·LOG is the HOLD direction (see
                  // driftText/wLogText above); spell it out for screen readers.
                  const wLogWord = wLog
                    ? `, logged wind hold ${wLogText(r).replace(/ R$/, ' right').replace(/ L$/, ' left')}`
                    : '';
                  const driftWord = driftActive
                    ? `, drift hold ${driftText(r).replace(/ R$/, ' right').replace(/ L$/, ' left')}`
                    : '';
                  return (
                    <Pressable
                      key={r.distanceYd}
                      // Tapping a row logs a confirmed hold at that distance —
                      // the sheet opens prefilled with the row's prediction.
                      onPress={() =>
                        // The sheet works in the rifle's turret unit, so pass
                        // the stored hold rather than the display conversion.
                        setQuickDope({ distanceYd: r.distanceYd, predicted: r.elevation })
                      }
                      accessible={true}
                      accessibilityRole="button"
                      accessibilityHint="Log a confirmed hold at this distance"
                      accessibilityLabel={`${dist} ${unitWord}, elevation ${formatHold(elevDisp, holdUnit)} ${holdUnit} ${r.confirmed ? 'confirmed' : 'predicted'}${wLogWord}, wind ten ${formatHold(toHold(r.wind10Mph), holdUnit)}${driftWord}, ${Math.round(r.velocityFps)} fps, BC ${bcText}${machWord}`}
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
                          {formatHold(elevDisp, holdUnit)}
                          {r.confirmed ? ' ●' : ''}
                        </Text>
                        {r.confirmed &&
                        Math.abs(elevDisp - predDisp) > (holdUnit === 'MIL' ? 0.05 : 0.15) ? (
                          <Text style={styles.predSmall}>pred {formatHold(predDisp, holdUnit)}</Text>
                        ) : null}
                      </View>
                      <Text style={[styles.cell, styles.dimText]}>
                        {wLog ? wLogText(r) : formatHold(toHold(r.wind5Mph), holdUnit)}
                      </Text>
                      <Text style={[styles.cell, styles.dimText]}>
                        {formatHold(toHold(r.wind10Mph), holdUnit)}
                      </Text>
                      {driftActive ? (
                        <Text style={[styles.cell, styles.dimText]}>{driftText(r)}</Text>
                      ) : null}
                      <Text style={[styles.cell, styles.dimText]}>{Math.round(r.velocityFps)}</Text>
                      <Text style={[styles.cell, styles.dimText]}>{bcText}</Text>
                    </Pressable>
                  );
                })}
                {rows.some((r) => r.mach < 1.2) ? (
                  <Text style={styles.footnote}>
                    {'‡ transonic (Mach < 1.2) · ‡‡ subsonic — predictions less reliable'}
                  </Text>
                ) : null}
                {driftActive || wLog ? (
                  <Text style={styles.footnote}>
                    L/R = hold direction
                    {driftActive ? ' · DRIFT = spin + Coriolis' : ''}
                    {wLog
                      ? ` · W·LOG from ${Math.round(wLog.speedMph)} mph @ ${wLog.dirClock} o'clock`
                      : ''}
                  </Text>
                ) : null}
                <View style={{ height: spacing.xxl }} />
              </ScrollView>

              <View style={styles.actions}>
                <Button
                  label="+ Log Hold"
                  variant="secondary"
                  onPress={() => setQuickDope({ distanceYd: null, predicted: null })}
                  style={{ flex: 1 }}
                />
                <Button
                  label="Field Mode"
                  onPress={() =>
                    router.push(
                      // Carry the card's display unit through so field mode
                      // shows the same holds the user just set up here.
                      `/field-card/${rifle.id}?loadVersionId=${activeLoad?.currentVersionId}&holdUnit=${holdUnit}`,
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

          <QuickDopeModal
            visible={quickDope != null}
            distanceUnit={distanceUnit}
            turretUnit={turretUnit}
            initialDistanceYd={quickDope?.distanceYd ?? null}
            predictedElevation={quickDope?.predicted ?? null}
            saving={loggingDope}
            onClose={() => setQuickDope(null)}
            onSubmit={submitQuickDope}
          />

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

          {card ? (
            <CardBallisticsModal
              // Remount when the card's stored values change so the sheet
              // reopens with what's actually saved, not a stale draft.
              key={`${card.id}-${card.updatedAt.getTime()}`}
              visible={ballisticsOpen}
              latitudeDeg={card.latitudeDeg}
              azimuthDeg={card.azimuthDeg}
              inclineDeg={card.inclineDeg}
              useLoggedWind={card.useLoggedWind}
              spinDriftEnabled={card.spinDriftEnabled}
              onClose={() => setBallisticsOpen(false)}
              onApply={(values) =>
                cardState
                  .setBallistics(values)
                  .catch((err: unknown) =>
                    Alert.alert(
                      'Could not update ballistics',
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
  holdUnitRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.xs },
  holdUnitBtn: {
    minHeight: touchTarget - 8,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    marginRight: spacing.sm,
  },
  holdUnitBtnActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  holdUnitLabel: { color: colors.textSecondary, fontWeight: '700', fontSize: 14 },
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
