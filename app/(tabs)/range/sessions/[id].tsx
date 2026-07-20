import { Ionicons } from '@expo/vector-icons';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/Buttons';
import { Field, Half, NumericField, Row, Segmented } from '@/components/Form';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { rifleByIdQuery } from '@/db/repositories/rifles';
import {
  addDopeEntry,
  addShotString,
  deleteDopeEntry,
  deleteShotString,
  dopeForSessionQuery,
  sessionByIdQuery,
  stringsForSessionQuery,
} from '@/db/repositories/sessions';
import { distanceToYd, formatHold, TurretUnit, ydToDistance } from '@/lib/units';
import { colors, radii, spacing, type } from '@/theme';

const num = (s: string): number | null => {
  const v = parseFloat(s);
  return Number.isFinite(v) ? v : null;
};

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
  const [elevation, setElevation] = useState('');
  const [windage, setWindage] = useState('');
  const [groupSize, setGroupSize] = useState('');
  const [confirmed, setConfirmed] = useState<'Confirmed' | 'Provisional'>('Confirmed');

  // --- chrono string entry ---
  const [showChronoForm, setShowChronoForm] = useState(false);
  const [chronoMode, setChronoMode] = useState<'Per-shot' | 'Summary'>('Per-shot');
  const [shotsText, setShotsText] = useState('');
  const [avg, setAvg] = useState('');
  const [sd, setSd] = useState('');
  const [es, setEs] = useState('');

  if (!session) return <Screen>{null}</Screen>;

  const saveDope = async () => {
    const d = num(distance);
    if (d == null || d <= 0) {
      Alert.alert('Distance required', 'Enter the distance you were shooting.');
      return;
    }
    await addDopeEntry({
      sessionId: session.id,
      distanceYd: distanceToYd(d, distanceUnit),
      elevationHold: num(elevation),
      windageHold: num(windage),
      holdUnit: turretUnit,
      groupSizeIn: num(groupSize),
      poiUpIn: null,
      poiRightIn: null,
      confirmed: confirmed === 'Confirmed',
      notes: null,
    });
    setDistance('');
    setElevation('');
    setWindage('');
    setGroupSize('');
    setShowDopeForm(false);
  };

  const saveString = async () => {
    if (chronoMode === 'Per-shot') {
      const velocities = shotsText
        .split(/[\s,;]+/)
        .map((s) => parseFloat(s))
        .filter((v) => Number.isFinite(v) && v > 0);
      if (velocities.length === 0) {
        Alert.alert('No shots', 'Enter velocities separated by spaces or commas.');
        return;
      }
      await addShotString({ sessionId: session.id, velocitiesFps: velocities });
    } else {
      if (num(avg) == null) {
        Alert.alert('Average required', 'Enter at least the average velocity.');
        return;
      }
      await addShotString({
        sessionId: session.id,
        summary: { avgFps: num(avg), sdFps: num(sd), esFps: num(es) },
      });
    }
    setShotsText('');
    setAvg('');
    setSd('');
    setEs('');
    setShowChronoForm(false);
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
    <Screen>
      <Stack.Screen options={{ title: new Date(session.date).toLocaleDateString() }} />

      <Card>
        <Text style={type.heading}>{rifle?.name ?? 'Rifle'}</Text>
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
        <Pressable onPress={() => setShowDopeForm((s) => !s)} hitSlop={10}>
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
                label="Distance"
                value={distance}
                onChangeText={setDistance}
                suffix={distanceUnit}
                autoFocus
              />
            </Half>
            <Half>
              <NumericField
                label="Elevation"
                value={elevation}
                onChangeText={setElevation}
                suffix={turretUnit}
              />
            </Half>
          </Row>
          <Row>
            <Half>
              <NumericField
                label="Windage"
                value={windage}
                onChangeText={setWindage}
                suffix={turretUnit}
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
            label="Status"
            options={['Confirmed', 'Provisional'] as const}
            value={confirmed}
            onChange={setConfirmed}
          />
          <Button label="Add DOPE" onPress={saveDope} />
        </Card>
      ) : null}

      {dope.length === 0 && !showDopeForm ? (
        <Text style={[type.secondary, { marginBottom: spacing.lg }]}>
          Record the holds that actually worked — they feed this rifle's range card.
        </Text>
      ) : (
        dope.map((entry) => (
          <Card key={entry.id}>
            <View style={styles.dopeRow}>
              <Text style={[type.heading, { fontVariant: ['tabular-nums'] }]}>
                {Math.round(ydToDistance(entry.distanceYd, distanceUnit))} {distanceUnit}
              </Text>
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
              <Pressable
                onPress={() =>
                  Alert.alert('Delete entry?', '', [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Delete',
                      style: 'destructive',
                      onPress: () => deleteDopeEntry(entry.id),
                    },
                  ])
                }
                hitSlop={10}
                style={{ marginLeft: spacing.md }}
              >
                <Ionicons name="trash-outline" size={18} color={colors.textTertiary} />
              </Pressable>
            </View>
          </Card>
        ))
      )}

      {/* ---- Chrono strings ---- */}
      <View style={styles.sectionHeader}>
        <Text style={type.label}>Velocity strings</Text>
        <Pressable onPress={() => setShowChronoForm((s) => !s)} hitSlop={10}>
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
            <Field
              label="Velocities (fps)"
              value={shotsText}
              onChangeText={setShotsText}
              placeholder="2701 2698 2711 2695 2704"
              multiline
            />
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
          <Button label="Add String" onPress={saveString} />
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
                    onPress: () => deleteShotString(s.id),
                  },
                ])
              }
              hitSlop={10}
            >
              <Ionicons name="trash-outline" size={18} color={colors.textTertiary} />
            </Pressable>
          </View>
        </Card>
      ))}

      {rifle ? (
        <Button
          label="View Range Card"
          variant="secondary"
          onPress={() => router.push(`/range/cards/${rifle.id}`)}
          style={{ marginTop: spacing.lg }}
        />
      ) : null}
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
});
