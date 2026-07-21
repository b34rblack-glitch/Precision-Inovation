import { useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/Buttons';
import { Half, NumericField, Row } from '@/components/Form';
import { DistanceUnit, distanceToYd, ydToDistance } from '@/lib/units';
import { parseDecimal } from '@/lib/parse';
import { colors, spacing, type } from '@/theme';

type Props = {
  visible: boolean;
  distanceUnit: DistanceUnit;
  /** Current values, canonical yards. */
  startYd: number;
  endYd: number;
  incrementYd: number;
  onClose: () => void;
  /** Values returned in canonical yards. */
  onApply: (startYd: number, endYd: number, incrementYd: number) => void;
};

const round = (v: number) => Math.round(v * 10) / 10;

export function CardDistancesModal({
  visible,
  distanceUnit,
  startYd,
  endYd,
  incrementYd,
  onClose,
  onApply,
}: Props) {
  const insets = useSafeAreaInsets();
  // Edited in the rifle's display unit; stored in yards.
  const [start, setStart] = useState(String(round(ydToDistance(startYd, distanceUnit))));
  const [end, setEnd] = useState(String(round(ydToDistance(endYd, distanceUnit))));
  const [step, setStep] = useState(String(round(ydToDistance(incrementYd, distanceUnit))));
  const [error, setError] = useState<string | undefined>();

  const apply = () => {
    const s = parseDecimal(start);
    const e = parseDecimal(end);
    const i = parseDecimal(step);
    if (s === null || e === null || i === null) {
      setError('Enter numbers for all three fields.');
      return;
    }
    if (s <= 0 || i <= 0) {
      setError('Start and step must be greater than 0.');
      return;
    }
    if (e <= s) {
      setError('End must be greater than start.');
      return;
    }
    const rows = (e - s) / i;
    if (rows > 200) {
      setError('That makes over 200 rows — use a larger step.');
      return;
    }
    onApply(
      distanceToYd(s, distanceUnit),
      distanceToYd(e, distanceUnit),
      distanceToYd(i, distanceUnit),
    );
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <Text style={type.heading}>Card Distances</Text>
          <Text style={[type.secondary, { marginTop: spacing.xs, marginBottom: spacing.md }]}>
            In {distanceUnit === 'yd' ? 'yards' : 'meters'}. Overrides the preset grid.
          </Text>
          <Row>
            <Half>
              <NumericField
                label="Start"
                value={start}
                onChangeText={(v) => {
                  setStart(v);
                  setError(undefined);
                }}
                suffix={distanceUnit}
              />
            </Half>
            <Half>
              <NumericField
                label="End"
                value={end}
                onChangeText={(v) => {
                  setEnd(v);
                  setError(undefined);
                }}
                suffix={distanceUnit}
              />
            </Half>
          </Row>
          <NumericField
            label="Step"
            value={step}
            onChangeText={(v) => {
              setStep(v);
              setError(undefined);
            }}
            suffix={distanceUnit}
          />
          {error ? (
            <Text style={{ color: colors.danger, marginBottom: spacing.sm }}>{error}</Text>
          ) : null}
          <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm }}>
            <Button label="Cancel" variant="secondary" onPress={onClose} style={{ flex: 1 }} />
            <Button label="Apply" onPress={apply} style={{ flex: 1 }} />
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
});
