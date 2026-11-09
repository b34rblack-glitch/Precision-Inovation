import Ionicons from '@expo/vector-icons/Ionicons';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button } from '@/components/Buttons';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { Field, Half, NumericField, Row, Segmented } from '@/components/Form';
import { Screen } from '@/components/Screen';
import { BULLET_CATALOG, bestBc, type CatalogBullet } from '@/data/bulletCatalog';
import {
  BRASS_OPTIONS,
  POWDER_OPTIONS,
  PRESS_OPTIONS,
  PRIMER_OPTIONS,
  SEATING_DIE_OPTIONS,
  SIZING_DIE_OPTIONS,
} from '@/data/componentCatalog';
import { addBenchItem, benchItemsQuery, removeBenchItem, setBenchItemCartridge } from '@/db/repositories/bench';
import { activeLoadsQuery } from '@/db/repositories/loads';
import { activeRiflesQuery } from '@/db/repositories/rifles';
import type { BenchItem, BenchKind } from '@/db/schema';
import {
  BENCH_KIND_LABELS,
  BENCH_KINDS,
  benchHasCatalogBullet,
  CARTRIDGE_KINDS,
  cartridgeTags,
  catalogBulletName,
  findItem,
  normalizeName,
  sortedItems,
} from '@/lib/bench/model';
import { parseDecimal } from '@/lib/parse';
import type { PickerOption } from '@/lib/pickerOption';
import { colors, radii, spacing, touchTarget, type } from '@/theme';

// My Bench: tick what you own so the load form's pickers open on it, add
// gear the catalogs do not know, and tag dies with their cartridge.

const CATALOGS: Record<Exclude<BenchKind, 'bullet'>, readonly PickerOption[]> = {
  powder: POWDER_OPTIONS,
  primer: PRIMER_OPTIONS,
  brass: BRASS_OPTIONS,
  sizingDie: SIZING_DIE_OPTIONS,
  seatingDie: SEATING_DIE_OPTIONS,
  press: PRESS_OPTIONS,
};

const blank = {
  cartridge: null,
  bulletMake: null,
  bulletModel: null,
  bulletWeightGr: null,
  bulletDiameterIn: null,
  bcValue: null,
  bcModel: null,
} as const;

