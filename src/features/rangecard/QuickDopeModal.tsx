import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/Buttons';
import { Half, NumericField, Row, Segmented } from '@/components/Form';
import { parseDecimal } from '@/lib/parse';
import {
  DistanceUnit,
  distanceToYd,
  formatHold,
  inchesToMilAtRange,
  inchesToMoaAtRange,
  TurretUnit,
  ydToDistance,
} from '@/lib/units';
import { colors, spacing, touchTarget, type } from '@/theme';

// Log a hold the shooter just confirmed without leaving the range card —
// opened blank from "+ Log Hold", or prefilled by tapping the row that was
// shot. Bottom-sheet, same pattern as CardDistancesModal.

export type QuickDopeValues = {
  distanceYd: number;
  elevationHold: number | null;   // already converted to turretUnit
  windageHold: number | null;     // already converted to turretUnit
  confirmed: boolean;
};

type Errors = Partial<Record<'distance' | 'elevation' | 'windage', string>>;

type Props = {
  visible: boolean;
  distanceUnit: DistanceUnit;
  turretUnit: TurretUnit;
  /** Prefill distance (canonical yards) when opened from a row; null = blank. */
  initialDistanceYd?: number | null;
  /** The card's predicted elevation at that distance, in turretUnit — shown as a reference. */
  predictedElevation?: number | null;
  saving?: boolean;
  onClose: () => void;
  /** The sheet stays open — the parent closes it once the write lands. */
  onSubmit: (values: QuickDopeValues) => void;
};

