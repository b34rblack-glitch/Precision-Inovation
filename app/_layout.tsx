import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { Stack, useRouter, type ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, Share, Text, View } from 'react-native';
import migrations from '../drizzle/migrations';
import { Button } from '@/components/Buttons';
import { db, sqlite, tryInitDb } from '@/db/client';
import { ensureSyncBootstrap } from '@/db/syncBootstrap';
import {
  formatCrashReport,
  installCrashCapture,
  readCrashReport,
  reportFor,
  writeCrashReport,
} from '@/lib/crashLog';
import { defaultDeviceName, platformTag } from '@/sync/platform/deviceLabel';
import { colors, spacing, type } from '@/theme';

// Before anything renders: an uncaught error now leaves a report behind
// (Settings → Last crash) instead of only closing the app.
installCrashCapture();

/**
 * Render errors anywhere in the tree land here instead of taking the process
 * down. The report is written to the same file the global handler uses, so
 * the message survives a restart either way.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const report = reportFor(error, 'error-boundary', { fatal: false });
  useEffect(() => writeCrashReport(report), [error]); // eslint-disable-line react-hooks/exhaustive-deps
  const text = formatCrashReport(report);
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing.xl, paddingTop: 64 }}>
      <Text style={type.heading}>Something went wrong</Text>
      <Text style={[type.secondary, { marginTop: spacing.sm }]}>
        The screen hit an error. Share this report so it can be fixed, then try again.
      </Text>
      <ScrollView style={{ flex: 1, marginVertical: spacing.lg }}>
        <Text style={[type.caption, { fontFamily: 'monospace', color: colors.text }]} selectable>
          {text}
        </Text>
      </ScrollView>
      <Button label="Share Report" variant="secondary" onPress={() => void Share.share({ message: text })} />
      <Button label="Try Again" onPress={retry} style={{ marginTop: spacing.md }} />
    </View>
  );
}

/** Once per launch: if the last run ended in a crash, say so and offer the report. */
function CrashNotice() {
  const router = useRouter();
  useEffect(() => {
    const report = readCrashReport();
    if (!report) return;
    Alert.alert(
      'The app closed unexpectedly',
      `Last time it hit: ${report.message}\n\nThe full report is under Settings → Last crash.`,
      [
        { text: 'Later', style: 'cancel' },
        { text: 'Open Settings', onPress: () => router.push('/settings') },
      ],
    );
  }, [router]);
  return null;
}

export default function RootLayout() {
  // Init the db here (lazily, once) so an open failure surfaces as UI instead
  // of a native crash at module load. useMigrations stays unconditional per
  // the rules of hooks; with a broken db its migrate() rejects harmlessly.
  const [dbError] = useState<Error | null>(() => tryInitDb());
  const { success, error } = useMigrations(db, migrations);

  // Mint this device's sync identity and backfill logical timestamps for rows
  // that predate sync. Runs after migrations and blocks the UI until done, so
  // no write can reach a table before its bookkeeping row exists.
  const [syncReady, setSyncReady] = useState(false);
  const [syncError, setSyncError] = useState<Error | null>(null);
  useEffect(() => {
    if (!success || syncReady || syncError) return;
    try {
      ensureSyncBootstrap(sqlite, {
        deviceName: defaultDeviceName(),
        platform: platformTag(),
      });
      setSyncReady(true);
    } catch (e) {
      setSyncError(e instanceof Error ? e : new Error(String(e)));
    }
  }, [success, syncReady, syncError]);

  if (dbError) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', padding: spacing.xl }}>
        <Text style={{ color: colors.danger, fontSize: 16 }}>
          Could not open the database: {dbError.message}
        </Text>
      </View>
    );
  }
  if (error) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', padding: spacing.xl }}>
        <Text style={{ color: colors.danger, fontSize: 16 }}>
          Database migration failed: {error.message}
        </Text>
      </View>
    );
  }
  if (syncError) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', padding: spacing.xl }}>
        <Text style={{ color: colors.danger, fontSize: 16 }}>
          Could not prepare sync data: {syncError.message}
        </Text>
      </View>
    );
  }
  if (!success || !syncReady) {
    return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  }

  return (
    <>
      <CrashNotice />
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.text,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="field-card/[rifleId]"
          options={{ headerShown: false, presentation: 'fullScreenModal' }}
        />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
      </Stack>
    </>
  );
}
