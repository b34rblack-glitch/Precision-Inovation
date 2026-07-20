import { Ionicons } from '@expo/vector-icons';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/Buttons';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { archiveRifle, rifleByIdQuery } from '@/db/repositories/rifles';
import { loadsForRifleQuery } from '@/db/repositories/loads';
import { recentSessionsForRifleQuery } from '@/db/repositories/sessions';
import { colors, radii, spacing, type } from '@/theme';

function SpecRow({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <View style={styles.specRow}>
      <Text style={type.secondary}>{label}</Text>
      <Text style={[type.body, { fontVariant: ['tabular-nums'] }]}>{value}</Text>
    </View>
  );
}

export default function RifleDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data } = useLiveQuery(rifleByIdQuery(id), [id]);
  const { data: rifleLoads } = useLiveQuery(loadsForRifleQuery(id), [id]);
  const { data: sessions } = useLiveQuery(recentSessionsForRifleQuery(id, 5), [id]);
  const rifle = data[0];
  if (!rifle) return <Screen underHeader>{null}</Screen>;

  const confirmArchive = () => {
    Alert.alert('Archive rifle?', `"${rifle.name}" will be hidden but its history is kept.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Archive',
        style: 'destructive',
        onPress: async () => {
          try {
            await archiveRifle(rifle.id);
            router.back();
          } catch (e) {
            Alert.alert('Save failed', e instanceof Error ? e.message : String(e));
          }
        },
      },
    ]);
  };

  return (
    <Screen underHeader>
      <Stack.Screen
        options={{
          title: rifle.name,
          headerRight: () => (
            <Pressable
              onPress={() => router.push(`/rifles/${rifle.id}/edit`)}
              hitSlop={14}
              accessibilityRole="button"
              accessibilityLabel="Edit rifle"
            >
              <Ionicons name="pencil" size={20} color={colors.accent} />
            </Pressable>
          ),
        }}
      />

      {rifle.photoUri ? <Image source={{ uri: rifle.photoUri }} style={styles.photo} /> : null}

      <Card>
        <SpecRow label="Cartridge" value={rifle.cartridge} />
        <SpecRow label="Rifle" value={[rifle.make, rifle.model].filter(Boolean).join(' ') || null} />
        <SpecRow
          label="Barrel"
          value={
            rifle.barrelLengthIn || rifle.twistRate
              ? [rifle.barrelLengthIn ? `${rifle.barrelLengthIn}"` : null, rifle.twistRate]
                  .filter(Boolean)
                  .join(' · ')
              : null
          }
        />
        <SpecRow
          label="Optic"
          value={[rifle.scopeMake, rifle.scopeModel].filter(Boolean).join(' ') || null}
        />
        <SpecRow label="Sight height" value={`${rifle.sightHeightIn}"`} />
        <SpecRow label="Turrets" value={rifle.turretUnit} />
        <SpecRow label="Zero" value={`${rifle.zeroDistance} ${rifle.distanceUnit}`} />
        {rifle.notes ? (
          <Text style={[type.secondary, { marginTop: spacing.sm }]}>{rifle.notes}</Text>
        ) : null}
      </Card>

      <Button
        label="Range Card"
        onPress={() => router.push(`/range/cards/${rifle.id}`)}
        style={{ marginBottom: spacing.lg }}
      />

      <Text style={[type.label, { marginBottom: spacing.sm }]}>Loads for this rifle</Text>
      {rifleLoads.length === 0 ? (
        <Button
          label="New Load for this Rifle"
          variant="secondary"
          onPress={() => router.push(`/loads/new?rifleId=${rifle.id}`)}
          style={{ marginBottom: spacing.lg }}
        />
      ) : (
        rifleLoads.map((load) => (
          <Card key={load.id} onPress={() => router.push(`/loads/${load.id}`)}>
            <Text style={type.body}>{load.name}</Text>
            {load.cartridge ? <Text style={type.secondary}>{load.cartridge}</Text> : null}
          </Card>
        ))
      )}

      <Text style={[type.label, { marginTop: spacing.lg, marginBottom: spacing.sm }]}>
        Recent sessions
      </Text>
      {sessions.length === 0 ? (
        <Text style={type.secondary}>No range sessions logged yet.</Text>
      ) : (
        sessions.map((s) => (
          <Card key={s.id} onPress={() => router.push(`/range/sessions/${s.id}`)}>
            <Text style={type.body}>{new Date(s.date).toLocaleDateString()}</Text>
            {s.location ? <Text style={type.secondary}>{s.location}</Text> : null}
          </Card>
        ))
      )}

      <Pressable onPress={confirmArchive} style={styles.archiveBtn}>
        <Text style={{ color: colors.danger, fontSize: 15, fontWeight: '600' }}>Archive rifle</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  photo: {
    width: '100%',
    height: 180,
    borderRadius: radii.lg,
    marginBottom: spacing.md,
  },
  specRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  archiveBtn: { alignItems: 'center', paddingVertical: spacing.xl },
});
