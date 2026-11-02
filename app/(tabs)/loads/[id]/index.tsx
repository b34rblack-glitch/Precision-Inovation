import Ionicons from '@expo/vector-icons/Ionicons';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import * as Print from 'expo-print';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/Buttons';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { CollapsibleSection } from '@/components/Form';
import { Screen } from '@/components/Screen';
import { batchesForLoadQuery, deleteBatch, setBatchFired } from '@/db/repositories/batches';
import { BatchModal } from '@/features/loads/BatchModal';
import { batchSummary } from '@/lib/batches/model';
import { landsForRifleQuery } from '@/db/repositories/lands';
import { archiveLoad, duplicateLoad, loadByIdQuery, unarchiveLoad, versionsForLoadQuery } from '@/db/repositories/loads';
import { rifleByIdQuery } from '@/db/repositories/rifles';
import { archivedWorkupsForLoadQuery, unarchiveWorkup, workupsForLoadQuery } from '@/db/repositories/workups';
import { deletionSummary, purge } from '@/db/repositories/purge';
import { ArchivedSection } from '@/components/ArchivedSection';
import { ConfirmDeleteModal } from '@/components/ConfirmDeleteModal';
import { writeSafetyBackup } from '@/lib/backup';
import { ingredientRows, recipeRows, recipeStages } from '@/features/loads/recipe';
import { recipeSheetHtml } from '@/lib/loads/recipeSheet';
import { colors, radii, spacing, type } from '@/theme';

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
  const { data: archivedWorkups } = useLiveQuery(archivedWorkupsForLoadQuery(id), [id]);
  const [deleteText, setDeleteText] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const { data: batches } = useLiveQuery(batchesForLoadQuery(id), [id]);
  const [batchOpen, setBatchOpen] = useState(false);
  const assignedRifleId = loadRows[0]?.rifleId ?? '';
  const { data: rifleRows } = useLiveQuery(rifleByIdQuery(assignedRifleId), [assignedRifleId]);
  const { data: lands } = useLiveQuery(landsForRifleQuery(assignedRifleId), [assignedRifleId]);
  const [printing, setPrinting] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
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

  // A recipe sheet to print and take to the bench: the current version's
  // targets, ingredients, the numbered stages with tick boxes, a batch log.
  const printRecipe = async () => {
    if (!current || printing) return;
    setPrinting(true);
    try {
      const html = recipeSheetHtml({
        load,
        version: current,
        rifle: assignedRifle ?? null,
        lands,
        batches: batches.map((b) => b.batch),
        generatedOn: new Date(),
      });
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Recipe sheet' });
      } else {
        Alert.alert('Saved', `The recipe sheet was written to ${uri}`);
      }
    } catch (e) {
      Alert.alert('Could not make the sheet', e instanceof Error ? e.message : String(e));
    } finally {
      setPrinting(false);
    }
  };

  // A copy to tweak: same rifle, cartridge and recipe, no history.
  const duplicate = async () => {
    if (duplicating) return;
    setDuplicating(true);
    try {
      const copy = await duplicateLoad(load.id);
      router.push(`/loads/${copy.id}/edit`);
    } catch (e) {
      Alert.alert('Could not duplicate', e instanceof Error ? e.message : String(e));
    } finally {
      setDuplicating(false);
    }
  };

  const unarchive = () =>
    unarchiveLoad(load.id).catch((e) => Alert.alert('Could not unarchive', e instanceof Error ? e.message : String(e)));

  // Delete, two steps: an alert listing what goes, then the name typed back.
  const startDelete = async () => {
    try {
      const { text } = await deletionSummary('loads', load.id);
      Alert.alert(
        'Delete this load for good?',
        text
          ? `Along with it: ${text}. Sessions shot with it stay, with the load cleared. This cannot be undone from the app.`
          : 'This cannot be undone from the app.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Continue', style: 'destructive', onPress: () => setDeleteText(text) },
        ],
      );
    } catch (e) {
      Alert.alert('Could not plan the delete', e instanceof Error ? e.message : String(e));
    }
  };
  const finishDelete = async () => {
    setDeleting(true);
    try {
      await writeSafetyBackup('precision-pre-delete-backup.json');
      await purge('loads', load.id);
      setDeleteText(null);
      router.replace('/loads');
    } catch (e) {
      Alert.alert('Delete failed', e instanceof Error ? e.message : String(e));
    } finally {
      setDeleting(false);
    }
  };

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

      {current ? (
        <View style={{ flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md }}>
          <Button label="Print Recipe Sheet" variant="secondary" onPress={printRecipe} loading={printing} style={{ flex: 1 }} />
          <Button label="Duplicate" variant="secondary" onPress={duplicate} loading={duplicating} />
        </View>
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

      {current ? (
        <Card>
          <View style={styles.versionBadgeRow}>
            <Text style={type.label}>Batches</Text>
            <Pressable onPress={() => setBatchOpen(true)} hitSlop={8} accessibilityRole="button">
              <Text style={styles.link}>Log batch</Text>
            </Pressable>
          </View>
          {batches.length === 0 ? (
            <Text style={type.secondary}>
              No batches logged. Each time you load this recipe, log how many rounds, the lots, and the
              runout you measured; the recipe sheet, Compare Loads and your range sessions all read it.
            </Text>
          ) : (
            batches.map(({ batch: b, versionNumber }) => (
              <View key={b.id} style={styles.batchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={type.body}>
                    {new Date(b.date).toLocaleDateString()} · v{versionNumber}
                    {b.firedAt ? <Text style={type.caption}> · shot</Text> : null}
                  </Text>
                  <Text style={type.caption}>{batchSummary(b) || 'no details'}</Text>
                  {[b.brassLot && `brass ${b.brassLot}`, b.powderLot && `powder ${b.powderLot}`, b.primerLot && `primer ${b.primerLot}`, b.bulletLot && `bullet ${b.bulletLot}`].some(Boolean) ? (
                    <Text style={type.caption}>
                      {[b.brassLot && `brass ${b.brassLot}`, b.powderLot && `powder ${b.powderLot}`, b.primerLot && `primer ${b.primerLot}`, b.bulletLot && `bullet ${b.bulletLot}`].filter(Boolean).join(' · ')}
                    </Text>
                  ) : null}
                  {b.notes ? <Text style={type.caption}>{b.notes}</Text> : null}
                </View>
                <Pressable
                  onPress={() => setBatchFired(b.id, !b.firedAt).catch((e) => Alert.alert('Could not update', e instanceof Error ? e.message : String(e)))}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={b.firedAt ? 'Mark batch as not shot' : 'Mark batch as shot'}
                >
                  <Ionicons name={b.firedAt ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={b.firedAt ? colors.accent : colors.textTertiary} />
                </Pressable>
                <Pressable
                  onPress={() =>
                    Alert.alert('Delete batch?', 'Sessions that pointed at it keep their data, with the batch link cleared.', [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Delete', style: 'destructive', onPress: () => deleteBatch(b.id).catch((e) => Alert.alert('Delete failed', e instanceof Error ? e.message : String(e))) },
                    ])
                  }
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Delete batch"
                >
                  <Ionicons name="trash-outline" size={20} color={colors.textTertiary} />
                </Pressable>
              </View>
            ))
          )}
          <Text style={[type.caption, { marginTop: spacing.sm, color: colors.textTertiary }]}>
            The circle marks a batch as shot, which adds its rounds to the rifle's round count.
          </Text>
        </Card>
      ) : null}
      {current ? <BatchModal visible={batchOpen} version={current} onClose={() => setBatchOpen(false)} /> : null}

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

      <ArchivedSection
        noun="workup"
        rows={archivedWorkups.map((w) => ({
          id: w.id,
          title: WORKUP_LABELS[w.type] ?? w.type,
          subtitle: new Date(w.createdAt).toLocaleDateString(),
          archivedAt: w.archivedAt,
        }))}
        onOpen={(wid) => router.push(`/loads/${load.id}/workups/${wid}`)}
        onUnarchive={unarchiveWorkup}
      />

      {load.archivedAt ? (
        <View style={styles.archivedBox}>
          <Text style={type.secondary}>This load is archived: hidden from lists, kept in full.</Text>
          <Button label="Unarchive" variant="secondary" onPress={() => void unarchive()} style={{ marginTop: spacing.md }} />
          <Button label="Delete Permanently" variant="danger" onPress={() => void startDelete()} style={{ marginTop: spacing.md }} />
        </View>
      ) : (
        <Pressable
          onPress={confirmArchive}
          style={styles.archiveBtn}
          accessibilityRole="button"
          accessibilityLabel="Archive load"
        >
          <Text style={{ color: colors.danger, fontSize: 15, fontWeight: '600' }}>Archive load</Text>
        </Pressable>
      )}
      <ConfirmDeleteModal
        visible={deleteText !== null}
        noun="load"
        name={load.name}
        takesWith={deleteText ?? ''}
        busy={deleting}
        onCancel={() => setDeleteText(null)}
        onConfirm={() => void finishDelete()}
      />
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
  batchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  link: { color: colors.accent, fontSize: 14, fontWeight: '600' },
  archivedBox: { marginVertical: spacing.xl, padding: spacing.lg, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border },
});
