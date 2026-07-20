import { Stack } from 'expo-router';
import { colors } from '@/theme';

export default function RiflesLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="[id]/index" options={{ title: '' }} />
      <Stack.Screen name="[id]/edit" options={{ title: 'Rifle' }} />
      <Stack.Screen name="new" options={{ title: 'New Rifle' }} />
    </Stack>
  );
}
