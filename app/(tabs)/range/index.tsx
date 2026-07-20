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
import { activeSessionsQuery } from '@/db/repositories/sessions';
import { colors, spacing, type } from '@/theme';

export default function RangeScreen() {
  const router = useRouter();
  const { data: sessions } = useLiveQuery(activeSessionsQuery());
  const { data: rifles } = useLiveQuery(activeRiflesQuery());
  const { data: loads } = useLiveQuery(activeLoadsQuery());
  const rifleName = (id: string) => rifles.find((r) => r.id === id)?.name ?? 'Rifle';

  // A range card needs a load assigned to the rifle — rifles without one
  // would only hit a dead end, so they get no card row.
  const cardRifles = rifles.filter((rifle) =>
    loads.some((l) => l.rifleId === rifle.id && l.currentVersionId),
  );

  return (
    <>
      <Screen
        title="Range"
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
        {cardRifles.length > 0 ? (
          <>
            <Text style={[type.label, { marginBottom: spacing.sm }]}>Range cards</Text>
            {cardRifles.map((rifle) => (
              <Card key={rifle.id} onPress={() => router.push(`/range/cards/${rifle.id}`)}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons
                    name="grid-outline"
                    size={22}
                    color={colors.accent}
                    style={{ marginRight: spacing.md }}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={type.body}>{rifle.name}</Text>
                    <Text style={type.secondary}>
                      {rifle.turretUnit} · {rifle.distanceUnit}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
                </View>
              </Card>
            ))}
            <Text style={[type.label, { marginTop: spacing.lg, marginBottom: spacing.sm }]}>
              Sessions
            </Text>
          </>
        ) : null}

        {sessions.length === 0 ? (
          <EmptyState
            icon="analytics"
            title="No sessions yet"
            message="Log a range session to start building real DOPE for your rifle and load."
          />
        ) : (
          sessions.map((s) => (
            <Card key={s.id} onPress={() => router.push(`/range/sessions/${s.id}`)}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ flex: 1 }}>
                  <Text style={type.body}>
                    {new Date(s.date).toLocaleDateString()} · {rifleName(s.rifleId)}
                  </Text>
                  <Text style={type.secondary}>{s.location ?? 'No location'}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
              </View>
            </Card>
          ))
        )}
      </Screen>
      <Fab onPress={() => router.push('/range/sessions/new')} accessibilityLabel="New session" />
    </>
  );
}
