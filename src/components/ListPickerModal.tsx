import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Chip } from '@/components/Chip';
import { colors, radii, spacing, touchTarget, type } from '@/theme';

export type PickerOption = {
  value: string;
  /** Optional grouping used for filter chips (e.g. powder maker). */
  group?: string;
  /** Optional secondary line (e.g. burn-rate hint). */
  note?: string;
};

type Props = {
  visible: boolean;
  title: string;
  options: readonly PickerOption[];
  placeholder?: string;
  /** Optional footer note (e.g. safety/verification reminder). */
  footer?: string;
  onClose: () => void;
  onSelect: (value: string) => void;
};

/** Generic searchable single-select list, styled to match the app. */
export function ListPickerModal({
  visible,
  title,
  options,
  placeholder,
  footer,
  onClose,
  onSelect,
}: Props) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState<string | null>(null);

  const groups = useMemo(() => {
    const seen: string[] = [];
    for (const o of options) if (o.group && !seen.includes(o.group)) seen.push(o.group);
    return seen;
  }, [options]);

  const results = useMemo(() => {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return options.filter((o) => {
      if (group && o.group !== group) return false;
      if (terms.length === 0) return true;
      const hay = `${o.value} ${o.group ?? ''} ${o.note ?? ''}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
  }, [options, query, group]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.root, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.header}>
          <Text style={type.title}>{title}</Text>
          <Pressable
            onPress={onClose}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Close list"
            style={styles.closeBtn}
          >
            <Ionicons name="close" size={26} color={colors.text} />
          </Pressable>
        </View>

        <View style={styles.searchRow}>
          <Ionicons name="search" size={18} color={colors.textTertiary} />
          <TextInput
            style={styles.search}
            value={query}
            onChangeText={setQuery}
            placeholder={placeholder ?? 'Search…'}
            placeholderTextColor={colors.textTertiary}
            autoCorrect={false}
            autoCapitalize="none"
            accessibilityLabel="Search"
          />
          {query !== '' ? (
            <Pressable onPress={() => setQuery('')} hitSlop={10} accessibilityLabel="Clear search">
              <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
            </Pressable>
          ) : null}
        </View>

        {groups.length > 1 ? (
          <View style={styles.groupRow}>
            <Chip label="All" selected={group === null} onPress={() => setGroup(null)} />
            {groups.map((g) => (
              <Chip key={g} label={g} selected={group === g} onPress={() => setGroup(g)} />
            ))}
          </View>
        ) : null}

        <FlatList
          data={results}
          keyExtractor={(o, i) => `${o.value}-${i}`}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
          ListEmptyComponent={
            <Text style={[type.secondary, styles.empty]}>Nothing matches your search.</Text>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => {
                onSelect(item.value);
                onClose();
              }}
              accessibilityRole="button"
              accessibilityLabel={`${item.value}${item.note ? `, ${item.note}` : ''}`}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            >
              <View style={{ flex: 1 }}>
                <Text style={type.body}>{item.value}</Text>
                {item.note ? (
                  <Text style={[type.secondary, { marginTop: 2 }]}>{item.note}</Text>
                ) : null}
              </View>
              {item.group ? <Text style={styles.group}>{item.group}</Text> : null}
              <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
            </Pressable>
          )}
        />

        {footer ? (
          <Text
            style={[styles.footer, { paddingBottom: insets.bottom + spacing.sm }]}
          >
            {footer}
          </Text>
        ) : null}
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
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    minHeight: touchTarget,
  },
  search: { flex: 1, color: colors.text, fontSize: 16, paddingVertical: spacing.sm },
  groupRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: touchTarget,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowPressed: { backgroundColor: colors.surface },
  group: { color: colors.textSecondary, fontSize: 13 },
  empty: { textAlign: 'center', paddingVertical: spacing.xxl },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    color: colors.textTertiary,
    fontSize: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