export function QuickDopeModal({
  visible,
  distanceUnit,
  turretUnit,
  initialDistanceYd = null,
  predictedElevation = null,
  saving,
  onClose,
  onSubmit,
}: Props) {
  const insets = useSafeAreaInsets();
  // Distance is typed in the rifle's display unit and submitted in yards.
  const [distance, setDistance] = useState('');
  const [elevation, setElevation] = useState('');
  const [windage, setWindage] = useState('');
  // Holds entered either in the rifle's turret unit or in inches at the distance.
  const [holdEntryUnit, setHoldEntryUnit] = useState<TurretUnit | 'in'>(turretUnit);
  const [status, setStatus] = useState<'Confirmed' | 'Provisional'>('Confirmed');
  const [errors, setErrors] = useState<Errors>({});

  // Opening the sheet — or tapping a different row while it is open — starts a
  // fresh entry, so a previous hold can never be re-submitted against a new
  // distance.
  useEffect(() => {
    if (!visible) return;
    setDistance(
      // Rounded to whole units so the field reads back the same number the
      // tapped card row prints.
      initialDistanceYd == null
        ? ''
        : String(Math.round(ydToDistance(initialDistanceYd, distanceUnit))),
    );
    setElevation('');
    setWindage('');
    setHoldEntryUnit(turretUnit);
    setStatus('Confirmed');
    setErrors({});
  }, [visible, initialDistanceYd]);

  const clearError = (key: keyof Errors) =>
    setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));

  // The prediction is a dial value, so it only makes sense while entering in
  // the turret unit; it disappears once the shooter types a hold of their own.
  const predictedText =
    predictedElevation != null && holdEntryUnit !== 'in' && elevation.trim() === ''
      ? formatHold(predictedElevation, turretUnit)
      : null;

  const submit = () => {
    const errs: Errors = {};
    const d = parseDecimal(distance);
    if (d === null || d <= 0) errs.distance = 'Enter the distance you were shooting.';
    // Either hold may be left blank; anything typed has to parse.
    const hold = (value: string, key: 'elevation' | 'windage'): number | null => {
      if (value.trim() === '') return null;
      const n = parseDecimal(value);
      if (n === null) {
        errs[key] = 'Enter a number like 1.5 — or leave blank.';
        return null;
      }
      return n;
    };
    const elev = hold(elevation, 'elevation');
    const wind = hold(windage, 'windage');
    // A row with neither hold carries no DOPE — flag it on the field the
    // shooter reaches first.
    if (!errs.elevation && !errs.windage && elev === null && wind === null) {
      errs.elevation = 'Enter at least an elevation or windage.';
    }
    if (d === null || Object.values(errs).some(Boolean)) {
      setErrors(errs);
      return;
    }
    setErrors({});
    const rangeYd = distanceToYd(d, distanceUnit);
    // When entered in inches, convert the linear come-up at this distance to
    // the rifle's dial unit so DOPE is always handed over as a turret hold.
    const toHold = (v: number | null): number | null => {
      if (v === null || holdEntryUnit !== 'in') return v;
      return turretUnit === 'MIL'
        ? inchesToMilAtRange(v, rangeYd)
        : inchesToMoaAtRange(v, rangeYd);
    };
    onSubmit({
      distanceYd: rangeYd,
      elevationHold: toHold(elev),
      windageHold: toHold(wind),
      confirmed: status === 'Confirmed',
    });
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <Text style={type.heading}>Log Confirmed Hold</Text>
          <Text style={[type.secondary, { marginTop: spacing.xs, marginBottom: spacing.md }]}>
            A confirmed hold overrides the card's predicted elevation at that distance.
          </Text>
          <NumericField
            label="Distance"
            value={distance}
            onChangeText={(v) => {
              setDistance(v);
              clearError('distance');
            }}
            suffix={distanceUnit}
            error={errors.distance}
          />
          <Row>
            <Half>
              <NumericField
                label="Elevation"
                value={elevation}
                onChangeText={(v) => {
                  setElevation(v);
                  clearError('elevation');
                }}
                suffix={holdEntryUnit}
                error={errors.elevation}
                signed
              />
            </Half>
            <Half>
              <NumericField
                label="Windage"
                value={windage}
                onChangeText={(v) => {
                  setWindage(v);
                  clearError('windage');
                }}
                suffix={holdEntryUnit}
                error={errors.windage}
                signed
              />
            </Half>
          </Row>
          {predictedText ? (
            <View style={styles.predictedRow}>
              <Text style={styles.predicted}>
                Predicted: {predictedText} {turretUnit}
              </Text>
              <Pressable
                onPress={() => {
                  setElevation(predictedText);
                  clearError('elevation');
                }}
                accessibilityRole="button"
                accessibilityLabel={`Use predicted elevation ${predictedText} ${turretUnit}`}
                style={({ pressed }) => [styles.useBtn, pressed && { opacity: 0.6 }]}
              >
                <Text style={styles.useLabel}>Use</Text>
              </Pressable>
            </View>
          ) : null}
          <Segmented
            label="Enter holds in"
            options={[turretUnit, 'in'] as const}
            value={holdEntryUnit}
            onChange={setHoldEntryUnit}
          />
          {holdEntryUnit === 'in' ? (
            <Text style={styles.hint}>
              Inches of come-up/correction at this distance — converted to {turretUnit} using the
              distance.
            </Text>
          ) : null}
          <Segmented
            label="Status"
            options={['Confirmed', 'Provisional'] as const}
            value={status}
            onChange={setStatus}
          />
          <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm }}>
            <Button label="Cancel" variant="secondary" onPress={onClose} style={{ flex: 1 }} />
            <Button label="Log Hold" onPress={submit} loading={saving} style={{ flex: 1 }} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
  },
  hint: {
    ...type.caption,
    color: colors.textTertiary,
    marginTop: -spacing.sm,
    marginBottom: spacing.md,
  },
  predictedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: -spacing.md,
    marginBottom: spacing.sm,
  },
  predicted: { ...type.caption, color: colors.textTertiary, flex: 1 },
  useBtn: {
    minHeight: touchTarget,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    marginRight: -spacing.md,
  },
  useLabel: { color: colors.accent, fontSize: 15, fontWeight: '600' },
});
