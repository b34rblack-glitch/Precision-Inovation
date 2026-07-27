import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { eq } from 'drizzle-orm';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Text, View } from 'react-native';
import { Button } from '@/components/Buttons';
import { Card } from '@/components/Card';
import { db } from '@/db/client';
import { syncState } from '@/db/schema';
import {
  connectGoogle,
  currentGoogleAccount,
  describeSyncError,
  describeSyncReport,
  disconnectGoogle,
  runSync,
  type SyncPhase,
} from '@/sync/platform/runSync';
import { syncAvailability } from '@/sync/platform/syncAvailability';
import { colors, radii, spacing, type } from '@/theme';
import type { MergeWarning } from '@/sync/types';

const PHASE_LABEL: Record<SyncPhase, string> = {
  starting: 'Starting…',
  discovering: 'Finding your Drive folder…',
  pulling: 'Downloading from your other devices…',
  merging: 'Merging changes…',
  'backing-up': 'Saving a safety copy…',
  applying: 'Applying changes…',
  publishing: 'Uploading this device’s data…',
  done: 'Done',
};

function relative(when: Date | null | undefined): string {
  if (!when) return 'never';
  const seconds = Math.max(0, Math.round((Date.now() - when.getTime()) / 1000));
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  if (seconds < 86_400) return `${Math.round(seconds / 3600)} h ago`;
  return when.toLocaleDateString();
}

export function SyncCard() {
  const availability = syncAvailability();
  const { data } = useLiveQuery(db.select().from(syncState).where(eq(syncState.id, 1)));
  const state = data?.[0];

  const [account, setAccount] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [phase, setPhase] = useState<SyncPhase | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<MergeWarning[]>([]);

  useEffect(() => {
    if (!availability.available) return;
    void currentGoogleAccount().then((a) => setAccount(a?.email ?? null));
  }, [availability.available]);

  const connect = useCallback(async () => {
    setConnecting(true);
    try {
      const a = await connectGoogle();
      setAccount(a.email);
    } catch (e) {
      Alert.alert('Could not connect', describeSyncError(e));
    } finally {
      setConnecting(false);
    }
  }, []);

  const sync = useCallback(async () => {
    setPhase('starting');
    setSummary(null);
    setWarnings([]);
    try {
      const report = await runSync({ onPhase: setPhase });
      setSummary(describeSyncReport(report));
      setWarnings(report.warnings);
    } catch (e) {
      Alert.alert('Sync failed', describeSyncError(e));
      setSummary(null);
    } finally {
      setPhase(null);
    }
  }, []);

  const disconnect = useCallback(() => {
    Alert.alert(
      'Disconnect Google Drive?',
      'Your data stays on this device and stays in your Drive folder. This device just stops syncing.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            try {
              await disconnectGoogle();
              setAccount(null);
              setSummary(null);
            } catch (e) {
              Alert.alert('Could not disconnect', describeSyncError(e));
            }
          },
        },
      ],
    );
  }, []);

  if (!availability.available) {
    return (
      <Card>
        <Text style={type.heading}>Cloud sync</Text>
        <Text style={[type.secondary, { marginTop: spacing.sm }]}>{availability.message}</Text>
      </Card>
    );
  }

  const busy = phase !== null;

  return (
    <Card>
      <Text style={type.heading}>Cloud sync</Text>

      {account === null ? (
        <>
          <Text style={[type.secondary, { marginTop: spacing.sm, marginBottom: spacing.lg }]}>
            Sync between your phone and desktop using a folder in your own Google Drive. Your data
            stays yours — the app can only see the folder it creates, never the rest of your Drive,
            and there is no server in between.
          </Text>
          <Button
            label="Connect Google Drive"
            onPress={connect}
            loading={connecting}
            disabled={busy}
          />
        </>
      ) : (
        <>
          <Text style={[type.secondary, { marginTop: spacing.sm }]}>Signed in as {account}</Text>
          <Text style={[type.caption, { marginTop: spacing.xs, marginBottom: spacing.lg }]}>
            Last synced {relative(state?.lastSyncAt)}
            {state?.deviceName ? ` · this device is “${state.deviceName}”` : ''}
          </Text>

          {busy ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <ActivityIndicator color={colors.accent} />
              <Text style={type.secondary}>{PHASE_LABEL[phase]}</Text>
            </View>
          ) : (
            <Button label="Sync Now" onPress={sync} />
          )}

          {summary && !busy ? (
            <Text style={[type.caption, { marginTop: spacing.md, color: colors.success }]}>
              {summary}
            </Text>
          ) : null}

          {state?.lastSyncError && !busy && !summary ? (
            <Text style={[type.caption, { marginTop: spacing.md, color: colors.danger }]}>
              Last attempt failed: {state.lastSyncError}
            </Text>
          ) : null}

          {warnings.length > 0 ? (
            <View
              style={{
                marginTop: spacing.lg,
                padding: spacing.md,
                backgroundColor: colors.surfaceRaised,
                borderRadius: radii.md,
                gap: spacing.sm,
              }}
            >
              <Text style={type.label}>Worth knowing</Text>
              {warnings.map((w, i) => (
                <Text key={`${w.code}-${i}`} style={type.caption}>
                  • {w.message}
                </Text>
              ))}
            </View>
          ) : null}

          <Button
            label="Disconnect"
            variant="secondary"
            onPress={disconnect}
            disabled={busy}
            style={{ marginTop: spacing.lg }}
          />
        </>
      )}
    </Card>
  );
}
