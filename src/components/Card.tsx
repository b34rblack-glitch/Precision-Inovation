import { ReactNode } from 'react';
import { Pressable, StyleSheet, View, ViewStyle } from 'react-native';
import { colors, radii, spacing } from '@/theme';

type Props = {
  children: ReactNode;
  onPress?: () => void;
  style?: ViewStyle;
  leading?: ReactNode;
  trailing?: ReactNode;
};

export function Card({ children, onPress, style, leading, trailing }: Props) {
  // Slots are opt-in: without leading/trailing, render children exactly as
  // before so existing call sites keep their layout untouched.
  const content =
    leading != null || trailing != null ? (
      <View style={styles.row}>
        {leading != null ? <View>{leading}</View> : null}
        <View style={styles.rowBody}>{children}</View>
        {trailing != null ? <View>{trailing}</View> : null}
      </View>
    ) : (
      children
    );

  if (!onPress) {
    return <View style={[styles.card, style]}>{content}</View>;
  }
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.card, pressed && styles.pressed, style]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  pressed: { backgroundColor: colors.surfaceRaised },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowBody: { flex: 1 },
});
