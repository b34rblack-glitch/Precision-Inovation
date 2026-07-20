import { Ionicons } from '@expo/vector-icons';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { Fab } from '@/components/Buttons';
import { Screen } from '@/components/Screen';
import { activeLoadsQuery } from '@/db/repositories/loads';
import { activeRiflesQuery } from '@/db/repositories/rifles';
import { colors, spacing, type } from '@/theme';

export default function LoadsScreen() {
  const router = useRouter();
  // updatedAt is undefined until the live query's first emission — gate the
  // empty state on it so it doesn't flash before data arrives.
  const { data: loads, updatedAt } = useLiveQuery(activeLoadsQuery());
  const { data: rifles } = useLiveQuery(activeRiflesQuery());
  const loading = updatedAt === undefined;
  const rifleName = (id: string | null) => rifles.find((r) => r.id === id)?.name;

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
          loads.map((load) => (
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
      </Screen>
      <Fab onPress={() => router.push('/loads/new')} accessibilityLabel="Add load" />
    </>
  );
}
