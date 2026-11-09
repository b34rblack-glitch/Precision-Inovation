import { useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, View } from 'react-native';
import { colors, spacing, touchTarget, type } from '@/theme';

// A pure-JS slider (no native dependency) with one thumb or two. Thumbs are
// full touch targets, the track is thin, and the value reads above the
// track so the reader never has to guess what the handle means.

const THUMB = 28;

type Common = {
  label: string;
  min: number;
  max: number;
  /** Snap size in the value's own unit. */
  step: number;
  format?: (v: number) => string;
  disabled?: boolean;
};

type Props = Common &
  (
    | { mode: 'single'; value: number; onChange: (v: number) => void }
    | { mode: 'range'; value: readonly [number, number]; onChange: (v: [number, number]) => void }
  );

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function RangeSlider(props: Props) {
  const { label, min, max, step, disabled } = props;
  const format = props.format ?? ((v: number) => String(v));
  const [trackWidth, setTrackWidth] = useState(0);
  const span = max - min || 1;
  const usable = Math.max(1, trackWidth - THUMB);

  const snap = (v: number) => {
    const snapped = Math.round((v - min) / step) * step + min;
    // Avoid float drift such as 0.30000000000000004.
    const decimals = Math.max(0, Math.ceil(-Math.log10(step)));
    return Number(clamp(snapped, min, max).toFixed(decimals));
  };
  const toX = (v: number) => ((clamp(v, min, max) - min) / span) * usable;

  const lo = props.mode === 'range' ? props.value[0] : min;
  const hi = props.mode === 'range' ? props.value[1] : props.value;

  // PanResponder callbacks are created once, so they read the live values
  // through refs rather than closing over a stale render.
  const live = useRef({ lo, hi, usable, span, props });
  live.current = { lo, hi, usable, span, props };

  const commit = (which: 'lo' | 'hi', v: number) => {
    const { props: p, lo: l, hi: h } = live.current;
    if (p.mode === 'single') {
      p.onChange(v);
      return;
    }
    const next: [number, number] = which === 'lo' ? [Math.min(v, h), h] : [l, Math.max(v, l)];
    if (next[0] !== l || next[1] !== h) p.onChange(next);
  };

  const makeResponder = (which: 'lo' | 'hi') => {
    const startX = { current: 0 };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => !live.current.props.disabled,
      onMoveShouldSetPanResponder: () => !live.current.props.disabled,
      onPanResponderGrant: () => {
        const { lo: l, hi: h, usable: u, span: s } = live.current;
        const v = which === 'lo' ? l : h;
        startX.current = ((clamp(v, min, max) - min) / s) * u;
      },
      onPanResponderMove: (_e, g) => {
        const { usable: u, span: s } = live.current;
        const x = clamp(startX.current + g.dx, 0, u);
        commit(which, snap(min + (x / u) * s));
      },
      onPanResponderTerminationRequest: () => false,
    });
  };
  const loResponder = useRef(makeResponder('lo')).current;
  const hiResponder = useRef(makeResponder('hi')).current;

  const nudge = (which: 'lo' | 'hi', dir: 1 | -1) => {
    const v = which === 'lo' ? lo : hi;
    commit(which, snap(v + dir * step));
  };

  const readout =
    props.mode === 'range' ? `${format(lo)} – ${format(hi)}` : format(hi);

  const thumb = (which: 'lo' | 'hi', value: number, responder: ReturnType<typeof PanResponder.create>) => (
    <View
      {...responder.panHandlers}
      style={[styles.thumbHit, { left: toX(value) - (touchTarget - THUMB) / 2 }, disabled && { opacity: 0.4 }]}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={`${label} ${props.mode === 'range' ? (which === 'lo' ? 'from' : 'to') : ''}`.trim()}
      accessibilityValue={{ text: format(value) }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'increment') nudge(which, 1);
        if (e.nativeEvent.actionName === 'decrement') nudge(which, -1);
      }}
    >
      <View style={styles.thumb} />
    </View>
  );

  return (
    <View style={styles.root}>
      <View style={styles.labelRow}>
        <Text style={type.label}>{label}</Text>
        <Text style={[type.secondary, type.mono]}>{readout}</Text>
      </View>
      <View style={styles.trackArea} onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}>
        <View style={styles.track} />
        {trackWidth > 0 ? (
          <>
            <View
              style={[
                styles.fill,
                {
                  left: (props.mode === 'range' ? toX(lo) : 0) + THUMB / 2,
                  width: Math.max(0, toX(hi) - (props.mode === 'range' ? toX(lo) : 0)),
                },
              ]}
            />
            {props.mode === 'range' ? thumb('lo', lo, loResponder) : null}
            {thumb('hi', hi, hiResponder)}
          </>
        ) : null}
      </View>
      {props.mode === 'range' ? (
        <View style={styles.labelRow}>
          <Text style={type.caption}>{format(min)}</Text>
          <Text style={type.caption}>{format(max)}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { marginBottom: spacing.md },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  trackArea: { height: touchTarget, justifyContent: 'center' },
  track: { height: 4, borderRadius: 2, backgroundColor: colors.border, marginHorizontal: THUMB / 2 },
  fill: { position: 'absolute', height: 4, borderRadius: 2, backgroundColor: colors.accent },
  thumbHit: {
    position: 'absolute',
    width: touchTarget,
    height: touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: colors.accent,
    borderWidth: 2,
    borderColor: colors.bg,
  },
});
