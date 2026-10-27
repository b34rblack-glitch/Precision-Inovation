import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/Buttons';
import type { BackupSummary, ImportSelection } from '@/lib/share';
import { colors, radii, spacing, touchTarget, type } from '@/theme';

type Props = {
  visible: boolean;
  summary: BackupSummary | null;
  busy: boolean;
  onClose: () => void;
  onConfirm: (selection: ImportSelection) => void;
};

/**
 * Pick which rifles in a backup or share file to add next to the data already
 * on this phone. Every rifle is pre-selected (a shared file usually holds just
 * one); loads with no rifle are opt-in.
 */
export function AddFromBackupModal({ visible, summary, busy, onClose, onConfirm }: Props) {
  const insets = useSafeAreaInsets();
  const [rifleIds, setRifleIds] = useState<Set<string>>(new Set());
  const [unattached, setUnattached] = useState(false);

  useEffect(() => {
    setRifleIds(new Set(summary?.rifles.map((r) => r.id) ?? []));
    setUnattached(false);
  }, [summary]);

  const toggleRifle = (id: string) => {
    setRifleIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const rifles = summary?.rifles ?? [];
  const selectedCount = rifleIds.size + (unattached ? 1 : 0);
  const title = summary?.share ? 'Add shared rifle' : 'Add from backup';

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={busy ? undefined : onClose}>
      <View style={[styles.root, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.header}>
          <Text style={type.title}>{title}</Text>
          <Pressable
            onPress={onClose}
            disabled={busy}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Close"
            style={styles.closeBtn}
          >
            <Ionicons name="close" size={26} color={colors.text} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.list}>
          <Text style={[type.secondary, { marginBottom: spacing.md }]}>
            Everything already in the app stays as it is. The rifles you tick are added as new
            entries with their loads, range sessions, DOPE and range cards.
          </Text>

          {rifles.length === 0 ? (
            <Text style={[type.secondary, styles.empty]}>This file has no rifles in it.</Text>
          ) : (
            rifles.map((r) => {
              const on = rifleIds.has(r.id);
              return (
                <Pressable
                  key={r.id}
                  onPress={() => toggleRifle(r.id)}
                  disabled={busy}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={r.name}
                  style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                >
                  <Ionicons
                    name={on ? 'checkbox' : 'square-outline'}
                    size={24}
                    color={on ? colors.accent : colors.textTertiary}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={type.body}>{r.name}</Text>
                    <Text style={[type.secondary, { marginTop: 2 }]}>
                      {r.loads} {r.loads === 1 ? 'load' : 'loads'} · {r.sessions}{' '}
                      {r.sessions === 1 ? 'session' : 'sessions'}
                      {r.archived ? ' · archived' : ''}
                    </Text>
                  </View>
                </Pressable>
              );
            })
          )}

          {summary && summary.unattachedLoads > 0 ? (
            <Pressable
              onPress={() => setUnattached((v) => !v)}
              disabled={busy}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: unattached }}
              accessibilityLabel="Loads not assigned to a rifle"
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            >
              <Ionicons
                name={unattached ? 'checkbox' : 'square-outline'}
                size={24}
                color={unattached ? colors.accent : colors.textTertiary}
              />
              <View style={{ flex: 1 }}>
                <Text style={type.body}>Loads not assigned to a rifle</Text>
                <Text style={[type.secondary, { marginTop: 2 }]}>
                  {summary.unattachedLoads} {summary.unattachedLoads === 1 ? 'load' : 'loads'}
                </Text>
              </View>
            </Pressable>
          ) : null}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
          <Text style={[type.secondary, { marginBottom: spacing.md, fontSize: 12 }]}>
            Imported rifles get new ids, so adding the same file twice makes two copies. Photos do
            not travel in the file.
          </Text>
          <Button
            label={
              selectedCount === 0
                ? 'Nothing selected'
                : `Add ${selectedCount} ${selectedCount === 1 ? 'item' : 'items'}`
            }
            onPress={() => onConfirm({ rifleIds: [...rifleIds], includeUnattachedLoads: unattached })}
            loading={busy}
            disabled={selectedCount === 0}
          />
        </View>
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
  closeBtn: { padding: spacing.xs },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    minHeight: touchTarget,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowPressed: { backgroundColor: colors.surface, borderRadius: radii.md },
  empty: { textAlign: 'center', paddingVertical: spacing.xxl },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
