import { Ionicons } from '@expo/vector-icons';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useKeepAwake } from 'expo-keep-awake';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { rifleByIdQuery } from '@/db/repositories/rifles';
import { useRangeCard } from '@/features/rangecard/useRangeCard';
import { formatHold, ydToDistance } from '@/lib/units';
import { colors } from '@/theme';

// Field mode: the card you actually read from a shooting position. Max
// contrast (amber on black), huge tabular digits, screen stays awake.

export default function FieldCardScreen() {
  useKeepAwake();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { rifleId, loadVersionId } = useLocalSearchParams<{
    rifleId: string;
    loadVersionId?: string;
  }>();
  const { data: rifleRows } = useLiveQuery(rifleByIdQuery(rifleId), [rifleId]);
  const rifle = rifleRows[0];
  const { rows, status } = useRangeCard(rifle, loadVersionId ?? null);

  if (!rifle) return <View style={styles.root} />;

  const unitWord = rifle.distanceUnit === 'yd' ? 'yards' : 'meters';
  // DRIFT column (spin + Coriolis hold) renders only when the effect is
  // actually visible — field mode stays as sparse as possible otherwise.
  const driftActive = rows.some((r) => Math.abs(r.driftIn) > 0.05);

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} maxFontSizeMultiplier={1.2}>
            {rifle.name.toUpperCase()}
          </Text>
          <Text style={styles.subtitle}>
            {rifle.turretUnit} · W10 = full value 10 mph · screen stays awake
          </Text>
          <Text style={styles.legend}>
            <Text style={{ color: colors.fieldText }}>●</Text> bright = confirmed · dim =
            predicted · ‡ transonic · ‡‡ subsonic
          </Text>
        </View>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Close field card"
          style={styles.closeBtn}
        >
          <Ionicons name="close" size={30} color={colors.fieldText} />
        </Pressable>
      </View>

      {status === 'ready' ? (
        <>
          <View style={styles.colHeader}>
            <Text style={styles.colHeadDist}>DIST</Text>
            <Text style={styles.colHeadHold}>ELEV</Text>
            <Text style={styles.colHeadWind}>W10</Text>
            {driftActive ? <Text style={styles.colHeadDrift}>DRIFT</Text> : null}
          </View>
          <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
            {rows.map((r) => {
              const dist = Math.round(ydToDistance(r.distanceYd, rifle.distanceUnit));
              const subsonic = r.mach < 1.0;
              const transonic = r.mach < 1.2;
              const machMark = subsonic ? ' ‡‡' : transonic ? ' ‡' : '';
              const machWord = subsonic ? ', subsonic' : transonic ? ', transonic' : '';
              // Only dim *predictions* in the transonic zone — confirmed DOPE
              // stays bright because it was actually observed.
              const dimPred = transonic && !r.confirmed;
              // DRIFT is the HOLD for spin + Coriolis: driftIn > 0 = impact
              // drifts RIGHT → hold LEFT ('L'); negative → hold RIGHT ('R').
              const driftVal = rifle.turretUnit === 'MIL' ? r.driftMil : r.driftMoa;
              const driftHold = formatHold(Math.abs(driftVal), rifle.turretUnit);
              const driftDir = r.driftIn > 0 ? 'L' : 'R';
              const driftWord = driftActive
                ? `, drift hold ${driftHold} ${driftDir === 'L' ? 'left' : 'right'}`
                : '';
              return (
                <View
                  key={r.distanceYd}
                  accessible={true}
                  accessibilityLabel={`${dist} ${unitWord}, hold ${formatHold(r.elevation, rifle.turretUnit)} ${rifle.turretUnit}, ${r.confirmed ? 'confirmed' : 'predicted'}, wind ten ${formatHold(r.wind10Mph, rifle.turretUnit)} ${rifle.turretUnit}${driftWord}${machWord}`}
                  style={[styles.row, dimPred && styles.transonicRow]}
                >
                  <Text style={styles.dist} maxFontSizeMultiplier={1.2}>
                    {dist}
                    <Text style={styles.machMark}>{machMark}</Text>
                  </Text>
                  <Text
                    style={[styles.hold, !r.confirmed && styles.holdPred]}
                    maxFontSizeMultiplier={1.2}
                  >
                    {formatHold(r.elevation, rifle.turretUnit)}
                    <Text style={styles.marker}>{r.confirmed ? ' ●' : ''}</Text>
                  </Text>
                  <Text style={styles.wind} maxFontSizeMultiplier={1.2}>
                    {formatHold(r.wind10Mph, rifle.turretUnit)}
                  </Text>
                  {driftActive ? (
                    <Text style={styles.drift} maxFontSizeMultiplier={1.2}>
                      {driftHold}
                      <Text style={styles.driftDir}>{` ${driftDir}`}</Text>
                    </Text>
                  ) : null}
                </View>
              );
            })}
          </ScrollView>
        </>
      ) : status === 'loading' ? (
        <ActivityIndicator color={colors.fieldText} style={{ marginTop: 48 }} />
      ) : (
        <Text style={styles.subtitle}>
          Card unavailable — set up bullet BC and muzzle velocity first.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.fieldBg, paddingHorizontal: 20 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  title: { color: colors.fieldText, fontSize: 22, fontWeight: '900', letterSpacing: 1 },
  subtitle: { color: '#B38600', fontSize: 13, marginTop: 2 },
  legend: { color: colors.predicted, fontSize: 11, marginTop: 3 },
  closeBtn: { padding: 9 },
  colHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#332800',
    paddingBottom: 6,
  },
  colHeadDist: { minWidth: 92, color: '#B38600', fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  colHeadHold: {
    flex: 1,
    textAlign: 'right',
    color: '#B38600',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
  colHeadWind: {
    minWidth: 92,
    textAlign: 'right',
    color: '#B38600',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
  colHeadDrift: {
    minWidth: 76,
    textAlign: 'right',
    color: '#8F6D00',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
    borderBottomWidth: 1,
    borderBottomColor: '#332800',
    paddingVertical: 10,
  },
  transonicRow: { opacity: 0.55 },
  dist: {
    minWidth: 92,
    flexShrink: 0,
    color: colors.fieldText,
    fontSize: 30,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  hold: {
    flex: 1,
    flexShrink: 1,
    color: colors.fieldText,
    fontSize: 44,
    fontWeight: '900',
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  holdPred: { color: colors.predicted, opacity: 0.6 },
  marker: { fontSize: 20 },
  machMark: { fontSize: 16, color: '#B38600' },
  wind: {
    minWidth: 92,
    flexShrink: 0,
    color: '#B38600',
    fontSize: 26,
    fontWeight: '700',
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  // Deliberately dimmer + smaller than W10: drift is a secondary correction.
  drift: {
    minWidth: 76,
    flexShrink: 0,
    color: '#8F6D00',
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  driftDir: { fontSize: 14 },
});
