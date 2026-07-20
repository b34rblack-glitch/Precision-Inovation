import { Link, Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing, type } from '@/theme';

// Safety net for any bad deep link — never strand the user on a dead screen.
export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Not Found' }} />
      <View style={styles.root}>
        <Text style={type.heading}>That screen doesn't exist.</Text>
        <Link href="/rifles" style={styles.link}>
          <Text style={styles.linkText}>Back to Rifles</Text>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  link: { marginTop: spacing.lg, paddingVertical: spacing.md },
  linkText: { color: colors.accent, fontSize: 16, fontWeight: '700' },
});
