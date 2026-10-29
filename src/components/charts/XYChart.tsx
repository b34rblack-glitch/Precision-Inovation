import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Polyline, Rect, Text as SvgText } from 'react-native-svg';
import { colors, spacing, type } from '@/theme';

// One x/y plot for the comparison screen: lines or dots per series, recessive
// grid, one y axis (never two), and a tap readout. Tapping or dragging across
// the plot snaps a hairline to the nearest x and lists every series there, so
// a value never has to be read off a 2 px line.

export type XYPoint = { x: number; y: number };

export type XYSeries = {
  key: string;
  label: string;
  color: string;
  points: XYPoint[];
  /** Join the points with a line (false = dots only). */
  connect?: boolean;
};

type Props = {
  series: XYSeries[];
  height?: number;
  xFormat?: (x: number) => string;
  yFormat?: (y: number) => string;
  /** Tick labels on the x axis; the data's extremes are always shown. */
  xTicks?: number;
  yTicks?: number;
  emptyText?: string;
};

const W = 340;
const PAD = { left: 44, right: 14, top: 14, bottom: 30 };

/** Evenly spaced tick values from lo to hi inclusive. */
function ticks(lo: number, hi: number, n: number): number[] {
  if (n < 2 || hi === lo) return [lo];
  return Array.from({ length: n }, (_, i) => lo + ((hi - lo) * i) / (n - 1));
}

export function XYChart({
  series,
  height = 200,
  xFormat = (x) => String(Math.round(x)),
  yFormat = (y) => String(Math.round(y)),
  xTicks = 4,
  yTicks = 4,
  emptyText = 'Nothing to plot for the current filters.',
}: Props) {
  const [picked, setPicked] = useState<number | null>(null);
  const [width, setWidth] = useState(W);
  const drawn = series.filter((s) => s.points.length > 0);
  const all = drawn.flatMap((s) => s.points);
  if (all.length === 0) {
    return <Text style={[type.secondary, styles.empty]}>{emptyText}</Text>;
  }

  const H = height;
  let minX = Math.min(...all.map((p) => p.x));
  let maxX = Math.max(...all.map((p) => p.x));
  let minY = Math.min(...all.map((p) => p.y));
  let maxY = Math.max(...all.map((p) => p.y));
  // A flat series still needs a band to sit in.
  if (minX === maxX) {
    minX -= 1;
    maxX += 1;
  }
  if (minY === maxY) {
    minY -= 1;
    maxY += 1;
  } else {
    const padY = (maxY - minY) * 0.08;
    minY -= padY;
    maxY += padY;
  }
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const sx = (x: number) => PAD.left + ((x - minX) / (maxX - minX)) * plotW;
  const sy = (y: number) => PAD.top + plotH - ((y - minY) / (maxY - minY)) * plotH;

  // Candidate x positions for the readout: every distinct data x.
  const xs = [...new Set(all.map((p) => p.x))].sort((a, b) => a - b);
  const pickAt = (locationX: number) => {
    const dataX = minX + ((locationX * (W / width) - PAD.left) / plotW) * (maxX - minX);
    let best = xs[0]!;
    for (const x of xs) if (Math.abs(x - dataX) < Math.abs(best - dataX)) best = x;
    setPicked(best);
  };
  const nearest = (s: XYSeries, x: number): XYPoint | null => {
    let best: XYPoint | null = null;
    for (const p of s.points) if (!best || Math.abs(p.x - x) < Math.abs(best.x - x)) best = p;
    return best;
  };

  return (
    <View>
      <View
        onLayout={(e) => setWidth(e.nativeEvent.layout.width || W)}
        onTouchStart={(e) => pickAt(e.nativeEvent.locationX)}
        onTouchMove={(e) => pickAt(e.nativeEvent.locationX)}
        accessible
        accessibilityRole="image"
        accessibilityLabel={`Chart with ${drawn.length} series. Values are listed in the table below.`}
      >
        <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
          {ticks(minY, maxY, yTicks).map((t) => (
            <Line
              key={`gy${t}`}
              x1={PAD.left}
              x2={W - PAD.right}
              y1={sy(t)}
              y2={sy(t)}
              stroke={colors.border}
              strokeWidth={StyleSheet.hairlineWidth}
            />
          ))}
          {ticks(minY, maxY, yTicks).map((t) => (
            <SvgText key={`ly${t}`} x={PAD.left - 6} y={sy(t) + 3.5} fill={colors.textSecondary} fontSize={10} textAnchor="end">
              {yFormat(t)}
            </SvgText>
          ))}
          <Line x1={PAD.left} x2={W - PAD.right} y1={PAD.top + plotH} y2={PAD.top + plotH} stroke={colors.border} strokeWidth={1} />
          {ticks(minX, maxX, xTicks).map((t) => (
            <SvgText key={`lx${t}`} x={sx(t)} y={H - 10} fill={colors.textSecondary} fontSize={10} textAnchor="middle">
              {xFormat(t)}
            </SvgText>
          ))}
          {picked !== null ? (
            <Line x1={sx(picked)} x2={sx(picked)} y1={PAD.top} y2={PAD.top + plotH} stroke={colors.textTertiary} strokeWidth={1} strokeDasharray="3 3" />
          ) : null}
          {drawn.map((s) =>
            s.connect !== false && s.points.length > 1 ? (
              <Polyline
                key={`l${s.key}`}
                points={s.points.map((p) => `${sx(p.x)},${sy(p.y)}`).join(' ')}
                fill="none"
                stroke={s.color}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ) : null,
          )}
          {drawn.map((s) =>
            s.points.map((p, i) => (
              <Circle
                key={`${s.key}-${i}`}
                cx={sx(p.x)}
                cy={sy(p.y)}
                r={picked === p.x ? 5 : 4}
                fill={s.color}
                stroke={colors.surface}
                strokeWidth={2}
              />
            )),
          )}
          <Rect x={0} y={0} width={W} height={H} fill="transparent" />
        </Svg>
      </View>
      {picked !== null ? (
        <View style={styles.readout}>
          <Text style={[type.caption, { marginBottom: 2 }]}>at {xFormat(picked)}</Text>
          {drawn.map((s) => {
            const p = nearest(s, picked);
            if (!p) return null;
            const exact = p.x === picked;
            return (
              <View key={s.key} style={styles.readoutRow}>
                <View style={[styles.swatch, { backgroundColor: s.color }]} />
                <Text style={[type.body, type.mono]}>{yFormat(p.y)}</Text>
                <Text style={[type.secondary, { flex: 1 }]} numberOfLines={1}>
                  {s.label}
                  {exact ? '' : ` (nearest, at ${xFormat(p.x)})`}
                </Text>
              </View>
            );
          })}
        </View>
      ) : (
        <Text style={[type.caption, styles.hint]}>Tap the chart to read values.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { paddingVertical: spacing.lg, color: colors.textTertiary },
  readout: { marginTop: spacing.sm, gap: 2 },
  readoutRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  swatch: { width: 14, height: 3, borderRadius: 2 },
  hint: { marginTop: spacing.sm, color: colors.textTertiary },
});
