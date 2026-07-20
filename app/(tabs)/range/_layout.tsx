import { Stack } from 'expo-router';
import { colors } from '@/theme';

export default function RangeLayout() {
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
      <Stack.Screen name="sessions/new" options={{ title: 'New Session' }} />
      <Stack.Screen name="sessions/[id]" options={{ title: 'Session' }} />
      <Stack.Screen name="cards/[rifleId]" options={{ title: 'Range Card' }} />
    </Stack>
  );
}
