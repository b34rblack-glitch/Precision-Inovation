import { Ionicons } from '@expo/vector-icons';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useKeepAwake } from 'expo-keep-awake';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{rifle.name.toUpperCase()}</Text>
          <Text style={styles.subtitle}>
            {rifle.turretUnit} · W10 = full value 10 mph
          </Text>
        </View>
        <Pressable onPress={() => router.back()} hitSlop={16} style={styles.closeBtn}>
          <Ionicons name="close" size={30} color={colors.fieldText} />
        </Pressable>
      </View>

      {status === 'ready' ? (
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
          {rows.map((r) => (
            <View key={r.distanceYd} style={styles.row}>
              <Text style={styles.dist}>
                {Math.round(ydToDistance(r.distanceYd, rifle.distanceUnit))}
              </Text>
              <Text style={[styles.hold, !r.confirmed && styles.holdPred]}>
                {formatHold(r.elevation, rifle.turretUnit)}
                <Text style={styles.marker}>{r.confirmed ? ' ●' : ''}</Text>
              </Text>
              <Text style={styles.wind}>{formatHold(r.wind10Mph, rifle.turretUnit)}</Text>
            </View>
          ))}
        </ScrollView>
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
  closeBtn: { padding: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
    borderBottomWidth: 1,
    borderBottomColor: '#332800',
    paddingVertical: 10,
  },
  dist: {
    width: 92,
    color: colors.fieldText,
    fontSize: 30,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  hold: {
    flex: 1,
    color: colors.fieldText,
    fontSize: 44,
    fontWeight: '900',
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  holdPred: { color: '#C9A227' },
  marker: { fontSize: 20 },
  wind: {
    width: 92,
    color: '#B38600',
    fontSize: 26,
    fontWeight: '700',
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
});
