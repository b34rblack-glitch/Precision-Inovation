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
import {
  BULLET_MAKERS,
  BulletMaker,
  CatalogBullet,
  searchBullets,
} from '@/data/bulletCatalog';
import { colors, radii, spacing, touchTarget, type } from '@/theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  onSelect: (bullet: CatalogBullet) => void;
};

export function BulletCatalogModal({ visible, onClose, onSelect }: Props) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [maker, setMaker] = useState<BulletMaker | null>(null);

  const results = useMemo(() => searchBullets(query, maker), [query, maker]);

  const bcLabel = (b: CatalogBullet) => {
    if (b.bcG7 != null) return `G7 ${b.bcG7.toFixed(3)}`;
    if (b.bcG1 != null) return `G1 ${b.bcG1.toFixed(3)}`;
    return '—';
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} transparent={false}>
      <View style={[styles.root, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.header}>
          <Text style={type.title}>Bullet Catalog</Text>
          <Pressable
            onPress={onClose}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Close catalog"
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
            placeholder="Search 140 eld, 6.5, hybrid…"
            placeholderTextColor={colors.textTertiary}
            autoCorrect={false}
            autoCapitalize="none"
            accessibilityLabel="Search bullets"
          />
          {query !== '' ? (
            <Pressable onPress={() => setQuery('')} hitSlop={10} accessibilityLabel="Clear search">
              <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
            </Pressable>
          ) : null}
        </View>

        <View style={styles.makerRow}>
          <Chip label="All" selected={maker === null} onPress={() => setMaker(null)} />
          {BULLET_MAKERS.map((m) => (
            <Chip key={m} label={m} selected={maker === m} onPress={() => setMaker(m)} />
          ))}
        </View>

        <FlatList
          data={results}
          keyExtractor={(b, i) => `${b.maker}-${b.model}-${b.weightGr}-${i}`}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
          ListEmptyComponent={
            <Text style={[type.secondary, styles.empty]}>No bullets match your search.</Text>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => {
                onSelect(item);
                onClose();
              }}
              accessibilityRole="button"
              accessibilityLabel={`${item.maker} ${item.weightGr} grain ${item.model}, ${item.caliber}, ${bcLabel(item)}`}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            >
              <View style={{ flex: 1 }}>
                <Text style={type.body}>
                  {item.maker} {item.model}
                </Text>
                <Text style={[type.secondary, { marginTop: 2 }]}>
                  {item.caliber} · {item.weightGr} gr
                </Text>
              </View>
              <Text style={styles.bc}>{bcLabel(item)}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
            </Pressable>
          )}
        />

        <Text style={[type.secondary, styles.disclaimer, { paddingBottom: insets.bottom + spacing.sm }]}>
          Manufacturer-published nominal BCs — a starting point. Verify against your chronograph and
          true the load with real DOPE.
        </Text>
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
  makerRow: {
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
  bc: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  empty: { textAlign: 'center', paddingVertical: spacing.xxl },
  disclaimer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    color: colors.textTertiary,
    fontSize: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
