import Ionicons from '@expo/vector-icons/Ionicons';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/Buttons';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { loadByIdQuery, versionsForLoadQuery } from '@/db/repositories/loads';
import { rifleByIdQuery } from '@/db/repositories/rifles';
import { stepsForWorkupQuery, workupByIdQuery } from '@/db/repositories/workups';
import { ingredientRows } from '@/features/loads/recipe';
import { colors, spacing, type } from '@/theme';

// End of the Build-a-Load walkthrough: the rounds to load, and what comes next.
// Nothing is edited here; it reads the load (and workup) the wizard just saved.

export default function BuildLoadDoneScreen() {
  const router = useRouter();
  // `rounds` comes from the batch row the walkthrough just opened; the recipe
  // version itself no longer carries a batch size.
  const { loadId, workupId, rounds } = useLocalSearchParams<{
    loadId: string;
    workupId?: string;
    rounds?: string;
  }>();
  const { data: loadRows } = useLiveQuery(loadByIdQuery(loadId), [loadId]);
  const { data: versions } = useLiveQuery(versionsForLoadQuery(loadId), [loadId]);
  const load = loadRows[0];
  const { data: rifleRows } = useLiveQuery(rifleByIdQuery(load?.rifleId ?? ''), [load?.rifleId]);
  const { data: workupRows } = useLiveQuery(workupByIdQuery(workupId ?? ''), [workupId]);
  const { data: steps } = useLiveQuery(stepsForWorkupQuery(workupId ?? ''), [workupId]);
  const rifle = rifleRows[0];
  const workup = workupId ? workupRows[0] : undefined;
  const current = versions.find((v) => v.id === load?.currentVersionId);

  if (!load || !current) return <Screen underHeader>{null}</Screen>;

  const shots = workup?.shotsPerCharge ?? 1;
  const ingredients = ingredientRows(current).filter((r) => r.label !== 'Rounds loaded');

  // Replace first so the finished walkthrough never reappears on Back.
  const toLoad = () => router.replace(`/loads/${load.id}`);
  const toSession = () => {
    toLoad();
    router.push(`/range/sessions/new?rifleId=${load.rifleId}&loadId=${load.id}`);
  };
  const toWorkup = () => {
    toLoad();
    if (workup) router.push(`/loads/${load.id}/workups/${workup.id}`);
  };

  return (
    <Screen underHeader>
      <View style={styles.hero}>
        <Ionicons name="checkmark-circle" size={44} color={colors.success} />
        <Text style={[type.title, { marginTop: spacing.sm }]}>Your plan is ready</Text>
        <Text style={[type.secondary, { marginTop: spacing.xs, textAlign: 'center' }]}>
          {[load.name, rifle?.name].filter(Boolean).join(' · ')}
        </Text>
      </View>

      <Card>
        <Text style={type.label}>Rounds to load</Text>
        {workup ? (
          <>
            {steps.map((s) => (
              <View key={s.id} style={styles.row}>
                <Text style={[type.secondary, { width: 28 }]}>#{s.seq}</Text>
                <Text style={[type.body, type.mono, { flex: 1 }]}>{s.chargeGr} gr</Text>
                <Text style={[type.secondary, type.mono]}>
                  × {shots} {shots === 1 ? 'shot' : 'shots'}
                </Text>
              </View>
            ))}
            <Text style={[type.body, { marginTop: spacing.md }]}>
              {steps.length} charges × {shots} {shots === 1 ? 'shot' : 'shots'} ={' '}
              {steps.length * shots} rounds
            </Text>
            <Text style={[type.secondary, { marginTop: spacing.xs, color: colors.textTertiary }]}>
              Load them in order and label each charge. Watch for pressure signs at every rung and
              stop there.
            </Text>
          </>
        ) : (
          <>
            <Text style={[type.body, { marginTop: spacing.xs }]}>
              {rounds ? `${rounds} rounds of:` : 'Rounds of:'}
            </Text>
            {ingredients.map((r) => (
              <View key={r.label} style={styles.row}>
                <Text style={type.secondary}>{r.label}</Text>
                <Text style={[type.body, type.mono, { flexShrink: 1, textAlign: 'right' }]}>
                  {r.value}
                </Text>
              </View>
            ))}
          </>
        )}
      </Card>

      <Card>
        <Text style={type.heading}>Next: a range day</Text>
        <Text style={[type.secondary, { marginTop: spacing.sm, lineHeight: 20 }]}>
          Nothing here is proven until you shoot it. Log a range session to record velocities,
          groups and the holds that actually worked — that is what turns this recipe into a range
          card.
        </Text>
      </Card>

      <Button label="Log Range Session" onPress={toSession} style={{ marginBottom: spacing.md }} />
      {workup ? (
        <Button
          label="Open Workup"
          variant="secondary"
          onPress={toWorkup}
          style={{ marginBottom: spacing.md }}
        />
      ) : null}
      <Button label="Done" variant="secondary" onPress={toLoad} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', paddingVertical: spacing.xl },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: 6,
  },
});
