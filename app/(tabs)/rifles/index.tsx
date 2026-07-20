import { Ionicons } from '@expo/vector-icons';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useRouter } from 'expo-router';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { Fab } from '@/components/Buttons';
import { Screen } from '@/components/Screen';
import { activeRiflesQuery } from '@/db/repositories/rifles';
import { colors, radii, spacing, type } from '@/theme';

export default function RiflesScreen() {
  const router = useRouter();
  const { data: rifles } = useLiveQuery(activeRiflesQuery());

  return (
    <>
      <Screen
        title="Rifles"
        fabClearance
        headerRight={
          <Pressable onPress={() => router.push('/settings')} hitSlop={12}>
            <Ionicons name="settings-outline" size={24} color={colors.textSecondary} />
          </Pressable>
        }
      >
        {rifles.length === 0 ? (
          <EmptyState
            icon="locate"
            title="No rifles yet"
            message="Add your first rifle profile — just a name is enough to get started."
          />
        ) : (
          rifles.map((rifle) => (
            <Card key={rifle.id} onPress={() => router.push(`/rifles/${rifle.id}`)}>
              <View style={styles.row}>
                {rifle.photoUri ? (
                  <Image source={{ uri: rifle.photoUri }} style={styles.thumb} />
                ) : (
                  <View style={[styles.thumb, styles.thumbPlaceholder]}>
                    <Ionicons name="locate" size={22} color={colors.textTertiary} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={type.heading}>{rifle.name}</Text>
                  <Text style={[type.secondary, { marginTop: 2 }]}>
                    {[rifle.cartridge, [rifle.make, rifle.model].filter(Boolean).join(' ')]
                      .filter(Boolean)
                      .join(' · ') || 'No details yet'}
                  </Text>
                  <Text style={[type.secondary, { marginTop: 2, color: colors.textTertiary }]}>
                    {rifle.turretUnit} · zero {rifle.zeroDistance} {rifle.distanceUnit}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
              </View>
            </Card>
          ))
        )}
      </Screen>
      <Fab onPress={() => router.push('/rifles/new')} />
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  thumb: { width: 56, height: 56, borderRadius: radii.md },
  thumbPlaceholder: {
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
