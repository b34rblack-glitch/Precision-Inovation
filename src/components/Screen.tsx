import { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, type } from '@/theme';

// Bottom padding so scroll content clears the 60pt FAB plus breathing room.
const FAB_SIZE = 60;
const FAB_CLEARANCE = FAB_SIZE + spacing.xl * 2;

type Props = {
  title?: string;
  headerRight?: ReactNode;
  children: ReactNode;
  scroll?: boolean;
  style?: ViewStyle;
  /** Extra space at the bottom so content clears a FAB. */
  fabClearance?: boolean;
  /** Screen renders under a native stack header — skip the top safe-area inset. */
  underHeader?: boolean;
  /** Passed through to KeyboardAvoidingView (e.g. header height on iOS). */
  keyboardVerticalOffset?: number;
};

export function Screen({
  title,
  headerRight,
  children,
  scroll = true,
  style,
  fabClearance,
  underHeader,
  keyboardVerticalOffset = 0,
}: Props) {
  const insets = useSafeAreaInsets();
  const paddingTop = underHeader ? spacing.sm : insets.top + spacing.sm;
  const header = title ? (
    <View style={styles.header}>
      <Text style={type.title}>{title}</Text>
      {headerRight}
    </View>
  ) : null;

  if (!scroll) {
    return (
      <View style={[styles.root, { paddingTop }, style]}>
        {header}
        {children}
      </View>
    );
  }
  return (
    <View style={[styles.root, { paddingTop }]}>
      {header}
      <KeyboardAvoidingView
        style={styles.avoider}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={keyboardVerticalOffset}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            fabClearance && { paddingBottom: FAB_CLEARANCE },
            style,
          ]}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  avoider: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  scrollContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
});
