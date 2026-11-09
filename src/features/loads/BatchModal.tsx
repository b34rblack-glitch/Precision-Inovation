import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/Buttons';
import { Field, Half, NumericField, Row } from '@/components/Form';
import { addBatch } from '@/db/repositories/batches';
import type { LoadVersion } from '@/db/schema';
import { DEFAULT_RUNOUT_THRESHOLD_IN, parseRunoutReadings, runoutStats } from '@/lib/batches/model';
import { parseDecimal } from '@/lib/parse';
import { colors, spacing, type } from '@/theme';

// Log one batch of rounds built from the current recipe: how many, which
// lots, and the runout readings as you read them off the gauge.

type Props = {
  visible: boolean;
  /** The recipe the rounds were built from; its lot fields prefill the sheet. */
  version: LoadVersion;
  onClose: () => void;
};

const str = (s: string): string | null => (s.trim() === '' ? null : s.trim());

export function BatchModal({ visible, version, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [quantity, setQuantity] = useState('');
  const [brassLot, setBrassLot] = useState('');
  const [powderLot, setPowderLot] = useState('');
  const [primerLot, setPrimerLot] = useState('');
  const [bulletLot, setBulletLot] = useState('');
  const [readings, setReadings] = useState('');
  const [avg, setAvg] = useState('');
  const [max, setMax] = useState('');
  const [threshold, setThreshold] = useState('2');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setQuantity('');
    setBrassLot(version.caseLotNumber ?? '');
    setPowderLot(version.powderLotNumber ?? '');
    setPrimerLot(version.primerLotNumber ?? '');
    setBulletLot(version.bulletLotNumber ?? '');
    setReadings('');
    setAvg('');
    setMax('');
    setThreshold('2');
    setNotes('');
    setError(undefined);
  }, [visible, version]);

  const parsed = parseRunoutReadings(readings);
  const thresholdIn = (parseDecimal(threshold) ?? DEFAULT_RUNOUT_THRESHOLD_IN * 1000) / 1000;
  const stats = parsed && parsed.length > 0 ? runoutStats(parsed, thresholdIn) : null;

  const save = async () => {
    if (parsed === null) {
      setError('Readings must be numbers, like 1 1.5 3 (thousandths) or 0.001 0.002.');
      return;
    }
    const qty = quantity.trim() ? parseDecimal(quantity) : null;
    const avgIn = avg.trim() ? parseDecimal(avg) : null;
    const maxIn = max.trim() ? parseDecimal(max) : null;
    setSaving(true);
    try {
      await addBatch({
        loadVersionId: version.id,
        date: new Date(),
        quantity: qty != null ? Math.round(qty) : null,
        brassLot: str(brassLot),
        powderLot: str(powderLot),
        primerLot: str(primerLot),
        bulletLot: str(bulletLot),
        runoutReadingsIn: parsed.length > 0 ? parsed : null,
        // A typed summary is in thousandths like the readings.
        runoutAvgIn: avgIn != null ? avgIn / 1000 : null,
        runoutMaxIn: maxIn != null ? maxIn / 1000 : null,
        runoutThresholdIn: thresholdIn,
        firedAt: null,
        notes: str(notes),
      });
      onClose();
    } catch (e) {
      Alert.alert('Save failed', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.root, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.header}>
          <Text style={type.title}>Log a batch</Text>
          <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
            <Ionicons name="close" size={26} color={colors.text} />
          </Pressable>
        </View>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: insets.bottom + spacing.xl }}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={[type.secondary, { marginBottom: spacing.md, color: colors.textTertiary }]}>
            Rounds built today from recipe v{version.versionNumber}. Lots are prefilled from the recipe;
            change what changed.
          </Text>
          <NumericField label="Rounds loaded" value={quantity} onChangeText={setQuantity} suffix="rds" integer placeholder="40" />
          <Row>
            <Half>
              <Field label="Brass lot / firings" value={brassLot} onChangeText={setBrassLot} placeholder="Lot 4823, 2x" />
            </Half>
            <Half>
              <Field label="Powder lot" value={powderLot} onChangeText={setPowderLot} placeholder="Lot 8021" />
            </Half>
          </Row>
          <Row>
            <Half>
              <Field label="Primer lot" value={primerLot} onChangeText={setPrimerLot} placeholder="Lot 91-2" />
            </Half>
            <Half>
              <Field label="Bullet lot" value={bulletLot} onChangeText={setBulletLot} placeholder="Lot 3390" />
            </Half>
          </Row>
          <Field
            label="Runout readings"
            value={readings}
            onChangeText={(v) => {
              setReadings(v);
              setError(undefined);
            }}
            multiline
            placeholder="1 1 2 1.5 3 1  (thousandths, or inches like 0.001)"
            keyboardType="numbers-and-punctuation"
            error={error}
          />
          {stats ? (
            <Text style={[type.secondary, { marginTop: -spacing.sm, marginBottom: spacing.lg }]}>
              {stats.n} readings · {+(stats.avgIn * 1000).toFixed(2)} avg · {+(stats.maxIn * 1000).toFixed(2)} max thou ·{' '}
              {stats.under}/{stats.n} under {+(thresholdIn * 1000).toFixed(1)}
            </Text>
          ) : null}
          <Row>
            <Half>
              <NumericField label="Match threshold" value={threshold} onChangeText={setThreshold} suffix="thou" />
            </Half>
            <Half>
              <View />
            </Half>
          </Row>
          {!stats ? (
            <>
              <Text style={[type.caption, { marginBottom: spacing.sm, color: colors.textTertiary }]}>
                No readings listed? Type the summary instead.
              </Text>
              <Row>
                <Half>
                  <NumericField label="Runout average" value={avg} onChangeText={setAvg} suffix="thou" placeholder="1.2" />
                </Half>
                <Half>
                  <NumericField label="Runout max" value={max} onChangeText={setMax} suffix="thou" placeholder="3" />
                </Half>
              </Row>
            </>
          ) : null}
          <Field label="Notes" value={notes} onChangeText={setNotes} multiline placeholder="New seating stem, brass annealed first…" />
          <Button label="Save Batch" onPress={save} loading={saving} />
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
});
