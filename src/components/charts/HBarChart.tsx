import { StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, type } from '@/theme';

// Horizontal bars for one magnitude per load. Plain views: a bar is a
// rectangle, and views give free accessibility and no SVG scaling to fight.
// Direct value labels on every bar, text in text tokens, colour on the mark.

export type HBarRow = {
  key: string;
  label: string;
  color: string;
  value: number;
  /** The value as the reader should see it. */
  valueText: string;
  /** Secondary note after the value (e.g. "SD 6 · 15 shots"). */
  detail?: string;
};

type Props = {
  rows: HBarRow[];
  /** Bars grow from this value instead of zero; useful for velocities that all sit near 2800. */
  baseline?: number;
  emptyText?: string;
};

export function HBarChart({ rows, baseline, emptyText = 'Nothing to plot for the current filters.' }: Props) {
  if (rows.length === 0) return <Text style={[type.secondary, styles.empty]}>{emptyText}</Text>;
  const lo = baseline ?? 0;
  const hi = Math.max(...rows.map((r) => r.value), lo + 1e-9);
  return (
    <View style={{ gap: spacing.sm }}>
      {rows.map((r) => {
        const frac = Math.max(0.02, (r.value - lo) / (hi - lo));
        return (
          <View key={r.key} accessible accessibilityLabel={`${r.label}: ${r.valueText}${r.detail ? `, ${r.detail}` : ''}`}>
            <View style={styles.labelRow}>
              <View style={[styles.dot, { backgroundColor: r.color }]} />
              <Text style={[type.secondary, { flex: 1 }]} numberOfLines={1}>
                {r.label}
              </Text>
              <Text style={[type.body, type.mono]}>{r.valueText}</Text>
            </View>
            <View style={styles.track}>
              <View style={[styles.bar, { width: `${Math.round(frac * 100)}%`, backgroundColor: r.color }]} />
            </View>
            {r.detail ? <Text style={[type.caption, { marginTop: 2 }]}>{r.detail}</Text> : null}
          </View>
        );
      })}
      {baseline != null ? (
        <Text style={[type.caption, { color: colors.textTertiary }]}>Bars start at {Math.round(baseline)}.</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { paddingVertical: spacing.lg, color: colors.textTertiary },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 4 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  track: { height: 10, borderRadius: radii.sm, backgroundColor: colors.surfaceRaised, overflow: 'hidden' },
  bar: { height: 10, borderRadius: radii.sm },
});
