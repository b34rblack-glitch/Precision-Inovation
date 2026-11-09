import { Stack } from 'expo-router';
import { colors } from '@/theme';

export default function LoadsLayout() {
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
      <Stack.Screen name="[id]/edit" options={{ title: 'Load' }} />
      <Stack.Screen name="new" options={{ title: 'New Load' }} />
      <Stack.Screen name="[id]/workups/new" options={{ title: 'New Workup' }} />
      <Stack.Screen name="[id]/workups/[wid]" options={{ title: 'Workup' }} />
    </Stack>
  );
}
