import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import migrations from '../drizzle/migrations';
import { db, sqlite, tryInitDb } from '@/db/client';
import { ensureSyncBootstrap } from '@/db/syncBootstrap';
import { defaultDeviceName, platformTag } from '@/sync/platform/deviceLabel';
import { colors, spacing } from '@/theme';

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
