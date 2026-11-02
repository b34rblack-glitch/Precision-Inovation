import Ionicons from '@expo/vector-icons/Ionicons';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/Buttons';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import {
  allLoadVersionsQuery,
  allShotStringsQuery,
  allWorkupStepsQuery,
  sessionsForRifleQuery,
  workupsForRifleQuery,
} from '@/db/repositories/compare';
import { deleteLandsMeasurement, landsForRifleQuery } from '@/db/repositories/lands';
import { archiveRifle, rifleByIdQuery, unarchiveRifle, updateRifle } from '@/db/repositories/rifles';
import { deletionSummary, purge } from '@/db/repositories/purge';
import { ConfirmDeleteModal } from '@/components/ConfirmDeleteModal';
import { writeSafetyBackup } from '@/lib/backup';
import { loadsForRifleQuery } from '@/db/repositories/loads';
import { recentSessionsForRifleQuery } from '@/db/repositories/sessions';
import { LandsModal, type BulletChoice } from '@/features/rifles/LandsModal';
import { shareRifle } from '@/lib/backup';
import { allBatchesQuery } from '@/db/repositories/batches';
import { roundCountWithBatches } from '@/lib/batches/model';
import { zeroAgeDays } from '@/lib/rifle/profile';
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
  const { data, updatedAt } = useLiveQuery(rifleByIdQuery(id), [id]);
  const { data: rifleLoads } = useLiveQuery(loadsForRifleQuery(id), [id]);
  const { data: sessions } = useLiveQuery(recentSessionsForRifleQuery(id, 5), [id]);
  const { data: lands } = useLiveQuery(landsForRifleQuery(id), [id]);
  const { data: versions } = useLiveQuery(allLoadVersionsQuery());
  // Round count: every chronograph string on this rifle's sessions and workups.
  const { data: allSessions } = useLiveQuery(sessionsForRifleQuery(id), [id]);
  const { data: rifleWorkups } = useLiveQuery(workupsForRifleQuery(id), [id]);
  const { data: steps } = useLiveQuery(allWorkupStepsQuery());
  const { data: strings } = useLiveQuery(allShotStringsQuery());
  const { data: allBatches } = useLiveQuery(allBatchesQuery());
  const [sharing, setSharing] = useState(false);
  const [landsOpen, setLandsOpen] = useState(false);
  const [deleteText, setDeleteText] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const rifle = data[0];

  // Round count: every chrono string on this rifle's sessions and workups,
  // plus every batch of its loads marked shot (strings from a session tied
  // to such a batch are not counted twice).
  const rounds = useMemo(() => {
    const sessionById = new Map(allSessions.map((s) => [s.id, s]));
    const workupIds = new Set(rifleWorkups.map((w) => w.id));
    const stepIds = new Set(steps.filter((st) => workupIds.has(st.workupId)).map((st) => st.id));
    const stringRows = strings
      .filter((str) => (str.sessionId && sessionById.has(str.sessionId)) || (str.workupStepId && stepIds.has(str.workupStepId)))
      .map((str) => ({ shots: str.shotCount, sessionBatchId: str.sessionId ? (sessionById.get(str.sessionId)?.batchId ?? null) : null }));
    const loadIds = new Set(rifleLoads.map((l) => l.id));
    const versionIds = new Set(versions.filter((v) => loadIds.has(v.loadId)).map((v) => v.id));
    const batchRows = allBatches
      .filter((b) => versionIds.has(b.loadVersionId))
      .map((b) => ({ id: b.id, quantity: b.quantity, fired: b.firedAt != null }));
    return roundCountWithBatches({ baseline: rifle?.roundCountBaseline, strings: stringRows, batches: batchRows }).total;
  }, [allSessions, rifleWorkups, steps, strings, rifleLoads, versions, allBatches, rifle?.roundCountBaseline]);

  // Bullets this rifle's loads use, for the lands modal's one-tap prefills.
  const bullets = useMemo<BulletChoice[]>(() => {
    const seen = new Map<string, BulletChoice>();
    for (const load of rifleLoads) {
      const v = versions.find((x) => x.id === load.currentVersionId);
      if (!v?.bulletMake && !v?.bulletModel) continue;
      const choice = { make: v.bulletMake ?? '', model: v.bulletModel ?? '', weightGr: v.bulletWeightGr ?? null };
      seen.set(`${choice.make}|${choice.model}|${choice.weightGr}`, choice);
    }
    return [...seen.values()];
  }, [rifleLoads, versions]);
  if (!rifle) {
    // updatedAt is undefined until the live query's first emission — stay blank
    // while loading; only after it emits with no row is this truly not found.
    if (updatedAt === undefined) return <Screen underHeader>{null}</Screen>;
    return (
      <Screen underHeader>
        <EmptyState
          icon="alert-circle-outline"
          title="Rifle not found"
          message="This rifle may have been archived or deleted."
          action={{ label: 'Back to Rifles', onPress: () => router.replace('/rifles') }}
        />
      </Screen>
    );
  }

  const unarchive = () =>
    unarchiveRifle(rifle.id).catch((e) => Alert.alert('Could not unarchive', e instanceof Error ? e.message : String(e)));

  // Delete, two steps: an alert listing what goes, then the name typed back.
  const startDelete = async () => {
    try {
      const { text } = await deletionSummary('rifles', rifle.id);
      Alert.alert(
        'Delete this rifle for good?',
        text
          ? `Along with it: ${text}. This cannot be undone from the app.`
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
      await purge('rifles', rifle.id);
      setDeleteText(null);
      router.replace('/rifles');
    } catch (e) {
      Alert.alert('Delete failed', e instanceof Error ? e.message : String(e));
    } finally {
      setDeleting(false);
    }
  };

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

  // One file with this rifle, its loads, sessions, DOPE and range cards, for
  // a friend to add to their own app (Settings → Add from Backup).
  const doShare = async () => {
    setSharing(true);
    try {
      await shareRifle(rifle);
    } catch (e) {
      Alert.alert('Share failed', e instanceof Error ? e.message : String(e));
    } finally {
      setSharing(false);
    }
  };

  const zeroAge = zeroAgeDays(rifle.zeroVerifiedAt, Date.now());
  const zeroText =
    zeroAge === null
      ? 'not yet confirmed'
      : zeroAge === 0
        ? 'confirmed today'
        : `confirmed ${zeroAge} ${zeroAge === 1 ? 'day' : 'days'} ago`;
  const markZeroChecked = () => {
    Alert.alert('Zero checked today?', 'Records today as the last time this zero was confirmed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Yes',
        onPress: async () => {
          try {
            await updateRifle(rifle.id, { zeroVerifiedAt: new Date() });
          } catch (e) {
            Alert.alert('Save failed', e instanceof Error ? e.message : String(e));
          }
        },
      },
    ]);
  };
  const confirmDeleteLands = (entryId: string, label: string) => {
    Alert.alert('Delete measurement?', `${label} will be removed from the log.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteLandsMeasurement(entryId);
          } catch (e) {
            Alert.alert('Delete failed', e instanceof Error ? e.message : String(e));
          }
        },
      },
    ]);
  };
  const inches = (n: number | null) => (n == null ? null : `${n}"`);
  const chamberedText = rifle.barrelChamberedAt ? new Date(rifle.barrelChamberedAt).toLocaleDateString() : null;

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
        <SpecRow label="Zero check" value={zeroText} />
        <SpecRow label="Rounds fired" value={rounds > 0 || rifle.roundCountBaseline != null ? `${rounds}` : null} />
        {rifle.notes ? (
          <Text style={[type.secondary, { marginTop: spacing.sm }]}>{rifle.notes}</Text>
        ) : null}
        <Pressable onPress={markZeroChecked} style={styles.inlineAction} accessibilityRole="button">
          <Text style={styles.link}>Zero checked today</Text>
        </Pressable>
      </Card>

      {[rifle.headspaceIn, rifle.chamberSpec, rifle.freeboreIn, rifle.chamberNeckDiameterIn, rifle.magazineMaxCoalIn].some((v) => v != null) ? (
        <Card>
          <Text style={[type.label, { marginBottom: spacing.xs }]}>Chamber</Text>
          <SpecRow
            label="Headspace (fired)"
            value={rifle.headspaceIn != null ? `${rifle.headspaceIn}"${rifle.headspaceInsert ? ` · ${rifle.headspaceInsert}` : ''}` : null}
          />
          <SpecRow label="Chamber" value={rifle.chamberSpec} />
          <SpecRow label="Freebore" value={inches(rifle.freeboreIn)} />
          <SpecRow label="Neck diameter" value={inches(rifle.chamberNeckDiameterIn)} />
          <SpecRow label="Magazine max COAL" value={inches(rifle.magazineMaxCoalIn)} />
        </Card>
      ) : null}

      {[rifle.barrelMaker, rifle.barrelContour, rifle.riflingType, rifle.barrelChamberedAt, rifle.muzzleDevice].some((v) => v != null) ? (
        <Card>
          <Text style={[type.label, { marginBottom: spacing.xs }]}>Barrel & muzzle</Text>
          <SpecRow label="Barrel" value={[rifle.barrelMaker, rifle.barrelContour].filter(Boolean).join(' · ') || null} />
          <SpecRow label="Rifling" value={rifle.riflingType} />
          <SpecRow label="Chambered" value={chamberedText} />
          <SpecRow label="Muzzle" value={rifle.muzzleDevice} />
          {rifle.muzzleDeviceNotes ? (
            <Text style={[type.secondary, { marginTop: spacing.sm }]}>{rifle.muzzleDeviceNotes}</Text>
          ) : null}
        </Card>
      ) : null}

      {[rifle.actionMake, rifle.actionModel, rifle.boltFace, rifle.stock, rifle.triggerMake, rifle.triggerPullLb, rifle.rifleWeightLb].some((v) => v != null) ? (
        <Card>
          <Text style={[type.label, { marginBottom: spacing.xs }]}>Action & trigger</Text>
          <SpecRow label="Action" value={[rifle.actionMake, rifle.actionModel].filter(Boolean).join(' ') || null} />
          <SpecRow label="Bolt face" value={rifle.boltFace} />
          <SpecRow label="Stock" value={rifle.stock} />
          <SpecRow
            label="Trigger"
            value={[rifle.triggerMake, rifle.triggerPullLb != null ? `${rifle.triggerPullLb} lb` : null].filter(Boolean).join(' · ') || null}
          />
          <SpecRow label="Weight" value={rifle.rifleWeightLb != null ? `${rifle.rifleWeightLb} lb` : null} />
        </Card>
      ) : null}

      {[rifle.reticle, rifle.focalPlane, rifle.clickValue, rifle.turretTravelPerRev, rifle.railCantMoa, rifle.ringHeightIn].some((v) => v != null) || rifle.zeroStop ? (
        <Card>
          <Text style={[type.label, { marginBottom: spacing.xs }]}>Optic detail</Text>
          <SpecRow label="Reticle" value={[rifle.reticle, rifle.focalPlane].filter(Boolean).join(' · ') || null} />
          <SpecRow label="Click" value={rifle.clickValue != null ? `${rifle.clickValue} ${rifle.turretUnit}` : null} />
          <SpecRow label="Per revolution" value={rifle.turretTravelPerRev != null ? `${rifle.turretTravelPerRev} ${rifle.turretUnit}` : null} />
          <SpecRow label="Zero stop" value={rifle.zeroStop ? 'Yes' : null} />
          <SpecRow label="Rail cant" value={rifle.railCantMoa != null ? `${rifle.railCantMoa} MOA` : null} />
          <SpecRow label="Ring height" value={inches(rifle.ringHeightIn)} />
        </Card>
      ) : null}

      <Card>
        <View style={styles.cardHead}>
          <Text style={type.label}>Distance to lands</Text>
          <Pressable onPress={() => setLandsOpen(true)} hitSlop={8} accessibilityRole="button">
            <Text style={styles.link}>Add measurement</Text>
          </Pressable>
        </View>
        {lands.length === 0 ? (
          <Text style={type.secondary}>
            No touch-the-lands readings yet. Each bullet's reading lets its loads derive their jump,
            and the series over round count shows throat wear.
          </Text>
        ) : (
          lands.map((l) => {
            const bullet = [l.bulletMake, l.bulletModel, l.bulletWeightGr != null ? `${l.bulletWeightGr} gr` : null].filter(Boolean).join(' ') || 'Unnamed bullet';
            return (
              <View key={l.id} style={styles.landsRow}>
                <View style={{ flex: 1 }}>
                  <Text style={type.body}>
                    {bullet} · <Text style={type.mono}>{l.cbtoIn.toFixed(3)}"</Text>
                  </Text>
                  <Text style={type.caption}>
                    {[
                      new Date(l.measuredAt).toLocaleDateString(),
                      l.roundCount != null ? `${l.roundCount} rds` : null,
                      l.comparatorInsert,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                    {l.notes ? ` · ${l.notes}` : ''}
                  </Text>
                </View>
                <Pressable
                  onPress={() => confirmDeleteLands(l.id, `${bullet} at ${l.cbtoIn.toFixed(3)}"`)}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={`Delete ${bullet} measurement`}
                >
                  <Ionicons name="trash-outline" size={20} color={colors.textTertiary} />
                </Pressable>
              </View>
            );
          })
        )}
      </Card>
      <LandsModal
        visible={landsOpen}
        rifleId={rifle.id}
        bullets={bullets}
        roundCountNow={rounds}
        defaultInsert={null}
        onClose={() => setLandsOpen(false)}
      />

      <Button
        label="Range Card"
        onPress={() => router.push(`/range/cards/${rifle.id}`)}
        style={{ marginBottom: spacing.md }}
      />
      {rifleLoads.length > 0 ? (
        <Button
          label="Compare Loads"
          variant="secondary"
          onPress={() => router.push(`/range/compare/${rifle.id}`)}
          style={{ marginBottom: spacing.md }}
        />
      ) : null}
      <Button
        label="Share Rifle"
        variant="secondary"
        onPress={doShare}
        loading={sharing}
        style={{ marginBottom: spacing.lg }}
      />

      <Text style={[type.label, { marginBottom: spacing.sm }]}>Loads for this rifle</Text>
      {rifleLoads.length === 0 ? (
        <Text style={[type.secondary, { marginBottom: spacing.md }]}>
          No loads assigned to this rifle yet.
        </Text>
      ) : (
        rifleLoads.map((load) => (
          <Card key={load.id} onPress={() => router.push(`/loads/${load.id}`)}>
            <Text style={type.body}>{load.name}</Text>
            {load.cartridge ? <Text style={type.secondary}>{load.cartridge}</Text> : null}
          </Card>
        ))
      )}
      <Button
        label="New Load for this Rifle"
        variant="secondary"
        onPress={() => router.push(`/loads/new?rifleId=${rifle.id}`)}
        style={{ marginBottom: spacing.lg }}
      />

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

      {rifle.archivedAt ? (
        <View style={styles.archivedBox}>
          <Text style={type.secondary}>This rifle is archived: hidden from lists, kept in full with its loads and sessions.</Text>
          <Button label="Unarchive" variant="secondary" onPress={() => void unarchive()} style={{ marginTop: spacing.md }} />
          <Button label="Delete Permanently" variant="danger" onPress={() => void startDelete()} style={{ marginTop: spacing.md }} />
        </View>
      ) : (
        <Pressable
          onPress={confirmArchive}
          style={styles.archiveBtn}
          accessibilityRole="button"
          accessibilityLabel="Archive rifle"
        >
          <Text style={{ color: colors.danger, fontSize: 15, fontWeight: '600' }}>Archive rifle</Text>
        </Pressable>
      )}
      <ConfirmDeleteModal
        visible={deleteText !== null}
        noun="rifle"
        name={rifle.name}
        takesWith={deleteText ?? ''}
        busy={deleting}
        onCancel={() => setDeleteText(null)}
        onConfirm={() => void finishDelete()}
      />
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
  archivedBox: { marginVertical: spacing.xl, padding: spacing.lg, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border },
  inlineAction: { alignSelf: 'flex-start', marginTop: spacing.sm },
  link: { color: colors.accent, fontSize: 14, fontWeight: '600' },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  landsRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
});
