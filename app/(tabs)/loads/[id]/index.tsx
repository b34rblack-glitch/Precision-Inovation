import { Ionicons } from '@expo/vector-icons';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/Buttons';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { CollapsibleSection } from '@/components/Form';
import { Screen } from '@/components/Screen';
import { archiveLoad, loadByIdQuery, versionsForLoadQuery } from '@/db/repositories/loads';
import { rifleByIdQuery } from '@/db/repositories/rifles';
import { workupsForLoadQuery } from '@/db/repositories/workups';
import { ingredientRows, recipeRows, recipeStages } from '@/features/loads/recipe';
import { colors, spacing, type } from '@/theme';

function ComponentRow({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <View style={styles.compRow}>
      <Text style={type.secondary}>{label}</Text>
      <Text style={[type.body, { fontVariant: ['tabular-nums'] }]}>{value}</Text>
    </View>
  );
}

const WORKUP_LABELS: Record<string, string> = {
  ladder: 'Ladder test',
  ocw: 'OCW test',
  velocity: 'Velocity ladder',
  freeform: 'Freeform notes',
};

export default function LoadDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: loadRows, updatedAt } = useLiveQuery(loadByIdQuery(id), [id]);
  const { data: versions } = useLiveQuery(versionsForLoadQuery(id), [id]);
  const { data: loadWorkups } = useLiveQuery(workupsForLoadQuery(id), [id]);
  const assignedRifleId = loadRows[0]?.rifleId ?? '';
  const { data: rifleRows } = useLiveQuery(rifleByIdQuery(assignedRifleId), [assignedRifleId]);
  const load = loadRows[0];
  if (!load) {
    // updatedAt is undefined until the live query's first emission — stay blank
    // while loading; only after it emits with no row is this truly not found.
    if (updatedAt === undefined) return <Screen underHeader>{null}</Screen>;
    return (
      <Screen underHeader>
        <EmptyState
          icon="alert-circle-outline"
          title="Load not found"
          message="This load may have been archived or deleted."
          action={{ label: 'Back to Loads', onPress: () => router.replace('/loads') }}
        />
      </Screen>
    );
  }
  const current = versions.find((v) => v.id === load.currentVersionId) ?? versions[0];
  const assignedRifle = rifleRows[0];
  // The recipe reads top-down like a method: ingredients, then the numbered
  // steps. Stages with nothing recorded are dropped entirely.
  const ingredients = current ? ingredientRows(current) : [];
  const stages = recipeStages(current);

  const confirmArchive = () => {
    Alert.alert('Archive load?', `"${load.name}" will be hidden but its history is kept.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Archive',
        style: 'destructive',
        onPress: async () => {
          try {
            await archiveLoad(load.id);
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
          title: load.name,
          headerRight: () => (
            <Pressable
              onPress={() => router.push(`/loads/${load.id}/edit`)}
              hitSlop={14}
              accessibilityRole="button"
              accessibilityLabel="Edit load"
            >
              <Ionicons name="pencil" size={20} color={colors.accent} />
            </Pressable>
          ),
        }}
      />

      {assignedRifle ? (
        <Card onPress={() => router.push(`/rifles/${assignedRifle.id}`)}>
          <View style={styles.rifleRow}>
            <View style={{ flex: 1 }}>
              <Text style={type.label}>Rifle</Text>
              <Text style={[type.body, { marginTop: 2 }]}>{assignedRifle.name}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
          </View>
        </Card>
      ) : null}

      {current ? (
        <>
          <Card>
            <View style={styles.versionBadgeRow}>
              <Text style={type.label}>Current recipe</Text>
              <Text style={[type.label, { color: colors.accent }]}>v{current.versionNumber}</Text>
            </View>
            <Text style={[type.heading, styles.groupHeading]}>Ingredients</Text>
            {ingredients.length === 0 ? (
              <Text style={type.secondary}>No components recorded yet.</Text>
            ) : (
              ingredients.map((row) => (
                <ComponentRow key={row.label} label={row.label} value={row.value} />
              ))
            )}
          </Card>

          {stages.map((stage) => (
            <CollapsibleSection key={stage.key} title={stage.title} initiallyOpen>
              {stage.rows.map((row) => (
                <ComponentRow key={row.label} label={row.label} value={row.value} />
              ))}
              {stage.notes.map((note) => (
                <View key={note.label} style={styles.noteBlock}>
                  <Text style={type.label}>{note.label}</Text>
                  <Text style={[type.secondary, { marginTop: 2 }]}>{note.text}</Text>
                </View>
              ))}
            </CollapsibleSection>
          ))}

          {stages.length === 0 ? (
            <Text style={[type.secondary, styles.recipePrompt]}>
              No process detail recorded yet. Tap the pencil to log case prep, sizing, priming,
              charging, seating and QC — everything needed to load this again exactly.
            </Text>
          ) : null}
        </>
      ) : null}

      <Button
        label="Start a Workup"
        onPress={() => router.push(`/loads/${load.id}/workups/new`)}
        style={{ marginBottom: load.rifleId ? spacing.md : spacing.lg }}
      />

      {load.rifleId ? (
        <View style={{ marginBottom: spacing.lg, gap: spacing.md }}>
          {load.currentVersionId ? (
            <Button
              label="Range Card"
              onPress={() => router.push(`/range/cards/${load.rifleId}?loadId=${load.id}`)}
            />
          ) : null}
          <Button
            label="Log Range Session"
            variant="secondary"
            onPress={() =>
              router.push(`/range/sessions/new?rifleId=${load.rifleId}&loadId=${load.id}`)
            }
          />
        </View>
      ) : null}

      <Text style={[type.label, { marginBottom: spacing.sm }]}>Workups</Text>
      {loadWorkups.length === 0 ? (
        <Text style={[type.secondary, { marginBottom: spacing.lg }]}>
          No workups yet. A workup walks you through a ladder, OCW, or velocity test for this load.
        </Text>
      ) : (
        loadWorkups.map((w) => (
          <Card key={w.id} onPress={() => router.push(`/loads/${load.id}/workups/${w.id}`)}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <Text style={type.body}>{WORKUP_LABELS[w.type] ?? w.type}</Text>
                <Text style={type.secondary}>
                  {w.startChargeGr != null && w.incrementGr != null && w.stepCount != null
                    ? `${w.startChargeGr}–${(
                        w.startChargeGr + w.incrementGr * (w.stepCount - 1)
                      ).toFixed(1)}gr in ${w.incrementGr}gr steps`
                    : new Date(w.createdAt).toLocaleDateString()}
                </Text>
              </View>
              <Text
                style={[
                  type.label,
                  { color: w.status === 'complete' ? colors.success : colors.textSecondary },
                ]}
              >
                {w.status.replace('_', ' ')}
              </Text>
            </View>
          </Card>
        ))
      )}

      {versions.length > 1 ? (
        <>
          <Text style={[type.label, { marginTop: spacing.lg, marginBottom: spacing.sm }]}>
            Version history
          </Text>
          {versions
            .filter((v) => v.id !== load.currentVersionId)
            .map((v) => (
              <Card key={v.id}>
                <View style={styles.versionBadgeRow}>
                  <Text style={type.body}>v{v.versionNumber}</Text>
                  <Text style={type.secondary}>{new Date(v.createdAt).toLocaleDateString()}</Text>
                </View>
                {recipeRows(v).map((row) => (
                  <ComponentRow key={row.label} label={row.label} value={row.value} />
                ))}
              </Card>
            ))}
        </>
      ) : null}

      <Pressable
        onPress={confirmArchive}
        style={styles.archiveBtn}
        accessibilityRole="button"
        accessibilityLabel="Archive load"
      >
        <Text style={{ color: colors.danger, fontSize: 15, fontWeight: '600' }}>Archive load</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  compRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
  groupHeading: { marginBottom: spacing.xs },
  noteBlock: { paddingVertical: spacing.sm },
  recipePrompt: { marginBottom: spacing.lg, color: colors.textTertiary },
  rifleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  versionBadgeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  archiveBtn: { alignItems: 'center', paddingVertical: spacing.xl },
});
