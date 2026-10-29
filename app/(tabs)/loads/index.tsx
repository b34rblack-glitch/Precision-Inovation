import Ionicons from '@expo/vector-icons/Ionicons';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { EmptyState } from '@/components/EmptyState';
import { Fab } from '@/components/Buttons';
import { Screen } from '@/components/Screen';
import { activeLoadsQuery } from '@/db/repositories/loads';
import { activeRiflesQuery } from '@/db/repositories/rifles';
import {
  cartridgeOptions,
  EMPTY_LOAD_FILTER,
  filterLoads,
  isFilterActive,
  type LoadFilter,
} from '@/features/loads/filter';
import { colors, radii, spacing, touchTarget, type } from '@/theme';

export default function LoadsScreen() {
  const router = useRouter();
  // updatedAt is undefined until the live query's first emission — gate the
  // empty state on it so it doesn't flash before data arrives.
  const { data: loads, updatedAt } = useLiveQuery(activeLoadsQuery());
  const { data: rifles } = useLiveQuery(activeRiflesQuery());
  const loading = updatedAt === undefined;
  const rifleName = (id: string | null) => rifles.find((r) => r.id === id)?.name;

  // Filters live in screen state: the tab stays mounted while you look at a
  // load and come back, and a fresh launch starts from "everything".
  const [filter, setFilter] = useState<LoadFilter>(EMPTY_LOAD_FILTER);
  const cartridges = useMemo(() => cartridgeOptions(loads), [loads]);
  const shown = useMemo(
    () => filterLoads(loads, filter, (id) => rifles.find((r) => r.id === id)?.name),
    [loads, filter, rifles],
  );
  const active = isFilterActive(filter);
  const rifleIs = (id: string) => typeof filter.rifle === 'object' && filter.rifle.rifleId === id;

  return (
    <>
      <Screen
        title="Loads"
        fabClearance
        headerRight={
          <Pressable
            onPress={() => router.push('/settings')}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Settings"
          >
            <Ionicons name="settings-outline" size={24} color={colors.textSecondary} />
          </Pressable>
        }
      >
        {loading ? null : loads.length === 0 ? (
          <EmptyState
            icon="flask"
            title="No loads yet"
            message="Create a load recipe, then develop it with a ladder, OCW, or velocity workup."
          />
        ) : (
          <>
            <View style={styles.searchRow}>
              <Ionicons name="search" size={18} color={colors.textTertiary} />
              <TextInput
                style={styles.search}
                value={filter.query}
                onChangeText={(query) => setFilter((f) => ({ ...f, query }))}
                placeholder="Search name, cartridge, rifle…"
                placeholderTextColor={colors.textTertiary}
                autoCorrect={false}
                autoCapitalize="none"
                returnKeyType="search"
                accessibilityLabel="Search loads"
              />
              {filter.query ? (
                <Pressable
                  onPress={() => setFilter((f) => ({ ...f, query: '' }))}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel="Clear search"
                >
                  <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
                </Pressable>
              ) : null}
            </View>

            {rifles.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.chipScroll}
                contentContainerStyle={styles.chipRow}
                keyboardShouldPersistTaps="handled"
                accessibilityLabel="Filter by rifle"
              >
                <Chip
                  label="All rifles"
                  selected={filter.rifle === 'all'}
                  onPress={() => setFilter((f) => ({ ...f, rifle: 'all' }))}
                />
                <Chip
                  label="Unassigned"
                  selected={filter.rifle === 'unassigned'}
                  onPress={() => setFilter((f) => ({ ...f, rifle: 'unassigned' }))}
                />
                {rifles.map((r) => (
                  <Chip
                    key={r.id}
                    label={r.name}
                    selected={rifleIs(r.id)}
                    onPress={() => setFilter((f) => ({ ...f, rifle: { rifleId: r.id } }))}
                  />
                ))}
              </ScrollView>
            ) : null}

            {cartridges.length > 1 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.chipScroll}
                contentContainerStyle={styles.chipRow}
                keyboardShouldPersistTaps="handled"
                accessibilityLabel="Filter by cartridge"
              >
                <Chip
                  label="All cartridges"
                  selected={filter.cartridge === null}
                  onPress={() => setFilter((f) => ({ ...f, cartridge: null }))}
                />
                {cartridges.map((c) => (
                  <Chip
                    key={c}
                    label={c}
                    selected={filter.cartridge === c}
                    onPress={() => setFilter((f) => ({ ...f, cartridge: c }))}
                  />
                ))}
              </ScrollView>
            ) : null}

            {active ? (
              <Text style={[type.secondary, styles.count]}>
                {shown.length === loads.length
                  ? `All ${loads.length} loads`
                  : `${shown.length} of ${loads.length} loads`}
              </Text>
            ) : null}

            {shown.length === 0 ? (
              <EmptyState
                icon="funnel-outline"
                title="No loads match"
                message="Nothing fits the search and chips you have set."
                action={{ label: 'Clear Filters', onPress: () => setFilter(EMPTY_LOAD_FILTER) }}
              />
            ) : (
              shown.map((load) => (
                <Card key={load.id} onPress={() => router.push(`/loads/${load.id}`)}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={type.heading}>{load.name}</Text>
                      <Text style={[type.secondary, { marginTop: 2 }]}>
                        {[load.cartridge, rifleName(load.rifleId)].filter(Boolean).join(' · ') ||
                          'Unassigned'}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
                  </View>
                </Card>
              ))
            )}
          </>
        )}
      </Screen>
      <Fab onPress={() => router.push('/loads/new')} accessibilityLabel="Add load" />
    </>
  );
}

const styles = StyleSheet.create({
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
    marginBottom: spacing.sm,
  },
  search: { flex: 1, color: colors.text, fontSize: 16, paddingVertical: spacing.sm },
  // Pull the row out to the screen edges so chips scroll under the gutter.
  chipScroll: { marginHorizontal: -spacing.lg },
  chipRow: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.xs },
  count: { marginTop: spacing.xs, marginBottom: spacing.sm, color: colors.textTertiary },
});
