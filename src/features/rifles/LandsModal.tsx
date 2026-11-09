import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/Buttons';
import { Chip } from '@/components/Chip';
import { Field, Half, NumericField, Row } from '@/components/Form';
import { addLandsMeasurement } from '@/db/repositories/lands';
import { parseDecimal } from '@/lib/parse';
import { colors, spacing, type } from '@/theme';

// Log one distance-to-lands reading for a rifle: which bullet, the
// cartridge-base-to-ogive it touched at, and the round count at the time so
// the series reads as throat erosion later.

export type BulletChoice = { make: string; model: string; weightGr: number | null };

type Props = {
  visible: boolean;
  rifleId: string;
  /** Bullets this rifle's loads already use, offered as one-tap prefills. */
  bullets: readonly BulletChoice[];
  /** Today's round count, prefilled so the entry dates itself in rounds. */
  roundCountNow: number;
  /** The comparator insert recorded with the rifle's headspace, as a default. */
  defaultInsert?: string | null;
  onClose: () => void;
};

const str = (s: string): string | null => (s.trim() === '' ? null : s.trim());

export function LandsModal({ visible, rifleId, bullets, roundCountNow, defaultInsert, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [weight, setWeight] = useState('');
  const [cbto, setCbto] = useState('');
  const [insert, setInsert] = useState('');
  const [rounds, setRounds] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  // Fresh form each time it opens.
  useEffect(() => {
    if (!visible) return;
    setMake('');
    setModel('');
    setWeight('');
    setCbto('');
    setInsert(defaultInsert ?? '');
    setRounds(String(roundCountNow));
    setNotes('');
    setError(undefined);
  }, [visible, roundCountNow, defaultInsert]);

  const save = async () => {
    const cbtoIn = parseDecimal(cbto);
    if (cbtoIn === null || cbtoIn <= 0) {
      setError('Enter the CBTO the bullet touched at, like 2.931');
      return;
    }
    const weightGr = weight.trim() === '' ? null : parseDecimal(weight);
    const roundCount = rounds.trim() === '' ? null : parseDecimal(rounds);
    setSaving(true);
    try {
      await addLandsMeasurement({
        rifleId,
        bulletMake: str(make),
        bulletModel: str(model),
        bulletWeightGr: weightGr,
        cbtoIn,
        comparatorInsert: str(insert),
        measuredAt: new Date(),
        roundCount: roundCount != null ? Math.round(roundCount) : null,
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
          <Text style={type.title}>Distance to lands</Text>
          <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
            <Ionicons name="close" size={26} color={colors.text} />
          </Pressable>
        </View>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: insets.bottom + spacing.xl }}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={[type.secondary, { marginBottom: spacing.md, color: colors.textTertiary }]}>
            Seat a bullet long in a modified case, chamber it, and measure base to ogive with the
            comparator. Take two or three readings and enter the one that repeats.
          </Text>
          {bullets.length > 0 ? (
            <View style={styles.chipWrap}>
              {bullets.map((b) => {
                const label = [b.make, b.model, b.weightGr != null ? `${b.weightGr} gr` : null].filter(Boolean).join(' ');
                const selected = make === b.make && model === b.model && (b.weightGr == null ? weight === '' : weight === String(b.weightGr));
                return (
                  <Chip
                    key={label}
                    label={label}
                    selected={selected}
                    onPress={() => {
                      setMake(b.make);
                      setModel(b.model);
                      setWeight(b.weightGr != null ? String(b.weightGr) : '');
                    }}
                  />
                );
              })}
            </View>
          ) : null}
          <Row>
            <Half>
              <Field label="Bullet make" value={make} onChangeText={setMake} placeholder="Hornady" autoCapitalize="words" />
            </Half>
            <Half>
              <Field label="Bullet model" value={model} onChangeText={setModel} placeholder="ELD-X" />
            </Half>
          </Row>
          <Row>
            <Half>
              <NumericField label="Weight" value={weight} onChangeText={setWeight} suffix="gr" />
            </Half>
            <Half>
              <NumericField
                label="Touch CBTO *"
                value={cbto}
                onChangeText={(v) => {
                  setCbto(v);
                  setError(undefined);
                }}
                suffix="in"
                placeholder="2.931"
                error={error}
              />
            </Half>
          </Row>
          <Row>
            <Half>
              <Field label="Comparator insert" value={insert} onChangeText={setInsert} placeholder="Hornady #30" />
            </Half>
            <Half>
              <NumericField label="Round count" value={rounds} onChangeText={setRounds} suffix="rds" integer />
            </Half>
          </Row>
          <Field label="Notes" value={notes} onChangeText={setNotes} multiline placeholder="All three readings, who measured…" />
          <Button label="Save Measurement" onPress={save} loading={saving} />
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
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
});
