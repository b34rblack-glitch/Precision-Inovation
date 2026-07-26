import Ionicons from '@expo/vector-icons/Ionicons';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button } from '@/components/Buttons';
import { Field, Half, NumericField, Row, Segmented } from '@/components/Form';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { getVersionById } from '@/db/repositories/loads';
import { rifleByIdQuery } from '@/db/repositories/rifles';
import {
  addDopeEntry,
  addShotString,
  archiveSession,
  deleteDopeEntry,
  deleteShotString,
  dopeForSessionQuery,
  loadVersionLabel,
  sessionByIdQuery,
  stringsForSessionQuery,
} from '@/db/repositories/sessions';
import { parseDecimal, parseVelocityList } from '@/lib/parse';
import {
  distanceToYd,
  formatHold,
  inchesToMilAtRange,
  inchesToMoaAtRange,
  TurretUnit,
  ydToDistance,
} from '@/lib/units';
import { colors, spacing, touchTarget, type } from '@/theme';

export default function SessionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: sessionRows } = useLiveQuery(sessionByIdQuery(id), [id]);
  const session = sessionRows[0];
  const { data: rifleRows } = useLiveQuery(rifleByIdQuery(session?.rifleId ?? ''), [session?.rifleId]);
  const { data: dope } = useLiveQuery(dopeForSessionQuery(id), [id]);
  const { data: strings } = useLiveQuery(stringsForSessionQuery(id), [id]);
  const rifle = rifleRows[0];

  const turretUnit: TurretUnit = rifle?.turretUnit ?? 'MIL';
  const distanceUnit = rifle?.distanceUnit ?? 'yd';

  // --- DOPE quick entry ---
  const [showDopeForm, setShowDopeForm] = useState(false);
  const [distance, setDistance] = useState('');
  const [distanceError, setDistanceError] = useState<string | undefined>();
  const [elevation, setElevation] = useState('');
  const [windage, setWindage] = useState('');
  // Holds entered either in the rifle's turret unit or in inches at the distance.
  const [holdEntryUnit, setHoldEntryUnit] = useState<'MIL' | 'MOA' | 'in'>(turretUnit);
  const [groupSize, setGroupSize] = useState('');
  const [confirmed, setConfirmed] = useState<'Confirmed' | 'Provisional'>('Confirmed');
  const distanceRef = useRef<TextInput>(null);
  // Synchronous guard blocks a double-tap during the async insert (fields only
  // clear after the await); `savingDope` mirrors it to disable/load the Button.
  const savingDopeRef = useRef(false);
  const [savingDope, setSavingDope] = useState(false);

  // --- chrono string entry ---
  const [showChronoForm, setShowChronoForm] = useState(false);
  const [chronoMode, setChronoMode] = useState<'Per-shot' | 'Summary'>('Per-shot');
  const [shotsText, setShotsText] = useState('');
  const [shotsError, setShotsError] = useState<string | undefined>();
  const [avg, setAvg] = useState('');
  const [sd, setSd] = useState('');
  const [es, setEs] = useState('');
  const savingStringRef = useRef(false);
  const [savingString, setSavingString] = useState(false);

  // --- which load this session was shot with ---
  const [loadLabel, setLoadLabel] = useState<string | null>(null);
  const [sessionLoadId, setSessionLoadId] = useState<string | null>(null);
  const loadVersionId = session?.loadVersionId ?? null;
  useEffect(() => {
    let cancelled = false;
    if (!loadVersionId) {
      setLoadLabel(null);
      setSessionLoadId(null);
      return;
    }
    (async () => {
      const [label, version] = await Promise.all([
        loadVersionLabel(loadVersionId),
        getVersionById(loadVersionId),
      ]);
      if (cancelled) return;
      setLoadLabel(label);
      setSessionLoadId(version?.loadId ?? null);
    })().catch(() => {
      // Non-critical decoration — the session still renders without it.
    });
    return () => {
      cancelled = true;
    };
  }, [loadVersionId]);

  if (!session) return <Screen underHeader>{null}</Screen>;

  const saveDope = async () => {
    if (savingDopeRef.current) return;
    const d = parseDecimal(distance);
    if (d == null || d <= 0) {
      setDistanceError('Enter the distance you were shooting.');
      return;
    }
    savingDopeRef.current = true;
    setSavingDope(true);
    try {
      const rangeYd = distanceToYd(d, distanceUnit);
      // When entered in inches, convert the linear come-up at this distance to
      // the rifle's dial unit so DOPE is always stored as a turret hold.
      const toHold = (raw: string): number | null => {
        const v = parseDecimal(raw);
        if (v == null) return null;
        if (holdEntryUnit !== 'in') return v;
        return turretUnit === 'MIL'
          ? inchesToMilAtRange(v, rangeYd)
          : inchesToMoaAtRange(v, rangeYd);
      };
      await addDopeEntry({
        sessionId: session.id,
        distanceYd: rangeYd,
        elevationHold: toHold(elevation),
        windageHold: toHold(windage),
        holdUnit: turretUnit,
        groupSizeIn: parseDecimal(groupSize),
        poiUpIn: null,
        poiRightIn: null,
        confirmed: confirmed === 'Confirmed',
        notes: null,
      });
      // Keep the form open — logging several distances in a row is the norm.
      setDistance('');
      setElevation('');
      setWindage('');
      setGroupSize('');
      setDistanceError(undefined);
      distanceRef.current?.focus();
    } catch (e) {
      Alert.alert('Could not save DOPE', e instanceof Error ? e.message : String(e));
    } finally {
      savingDopeRef.current = false;
      setSavingDope(false);
    }
  };

  const parsedShots = parseVelocityList(shotsText);

  const saveString = async () => {
    if (savingStringRef.current) return;
    // Validate before arming the guard so an early return leaves the flag clear.
    const isPerShot = chronoMode === 'Per-shot';
    if (isPerShot && parsedShots.length === 0) {
      setShotsError('No velocities recognized — separate shots with spaces or commas.');
      return;
    }
    if (!isPerShot && parseDecimal(avg) == null) {
      Alert.alert('Average required', 'Enter at least the average velocity.');
      return;
    }
    savingStringRef.current = true;
    setSavingString(true);
    try {
      if (isPerShot) {
        await addShotString({ sessionId: session.id, velocitiesFps: parsedShots });
      } else {
        await addShotString({
          sessionId: session.id,
          summary: { avgFps: parseDecimal(avg), sdFps: parseDecimal(sd), esFps: parseDecimal(es) },
        });
      }
      setShotsText('');
      setShotsError(undefined);
      setAvg('');
      setSd('');
      setEs('');
      setShowChronoForm(false);
    } catch (e) {
      Alert.alert('Could not save string', e instanceof Error ? e.message : String(e));
    } finally {
      savingStringRef.current = false;
      setSavingString(false);
    }
  };

  const confirmArchive = () => {
    Alert.alert(
      'Archive session?',
      'The session is hidden from lists and its DOPE no longer feeds range cards.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          style: 'destructive',
          onPress: async () => {
            try {
              await archiveSession(session.id);
              router.back();
            } catch (e) {
              Alert.alert('Could not archive', e instanceof Error ? e.message : String(e));
            }
          },
        },
      ],
    );
  };

  const conditions = [
    session.tempF != null ? `${session.tempF}°F` : null,
    session.pressureInHg != null ? `${session.pressureInHg} inHg` : null,
    session.altitudeFt != null ? `${session.altitudeFt} ft` : null,
    session.humidityPct != null ? `${session.humidityPct}%` : null,
    session.windSpeedMph != null ? `${session.windSpeedMph} mph wind` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Screen underHeader>
      <Stack.Screen options={{ title: new Date(session.date).toLocaleDateString() }} />

      <Card>
        <Text style={type.heading}>{rifle?.name ?? 'Rifle'}</Text>
        {loadLabel ? (
          <Text style={[type.secondary, { marginTop: 2, color: colors.accent }]}>{loadLabel}</Text>
        ) : null}
        <Text style={[type.secondary, { marginTop: 2 }]}>
          {session.location ?? 'No location'}
        </Text>
        {conditions ? (
          <Text style={[type.secondary, { marginTop: 2, color: colors.textTertiary }]}>
            {conditions}
          </Text>
        ) : null}
        {session.notes ? (
          <Text style={[type.secondary, { marginTop: spacing.sm }]}>{session.notes}</Text>
        ) : null}
      </Card>

      {/* ---- DOPE ---- */}
      <View style={styles.sectionHeader}>
        <Text style={type.label}>DOPE ({turretUnit})</Text>
        <Pressable
          onPress={() => setShowDopeForm((s) => !s)}
          accessibilityRole="button"
          accessibilityLabel={showDopeForm ? 'Close DOPE entry form' : 'Add DOPE entry'}
          style={styles.iconBtn}
        >
          <Ionicons
            name={showDopeForm ? 'close' : 'add-circle'}
            size={26}
            color={colors.accent}
          />
        </Pressable>
      </View>

      {showDopeForm ? (
        <Card>
          <Row>
            <Half>
              <NumericField
                ref={distanceRef}
                label="Distance"
                value={distance}
                onChangeText={(v) => {
                  setDistance(v);
                  setDistanceError(undefined);
                }}
                suffix={distanceUnit}
                error={distanceError}
                autoFocus
              />
            </Half>
            <Half>
              <NumericField
                label="Elevation"
                value={elevation}
                onChangeText={setElevation}
                suffix={holdEntryUnit}
                signed
              />
            </Half>
          </Row>
          <Row>
            <Half>
              <NumericField
                label="Windage"
                value={windage}
                onChangeText={setWindage}
                suffix={holdEntryUnit}
                signed
              />
            </Half>
            <Half>
              <NumericField
                label="Group size"
                value={groupSize}
                onChangeText={setGroupSize}
                suffix="in"
              />
            </Half>
          </Row>
          <Segmented
            label="Enter holds in"
            options={[turretUnit, 'in'] as const}
            value={holdEntryUnit}
            onChange={setHoldEntryUnit}
          />
          {holdEntryUnit === 'in' ? (
            <Text style={[type.secondary, { marginTop: -spacing.sm, marginBottom: spacing.md, color: colors.textTertiary }]}>
              Inches of come-up/correction at this distance — converted to {turretUnit} using the distance.
            </Text>
          ) : null}
          <Segmented
            label="Status"
            options={['Confirmed', 'Provisional'] as const}
            value={confirmed}
            onChange={setConfirmed}
          />
          <View style={styles.formActions}>
            <Button label="Add DOPE" onPress={saveDope} loading={savingDope} style={{ flex: 1 }} />
            <Pressable
              onPress={() => setShowDopeForm(false)}
              accessibilityRole="button"
              accessibilityLabel="Done adding DOPE"
              style={styles.doneBtn}
            >
              <Text style={styles.doneLabel}>Done</Text>
            </Pressable>
          </View>
        </Card>
      ) : null}

      {dope.length === 0 && !showDopeForm ? (
        <Text style={[type.secondary, { marginBottom: spacing.lg }]}>
          Record the holds that actually worked — they feed this rifle's range card.
        </Text>
      ) : (
        dope.map((entry) => {
          const dist = Math.round(ydToDistance(entry.distanceYd, distanceUnit));
          const distLabel = `${dist} ${distanceUnit}`;
          const unitWord = distanceUnit === 'yd' ? 'yards' : 'meters';
          // The ▲ / ◀▶ glyphs are decorative; spell out the reading for AT.
          const a11yParts = [`${dist} ${unitWord}`];
          if (entry.elevationHold != null) {
            a11yParts.push(
              `elevation ${formatHold(Math.abs(entry.elevationHold), turretUnit)} ${entry.elevationHold >= 0 ? 'up' : 'down'}`,
            );
          }
          if (entry.windageHold != null) {
            a11yParts.push(
              `windage ${formatHold(Math.abs(entry.windageHold), turretUnit)} ${entry.windageHold >= 0 ? 'right' : 'left'}`,
            );
          }
          if (entry.groupSizeIn != null) {
            a11yParts.push(`group ${entry.groupSizeIn} inches`);
          }
          a11yParts.push(entry.confirmed ? 'confirmed' : 'provisional');
          return (
            <Card key={entry.id}>
              <View style={styles.dopeRow}>
                <View
                  style={styles.dopeInfo}
                  accessible={true}
                  accessibilityLabel={a11yParts.join(', ')}
                >
                  <Text style={[type.heading, { fontVariant: ['tabular-nums'] }]}>{distLabel}</Text>
                  <View style={{ flex: 1, marginLeft: spacing.lg }}>
                    <Text style={[type.body, { fontVariant: ['tabular-nums'] }]}>
                      {entry.elevationHold != null
                        ? `▲ ${formatHold(entry.elevationHold, turretUnit)}`
                        : '—'}
                      {entry.windageHold != null
                        ? `   ◀▶ ${formatHold(entry.windageHold, turretUnit)}`
                        : ''}
                    </Text>
                    {entry.groupSizeIn != null ? (
                      <Text style={type.secondary}>{entry.groupSizeIn}" group</Text>
                    ) : null}
                  </View>
                  {entry.confirmed ? (
                    <Text style={[type.label, { color: colors.confirmed }]}>CONF</Text>
                  ) : (
                    <Text style={[type.label, { color: colors.predicted }]}>PROV</Text>
                  )}
                </View>
                <Pressable
                  onPress={() =>
                    Alert.alert('Delete entry?', '', [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Delete',
                        style: 'destructive',
                        onPress: () =>
                          deleteDopeEntry(entry.id).catch((e: unknown) =>
                            Alert.alert('Delete failed', e instanceof Error ? e.message : String(e)),
                          ),
                      },
                    ])
                  }
                  accessibilityRole="button"
                  accessibilityLabel={`Delete ${distLabel} entry`}
                  style={[styles.iconBtn, { marginLeft: spacing.xs }]}
                >
                  <Ionicons name="trash-outline" size={22} color={colors.textTertiary} />
                </Pressable>
              </View>
            </Card>
          );
        })
      )}

      {/* ---- Chrono strings ---- */}
      <View style={styles.sectionHeader}>
        <Text style={type.label}>Velocity strings</Text>
        <Pressable
          onPress={() => setShowChronoForm((s) => !s)}
          accessibilityRole="button"
          accessibilityLabel={showChronoForm ? 'Close velocity entry form' : 'Add velocity string'}
          style={styles.iconBtn}
        >
          <Ionicons
            name={showChronoForm ? 'close' : 'add-circle'}
            size={26}
            color={colors.accent}
          />
        </Pressable>
      </View>

      {showChronoForm ? (
        <Card>
          <Segmented
            label="Entry mode"
            options={['Per-shot', 'Summary'] as const}
            value={chronoMode}
            onChange={setChronoMode}
          />
          {chronoMode === 'Per-shot' ? (
            <>
              <Field
                label="Velocities (fps)"
                value={shotsText}
                onChangeText={(v) => {
                  setShotsText(v);
                  setShotsError(undefined);
                }}
                placeholder="2701 2698 2711 2695 2704"
                multiline
                error={shotsError}
              />
              {parsedShots.length > 0 ? (
                <Text style={[type.caption, { marginTop: -spacing.md, marginBottom: spacing.md }]}>
                  {parsedShots.length} {parsedShots.length === 1 ? 'shot' : 'shots'} parsed
                </Text>
              ) : null}
            </>
          ) : (
            <>
              <NumericField label="Average" value={avg} onChangeText={setAvg} suffix="fps" />
              <Row>
                <Half>
                  <NumericField label="SD" value={sd} onChangeText={setSd} suffix="fps" />
                </Half>
                <Half>
                  <NumericField label="ES" value={es} onChangeText={setEs} suffix="fps" />
                </Half>
              </Row>
            </>
          )}
          <Button label="Add String" onPress={saveString} loading={savingString} />
        </Card>
      ) : null}

      {strings.map((s) => (
        <Card key={s.id}>
          <View style={styles.dopeRow}>
            <View style={{ flex: 1 }}>
              <Text style={[type.body, { fontVariant: ['tabular-nums'] }]}>
                {s.avgFps != null ? `${Math.round(s.avgFps)} fps avg` : '—'}
                {s.shotCount != null ? `  (${s.shotCount} shots)` : ''}
              </Text>
              <Text style={[type.secondary, { fontVariant: ['tabular-nums'] }]}>
                {s.sdFps != null ? `SD ${s.sdFps.toFixed(1)}` : 'SD —'}
                {'   '}
                {s.esFps != null ? `ES ${s.esFps.toFixed(0)}` : 'ES —'}
              </Text>
            </View>
            <Pressable
              onPress={() =>
                Alert.alert('Delete string?', '', [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: () =>
                      deleteShotString(s.id).catch((e: unknown) =>
                        Alert.alert('Delete failed', e instanceof Error ? e.message : String(e)),
                      ),
                  },
                ])
              }
              accessibilityRole="button"
              accessibilityLabel="Delete velocity string"
              style={styles.iconBtn}
            >
              <Ionicons name="trash-outline" size={22} color={colors.textTertiary} />
            </Pressable>
          </View>
        </Card>
      ))}

      {rifle ? (
        <Button
          label="View Range Card"
          variant="secondary"
          onPress={() =>
            router.push(
              `/range/cards/${rifle.id}${sessionLoadId ? `?loadId=${sessionLoadId}` : ''}`,
            )
          }
          style={{ marginTop: spacing.lg }}
        />
      ) : null}

      <Button
        label="Archive Session"
        variant="danger"
        onPress={confirmArchive}
        style={{ marginTop: spacing.md }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  dopeRow: { flexDirection: 'row', alignItems: 'center' },
  dopeInfo: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  iconBtn: {
    width: touchTarget,
    height: touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  doneBtn: {
    minHeight: touchTarget,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
  },
  doneLabel: { color: colors.textSecondary, fontSize: 15, fontWeight: '600' },
});