export default function BenchScreen() {
  const { data: items } = useLiveQuery(benchItemsQuery());
  const { data: rifles } = useLiveQuery(activeRiflesQuery());
  const { data: loads } = useLiveQuery(activeLoadsQuery());
  const [kind, setKind] = useState<BenchKind>('powder');
  const [query, setQuery] = useState('');
  const [custom, setCustom] = useState('');
  const [bullet, setBullet] = useState({ make: '', model: '', weight: '', bc: '', bcModel: 'G7' as 'G1' | 'G7' });
  const [busy, setBusy] = useState<string | null>(null);
  const tags = useMemo(() => cartridgeTags(rifles, loads), [rifles, loads]);
  const mine = useMemo(() => sortedItems(items, kind), [items, kind]);
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matches = (hay: string) => terms.every((t) => hay.toLowerCase().includes(t));

  const fail = (e: unknown) => Alert.alert('Could not update the bench', e instanceof Error ? e.message : String(e));

  const toggleOption = async (opt: PickerOption) => {
    const existing = findItem(items, kind, opt.value);
    setBusy(opt.value);
    try {
      if (existing) await removeBenchItem(existing.id);
      else await addBenchItem({ ...blank, kind, name: opt.value });
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  };

  const toggleBullet = async (b: CatalogBullet) => {
    const name = catalogBulletName(b);
    const existing =
      findItem(items, 'bullet', name) ??
      items.find(
        (i) => i.kind === 'bullet' && normalizeName(i.bulletMake) === normalizeName(b.maker) && normalizeName(i.bulletModel) === normalizeName(b.model),
      ) ??
      null;
    setBusy(name);
    try {
      if (existing) await removeBenchItem(existing.id);
      else {
        const bc = bestBc(b);
        await addBenchItem({
          ...blank,
          kind: 'bullet',
          name,
          bulletMake: b.maker,
          bulletModel: b.model,
          bulletWeightGr: b.weightGr,
          bulletDiameterIn: b.diameterIn,
          bcValue: bc?.bcValue ?? null,
          bcModel: bc?.bcModel ?? null,
        });
      }
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  };

  const addCustom = async () => {
    const name = custom.trim();
    if (!name) return;
    try {
      await addBenchItem({ ...blank, kind, name });
      setCustom('');
    } catch (e) {
      fail(e);
    }
  };

  const addCustomBullet = async () => {
    const make = bullet.make.trim();
    const model = bullet.model.trim();
    if (!make && !model) {
      Alert.alert('Name the bullet', 'Enter at least a make or a model.');
      return;
    }
    const weight = bullet.weight.trim() ? parseDecimal(bullet.weight) : null;
    const bc = bullet.bc.trim() ? parseDecimal(bullet.bc) : null;
    try {
      await addBenchItem({
        ...blank,
        kind: 'bullet',
        name: [make, model, weight != null ? `${weight} gr` : null].filter(Boolean).join(' '),
        bulletMake: make || null,
        bulletModel: model || null,
        bulletWeightGr: weight,
        bcValue: bc,
        bcModel: bc != null ? bullet.bcModel : null,
      });
      setBullet({ make: '', model: '', weight: '', bc: '', bcModel: 'G7' });
    } catch (e) {
      fail(e);
    }
  };

  const remove = (item: BenchItem) =>
    Alert.alert('Remove from bench?', `${item.name} will no longer show first in pickers.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => removeBenchItem(item.id).catch(fail) },
    ]);

  const catalogRows: { key: string; label: string; sub?: string; owned: boolean; onPress: () => void }[] =
    kind === 'bullet'
      ? BULLET_CATALOG.filter((b) => matches(`${b.maker} ${b.model} ${b.caliber} ${b.weightGr}gr`)).map((b) => ({
          key: catalogBulletName(b),
          label: catalogBulletName(b),
          sub: `${b.caliber} · ${b.weightGr} gr`,
          owned: benchHasCatalogBullet(items, b),
          onPress: () => void toggleBullet(b),
        }))
      : CATALOGS[kind].filter((o) => matches(`${o.value} ${o.group ?? ''} ${o.note ?? ''}`)).map((o) => ({
          key: o.value,
          label: o.value,
          sub: [o.group, o.note].filter(Boolean).join(' · ') || undefined,
          owned: !!findItem(items, kind, o.value),
          onPress: () => void toggleOption(o),
        }));
  const catalogKeys = new Set(catalogRows.map((r) => normalizeName(r.key)));
  const customItems = mine.filter(
    (i) =>
      !catalogKeys.has(normalizeName(i.name)) &&
      !(kind === 'bullet' && BULLET_CATALOG.some((b) => benchHasCatalogBullet([i], b))) &&
      matches(i.name),
  );
  const taggable = CARTRIDGE_KINDS.has(kind);

  return (
    <Screen underHeader>
      <Text style={[type.secondary, { marginBottom: spacing.md, color: colors.textTertiary }]}>
        Tick what you own. The load form's pickers then open on your bench, with everything else one
        tap away. Anything you save on a load joins the bench by itself.
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll} contentContainerStyle={styles.chipRow}>
        {BENCH_KINDS.map((k) => (
          <Chip
            key={k}
            label={`${BENCH_KIND_LABELS[k]}${items.some((i) => i.kind === k) ? ` · ${items.filter((i) => i.kind === k).length}` : ''}`}
            selected={kind === k}
            onPress={() => {
              setKind(k);
              setQuery('');
            }}
          />
        ))}
      </ScrollView>
      <View style={styles.searchRow}>
        <Ionicons name="search" size={18} color={colors.textTertiary} />
        <TextInput
          style={styles.search}
          value={query}
          onChangeText={setQuery}
          placeholder={`Search ${BENCH_KIND_LABELS[kind].toLowerCase()}…`}
          placeholderTextColor={colors.textTertiary}
          autoCorrect={false}
          autoCapitalize="none"
          accessibilityLabel="Search"
        />
        {query ? (
          <Pressable onPress={() => setQuery('')} hitSlop={10} accessibilityLabel="Clear search">
            <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
          </Pressable>
        ) : null}
      </View>

      {customItems.length > 0 ? (
        <Card>
          <Text style={[type.label, { marginBottom: spacing.xs }]}>On your bench, not in the catalog</Text>
          {customItems.map((i) => (
            <View key={i.id} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={type.body}>{i.name}</Text>
                <Text style={type.caption}>
                  {i.source === 'learned' ? 'learned from a load' : 'added by you'}
                  {i.cartridge ? ` · ${i.cartridge}` : ''}
                </Text>
                {taggable && tags.length > 0 ? <TagRow item={i} tags={tags} /> : null}
              </View>
              <Pressable onPress={() => remove(i)} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Remove ${i.name}`}>
                <Ionicons name="trash-outline" size={20} color={colors.textTertiary} />
              </Pressable>
            </View>
          ))}
        </Card>
      ) : null}

      <Card>
        <Text style={[type.label, { marginBottom: spacing.xs }]}>Catalog</Text>
        {catalogRows.length === 0 ? (
          <Text style={type.secondary}>Nothing matches your search.</Text>
        ) : (
          catalogRows.map((r) => {
            const item = r.owned ? findItem(items, kind, r.key) : null;
            return (
              <View key={r.key}>
                <Pressable
                  onPress={r.onPress}
                  disabled={busy === r.key}
                  style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: r.owned }}
                  accessibilityLabel={r.label}
                >
                  <Ionicons name={r.owned ? 'checkbox' : 'square-outline'} size={22} color={r.owned ? colors.accent : colors.textTertiary} />
                  <View style={{ flex: 1 }}>
                    <Text style={type.body}>{r.label}</Text>
                    {r.sub ? <Text style={type.caption}>{r.sub}</Text> : null}
                  </View>
                </Pressable>
                {r.owned && taggable && item && tags.length > 0 ? (
                  <View style={{ paddingLeft: 34, paddingBottom: spacing.sm }}>
                    <TagRow item={item} tags={tags} />
                  </View>
                ) : null}
              </View>
            );
          })
        )}
      </Card>

      <Card>
        <Text style={[type.label, { marginBottom: spacing.sm }]}>Add something the catalog lacks</Text>
        {kind === 'bullet' ? (
          <>
            <Row>
              <Half>
                <Field label="Make" value={bullet.make} onChangeText={(v) => setBullet((b) => ({ ...b, make: v }))} placeholder="Hammer Bullets" autoCapitalize="words" />
              </Half>
              <Half>
                <Field label="Model" value={bullet.model} onChangeText={(v) => setBullet((b) => ({ ...b, model: v }))} placeholder="Hammer Hunter" autoCapitalize="words" />
              </Half>
            </Row>
            <Row>
              <Half>
                <NumericField label="Weight" value={bullet.weight} onChangeText={(v) => setBullet((b) => ({ ...b, weight: v }))} suffix="gr" />
              </Half>
              <Half>
                <NumericField label="BC" value={bullet.bc} onChangeText={(v) => setBullet((b) => ({ ...b, bc: v }))} placeholder="0.322" />
              </Half>
            </Row>
            <Segmented label="BC model" options={['G7', 'G1'] as const} value={bullet.bcModel} onChange={(m) => setBullet((b) => ({ ...b, bcModel: m }))} />
            <Button label="Add Bullet" variant="secondary" onPress={addCustomBullet} />
          </>
        ) : (
          <>
            <Field label={BENCH_KIND_LABELS[kind].replace(/s$/, '')} value={custom} onChangeText={setCustom} placeholder="Name as it reads on the box" autoCapitalize="words" />
            <Button label="Add to Bench" variant="secondary" onPress={addCustom} disabled={!custom.trim()} />
          </>
        )}
      </Card>
    </Screen>
  );
}

/** Cartridge tag chips under a die: tap to tag, tap again to clear. */
function TagRow({ item, tags }: { item: BenchItem; tags: string[] }) {
  return (
    <View style={styles.tagRow}>
      {tags.map((c) => (
        <Pressable
          key={c}
          onPress={() => setBenchItemCartridge(item.id, normalizeName(item.cartridge) === normalizeName(c) ? null : c).catch(() => {})}
          style={[styles.tag, normalizeName(item.cartridge) === normalizeName(c) && styles.tagOn]}
          accessibilityRole="button"
          accessibilityState={{ selected: normalizeName(item.cartridge) === normalizeName(c) }}
        >
          <Text style={[type.caption, normalizeName(item.cartridge) === normalizeName(c) && { color: colors.onAccent }]}>{c}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  chipScroll: { marginHorizontal: -spacing.lg, marginBottom: spacing.sm },
  chipRow: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    minHeight: touchTarget,
    marginBottom: spacing.md,
  },
  search: { flex: 1, color: colors.text, fontSize: 16, paddingVertical: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
  tag: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radii.sm, borderWidth: 1, borderColor: colors.border },
  tagOn: { backgroundColor: colors.accent, borderColor: colors.accent },
});
