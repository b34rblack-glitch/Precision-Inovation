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
  caliberLabelForDiameter,
  CALIBERS,
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
  /** Bore to filter to when the picker opens (e.g. from the rifle's cartridge). Clearable. */
  defaultDiameterIn?: number | null;
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

export function BulletCatalogModal({
  visible,
  benchItems = [],
  onClose,
  onSelect,
  defaultDiameterIn,
}: Props) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [maker, setMaker] = useState<BulletMaker | null>(null);
  const mine = useMemo(() => itemsOfKind(benchItems, 'bullet'), [benchItems]);
  const [mode, setMode] = useState<PickerMode>('all');
  // Re-seeded from the rifle every time the picker opens; "All calibers" clears it.
  const [diameter, setDiameter] = useState<number | null>(defaultDiameterIn ?? null);
  useEffect(() => {
    if (visible) {
      setMode(defaultPickerMode(benchItems, 'bullet'));
      setDiameter(defaultDiameterIn ?? null);
    }
  }, [visible, benchItems, defaultDiameterIn]);

  const results = useMemo<PickedBullet[]>(() => {
    const catalog = searchBullets(query, maker, diameter);
    if (mode === 'all') return catalog.map(fromCatalog);
    // Mine: catalog bullets on the bench, then bench bullets the catalog lacks.
    const owned = catalog.filter((b) => benchHasCatalogBullet(benchItems, b)).map(fromCatalog);
    const known = new Set(owned.map((b) => normalizeName(`${b.maker} ${b.model}`)));
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const custom = mine
      .filter((i) => !known.has(normalizeName(`${i.bulletMake} ${i.bulletModel}`)) && !known.has(normalizeName(i.name)))
      .filter((i) => !maker || normalizeName(i.bulletMake) === normalizeName(maker))
      .filter(
        (i) =>
          diameter == null ||
          (i.bulletDiameterIn != null && Math.abs(i.bulletDiameterIn - diameter) < 0.0005),
      )
      .filter((i) => terms.every((t) => i.name.toLowerCase().includes(t)))
      .map(fromBench);
    return [...owned, ...custom];
  }, [query, maker, mode, diameter, benchItems, mine]);

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
        <View style={[styles.makerRow, { paddingTop: 0 }]} accessibilityLabel="Caliber filter">
          <Chip
            label="All calibers"
            selected={diameter === null}
            onPress={() => setDiameter(null)}
          />
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
                {mode === 'mine' && !query
                  ? 'No bullets on your bench yet. Tap All.'
                  : diameter !== null
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
