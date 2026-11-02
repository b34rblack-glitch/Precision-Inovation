import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useMemo, useState } from 'react';
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
  CALIBERS,
  caliberLabelForDiameter,
  CatalogBullet,
  searchBullets,
} from '@/data/bulletCatalog';
import { colors, radii, spacing, touchTarget, type } from '@/theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  onSelect: (bullet: CatalogBullet) => void;
  /** Bore to filter to when the picker opens (e.g. from the rifle's cartridge). Clearable. */
  defaultDiameterIn?: number | null;
};

export function BulletCatalogModal({ visible, onClose, onSelect, defaultDiameterIn }: Props) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [maker, setMaker] = useState<BulletMaker | null>(null);
  // Re-seeded from the rifle every time the picker opens; "All calibers" clears it.
  const [diameter, setDiameter] = useState<number | null>(defaultDiameterIn ?? null);
  useEffect(() => {
    if (visible) setDiameter(defaultDiameterIn ?? null);
  }, [visible, defaultDiameterIn]);

  const results = useMemo(
    () => searchBullets(query, maker, diameter),
    [query, maker, diameter],
  );

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
        <View style={[styles.makerRow, { paddingTop: 0 }]} accessibilityLabel="Caliber filter">
          <Chip label="All calibers" selected={diameter === null} onPress={() => setDiameter(null)} />
          {CALIBERS.map((c) => (
            <Chip
              key={c.label}
              label={c.label}
              selected={diameter !== null && Math.abs(diameter - c.diameterIn) < 0.0005}
              onPress={() => setDiameter(c.diameterIn)}
            />
          ))}
        </View>

        <FlatList
          data={results}
          keyExtractor={(b, i) => `${b.maker}-${b.model}-${b.weightGr}-${i}`}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={[type.secondary, { textAlign: 'center' }]}>
                {diameter !== null
                  ? `No ${caliberLabelForDiameter(diameter) ?? ''} bullets match your search.`
                  : 'No bullets match your search.'}
              </Text>
              {diameter !== null ? (
                <Chip
                  label="Show all calibers"
                  onPress={() => setDiameter(null)}
                  style={{ alignSelf: 'center', marginTop: spacing.md }}
                />
              ) : null}
            </View>
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
  empty: { paddingVertical: spacing.xxl, paddingHorizontal: spacing.lg },
  disclaimer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    color: colors.textTertiary,
    fontSize: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
