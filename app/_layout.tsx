import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Text, View } from 'react-native';
import migrations from '../drizzle/migrations';
import { db, tryInitDb } from '@/db/client';
import { colors, spacing } from '@/theme';

export default function RootLayout() {
  // Init the db here (lazily, once) so an open failure surfaces as UI instead
  // of a native crash at module load. useMigrations stays unconditional per
  // the rules of hooks; with a broken db its migrate() rejects harmlessly.
  const [dbError] = useState<Error | null>(() => tryInitDb());
  const { success, error } = useMigrations(db, migrations);

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
  if (!success) {
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
