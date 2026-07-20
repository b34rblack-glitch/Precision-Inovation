import { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, type } from '@/theme';

type Props = {
  title?: string;
  headerRight?: ReactNode;
  children: ReactNode;
  scroll?: boolean;
  style?: ViewStyle;
  /** Extra space at the bottom so content clears a FAB. */
  fabClearance?: boolean;
};

export function Screen({ title, headerRight, children, scroll = true, style, fabClearance }: Props) {
  const insets = useSafeAreaInsets();
  const header = title ? (
    <View style={styles.header}>
      <Text style={type.title}>{title}</Text>
      {headerRight}
    </View>
  ) : null;

  if (!scroll) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + spacing.sm }, style]}>
        {header}
        {children}
      </View>
    );
  }
  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.sm }]}>
      {header}
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          fabClearance && { paddingBottom: 120 },
          style,
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  scrollContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
});
