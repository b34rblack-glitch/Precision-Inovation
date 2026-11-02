import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Alert, Pressable, StyleSheet, Text } from 'react-native';
import { Screen } from '@/components/Screen';
import { createLoad } from '@/db/repositories/loads';
import { LoadForm } from '@/features/loads/LoadForm';
import { colors, radii, spacing, type } from '@/theme';

export default function NewLoadScreen() {
  const router = useRouter();
  // Deep links like "New load for this rifle" preselect the rifle.
  const { rifleId } = useLocalSearchParams<{ rifleId?: string }>();
  const buildHref = rifleId ? `/loads/build?rifleId=${rifleId}` : '/loads/build';
  return (
    <Screen underHeader>
      <Pressable
        // Replace rather than push so Back from the walkthrough doesn't land
        // on an abandoned copy of this form.
        onPress={() => router.replace(buildHref)}
        accessibilityRole="button"
        accessibilityLabel="Build this load step by step instead"
        style={({ pressed }) => [styles.buildLink, pressed && { backgroundColor: colors.surfaceRaised }]}
      >
        <Ionicons name="footsteps-outline" size={20} color={colors.accent} />
        <Text style={[type.body, { flex: 1 }]}>
          First load?{' '}
          <Text style={{ color: colors.accent, fontWeight: '600' }}>Build it step by step</Text>
        </Text>
        <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
      </Pressable>
      <LoadForm
        submitLabel="Save Load"
        defaultRifleId={rifleId ?? null}
        onSubmit={async ({ meta, components }) => {
          try {
            const load = await createLoad(meta, components);
            router.replace(`/loads/${load.id}`);
          } catch (e) {
            Alert.alert('Save failed', e instanceof Error ? e.message : String(e));
          }
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  buildLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
