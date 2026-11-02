import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/Card';
import { colors, spacing, type } from '@/theme';

// "Show archived" at the foot of a list: the archived rows, dimmed, each with
// Unarchive. Tap a row to open it (the detail screen shows Unarchive and
// Delete too); nothing here deletes.

export type ArchivedRow = { id: string; title: string; subtitle?: string | null; archivedAt: Date | null };

type Props = {
  noun: string;
  rows: readonly ArchivedRow[];
  onOpen?: (id: string) => void;
  onUnarchive: (id: string) => Promise<void>;
};

export function ArchivedSection({ noun, rows, onOpen, onUnarchive }: Props) {
  const [open, setOpen] = useState(false);
  if (rows.length === 0) return null;
  const restore = (row: ArchivedRow) =>
    onUnarchive(row.id).catch((e) => Alert.alert('Could not unarchive', e instanceof Error ? e.message : String(e)));
  return (
    <View style={{ marginTop: spacing.lg }}>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        style={styles.toggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <Text style={type.label}>
          {open ? 'Hide' : 'Show'} archived ({rows.length})
        </Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textSecondary} />
      </Pressable>
      {open
        ? rows.map((row) => (
            <Card key={row.id} onPress={onOpen ? () => onOpen(row.id) : undefined} style={styles.card}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                <View style={{ flex: 1 }}>
                  <Text style={[type.body, { color: colors.textSecondary }]}>{row.title}</Text>
                  <Text style={type.caption}>
                    {[row.subtitle, row.archivedAt ? `archived ${new Date(row.archivedAt).toLocaleDateString()}` : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </View>
                <Pressable
                  onPress={() => void restore(row)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={`Unarchive ${noun} ${row.title}`}
                  style={styles.unarchive}
                >
                  <Text style={styles.link}>Unarchive</Text>
                </Pressable>
              </View>
            </Card>
          ))
        : null}
    </View>
  );
}

const styles = StyleSheet.create({
  toggle: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.sm },
  card: { opacity: 0.85 },
  unarchive: { paddingVertical: spacing.xs },
  link: { color: colors.accent, fontSize: 14, fontWeight: '600' },
});
