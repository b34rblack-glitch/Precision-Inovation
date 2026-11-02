import { useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/Buttons';
import { colors, radii, spacing, touchTarget, type } from '@/theme';

// The second of two confirmations for a permanent delete: the name must be
// typed back exactly. The first confirmation (an alert listing what goes)
// happens before this opens.

type Props = {
  visible: boolean;
  /** What is being deleted, e.g. "rifle". */
  noun: string;
  name: string;
  /** What goes with it, in words; may be empty. */
  takesWith: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ConfirmDeleteModal({ visible, noun, name, takesWith, busy, onCancel, onConfirm }: Props) {
  const insets = useSafeAreaInsets();
  const [typed, setTyped] = useState('');
  useEffect(() => {
    if (visible) setTyped('');
  }, [visible]);
  const matches = typed.trim() === name.trim();

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <Text style={type.heading}>Delete this {noun} for good?</Text>
          <Text style={[type.secondary, { marginTop: spacing.sm }]}>
            {takesWith
              ? `This removes the ${noun} and ${takesWith}. It also removes them from any device you sync with.`
              : `This removes the ${noun}. It also removes it from any device you sync with.`}{' '}
            A safety copy of all your data is written to the app's cache first.
          </Text>
          <Text style={[type.label, { marginTop: spacing.lg }]}>Type the name to confirm</Text>
          <Text style={[type.secondary, { marginTop: 2, marginBottom: spacing.xs }]} selectable>
            {name}
          </Text>
          <TextInput
            style={styles.input}
            value={typed}
            onChangeText={setTyped}
            placeholder={name}
            placeholderTextColor={colors.textTertiary}
            autoCorrect={false}
            autoCapitalize="none"
            autoFocus
            accessibilityLabel="Type the name to confirm"
          />
          <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg }}>
            <Button label="Cancel" variant="secondary" onPress={onCancel} disabled={busy} style={{ flex: 1 }} />
            <Button label="Delete" variant="danger" onPress={onConfirm} disabled={!matches} loading={busy} style={{ flex: 1 }} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    padding: spacing.xl,
  },
  input: {
    minHeight: touchTarget,
    color: colors.text,
    fontSize: 16,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: radii.md,
  },
});
