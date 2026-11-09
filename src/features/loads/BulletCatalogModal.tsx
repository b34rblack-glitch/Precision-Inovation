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
  bestBc,
  BULLET_MAKERS,
  BulletMaker,
  CatalogBullet,
  searchBullets,
} from '@/data/bulletCatalog';
import type { BenchItem } from '@/db/schema';
import { benchHasCatalogBullet, defaultPickerMode, itemsOfKind, normalizeName, type PickerMode } from '@/lib/bench/model';
import { colors, radii, spacing, touchTarget, type } from '@/theme';

/** What a pick hands back: a catalog bullet or a bench one, same shape. */
export type PickedBullet = {
  maker: string;
  model: string;
  weightGr: number | null;
  diameterIn: number | null;
  bcValue: number | null;
  bcModel: 'G1' | 'G7' | null;
  caliber: string | null;
};

type Props = {
  visible: boolean;
  /** The bench's bullets; with any, the catalog opens on "Mine". */
  benchItems?: readonly BenchItem[];
  onClose: () => void;
  onSelect: (bullet: PickedBullet) => void;
};

const fromCatalog = (b: CatalogBullet): PickedBullet => {
  const bc = bestBc(b);
  return { maker: b.maker, model: b.model, weightGr: b.weightGr, diameterIn: b.diameterIn, bcValue: bc?.bcValue ?? null, bcModel: bc?.bcModel ?? null, caliber: b.caliber };
};
const fromBench = (i: BenchItem): PickedBullet => ({
  maker: i.bulletMake ?? '',
  model: i.bulletModel ?? '',
  weightGr: i.bulletWeightGr,
  diameterIn: i.bulletDiameterIn,
  bcValue: i.bcValue,
  bcModel: i.bcModel,
  caliber: null,
});

export function BulletCatalogModal({ visible, benchItems = [], onClose, onSelect }: Props) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [maker, setMaker] = useState<BulletMaker | null>(null);
  const mine = useMemo(() => itemsOfKind(benchItems, 'bullet'), [benchItems]);
  const [mode, setMode] = useState<PickerMode>('all');
  useEffect(() => {
    if (visible) setMode(defaultPickerMode(benchItems, 'bullet'));
  }, [visible, benchItems]);

  const results = useMemo<PickedBullet[]>(() => {
    const catalog = searchBullets(query, maker);
    if (mode === 'all') return catalog.map(fromCatalog);
    // Mine: catalog bullets on the bench, then bench bullets the catalog lacks.
    const owned = catalog.filter((b) => benchHasCatalogBullet(benchItems, b)).map(fromCatalog);
    const known = new Set(owned.map((b) => normalizeName(`${b.maker} ${b.model}`)));
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const custom = mine
      .filter((i) => !known.has(normalizeName(`${i.bulletMake} ${i.bulletModel}`)) && !known.has(normalizeName(i.name)))
      .filter((i) => !maker || normalizeName(i.bulletMake) === normalizeName(maker))
      .filter((i) => terms.every((t) => i.name.toLowerCase().includes(t)))
      .map(fromBench);
    return [...owned, ...custom];
  }, [query, maker, mode, benchItems, mine]);

  const bcLabel = (b: PickedBullet) => (b.bcValue != null ? `${b.bcModel ?? ''} ${b.bcValue.toFixed(3)}`.trim() : '—');

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

        {mine.length > 0 ? (
          <View style={[styles.makerRow, { paddingBottom: 0 }]}>
            <Chip label="Mine" selected={mode === 'mine'} onPress={() => setMode('mine')} />
            <Chip label="All" selected={mode === 'all'} onPress={() => setMode('all')} />
          </View>
        ) : null}
        <View style={styles.makerRow}>
          <Chip label="All makers" selected={maker === null} onPress={() => setMaker(null)} />
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
            <Text style={[type.secondary, styles.empty]}>
              {mode === 'mine' && !query ? 'No bullets on your bench yet. Tap All.' : 'No bullets match your search.'}
            </Text>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => {
                onSelect(item);
                onClose();
              }}
              accessibilityRole="button"
              accessibilityLabel={`${item.maker} ${item.weightGr ?? ''} grain ${item.model}, ${bcLabel(item)}`}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            >
              <View style={{ flex: 1 }}>
                <Text style={type.body}>
                  {item.maker} {item.model}
                </Text>
                <Text style={[type.secondary, { marginTop: 2 }]}>
                  {[item.caliber, item.weightGr != null ? `${item.weightGr} gr` : null].filter(Boolean).join(' · ') || 'on your bench'}
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
