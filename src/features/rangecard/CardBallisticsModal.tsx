import { useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/Buttons';
import { Half, NumericField, Row, Segmented } from '@/components/Form';
import { parseDecimal } from '@/lib/parse';
import { colors, spacing, type } from '@/theme';

// Advanced ballistics settings for one card: Coriolis (latitude + azimuth),
// incline fire, spin drift and logged-wind seeding. Bottom-sheet, same
// pattern as CardDistancesModal.

export type CardBallisticsValues = {
  latitudeDeg: number | null;
  azimuthDeg: number | null;
  inclineDeg: number | null;
  useLoggedWind: boolean;
  spinDriftEnabled: boolean;
};

type Errors = Partial<Record<'latitude' | 'azimuth' | 'incline', string>>;

type Props = {
  visible: boolean;
  latitudeDeg: number | null;
  azimuthDeg: number | null;
  inclineDeg: number | null;
  useLoggedWind: boolean;
  spinDriftEnabled: boolean;
  onClose: () => void;
  /** Numeric fields come back null when emptied (= effect off). */
  onApply: (values: CardBallisticsValues) => void;
};

type OnOff = 'On' | 'Off';

export function CardBallisticsModal({
  visible,
  latitudeDeg,
  azimuthDeg,
  inclineDeg,
  useLoggedWind,
  spinDriftEnabled,
  onClose,
  onApply,
}: Props) {
  const insets = useSafeAreaInsets();
  const [latitude, setLatitude] = useState(latitudeDeg?.toString() ?? '');
  const [azimuth, setAzimuth] = useState(azimuthDeg?.toString() ?? '');
  const [incline, setIncline] = useState(inclineDeg?.toString() ?? '');
  const [spinDrift, setSpinDrift] = useState<OnOff>(spinDriftEnabled ? 'On' : 'Off');
  const [loggedWind, setLoggedWind] = useState<OnOff>(useLoggedWind ? 'On' : 'Off');
  const [errors, setErrors] = useState<Errors>({});

  const clearError = (key: keyof Errors) =>
    setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));

  const apply = () => {
    const errs: Errors = {};
    // Empty clears the field (null = effect off); anything typed must parse
    // and sit inside its physical range.
    const num = (value: string, key: keyof Errors, min: number, max: number): number | null => {
      if (value.trim() === '') return null;
      const n = parseDecimal(value);
      if (n === null) {
        errs[key] = 'Enter a number like 33.4 — or leave blank.';
        return null;
      }
      if (n < min || n > max) {
        errs[key] = `Must be between ${min} and ${max}.`;
        return null;
      }
      return n;
    };
    const lat = num(latitude, 'latitude', -90, 90);
    const az = num(azimuth, 'azimuth', 0, 360);
    const inc = num(incline, 'incline', -60, 60);
    if (Object.values(errs).some(Boolean)) {
      setErrors(errs);
      return;
    }
    setErrors({});
    onApply({
      latitudeDeg: lat,
      azimuthDeg: az,
      inclineDeg: inc,
      useLoggedWind: loggedWind === 'On',
      spinDriftEnabled: spinDrift === 'On',
    });
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <Text style={type.heading}>Advanced Ballistics</Text>
          <Text style={[type.secondary, { marginTop: spacing.xs, marginBottom: spacing.md }]}>
            Coriolis needs both latitude and azimuth. Leave a field blank to turn its effect off.
          </Text>
          <Row>
            <Half>
              <NumericField
                label="Latitude"
                value={latitude}
                onChangeText={(v) => {
                  setLatitude(v);
                  clearError('latitude');
                }}
                suffix="°"
                signed
                placeholder="-90 to 90"
                error={errors.latitude}
              />
            </Half>
            <Half>
              <NumericField
                label="Azimuth"
                value={azimuth}
                onChangeText={(v) => {
                  setAzimuth(v);
                  clearError('azimuth');
                }}
                suffix="°"
                placeholder="0–360"
                error={errors.azimuth}
              />
            </Half>
          </Row>
          <Text style={styles.hint}>Azimuth: 0 = true north, 90 = east.</Text>
          <NumericField
            label="Incline"
            value={incline}
            onChangeText={(v) => {
              setIncline(v);
              clearError('incline');
            }}
            suffix="°"
            signed
            placeholder="-60 to 60, uphill +"
            error={errors.incline}
          />
          <Segmented
            label="Spin drift"
            options={['On', 'Off'] as const}
            value={spinDrift}
            onChange={setSpinDrift}
          />
          <Segmented
            label="Use logged wind"
            options={['On', 'Off'] as const}
            value={loggedWind}
            onChange={setLoggedWind}
          />
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
  hint: {
    ...type.caption,
    color: colors.textTertiary,
    marginTop: -spacing.sm,
    marginBottom: spacing.md,
  },
});
