import { ReactNode } from 'react';
import { Pressable, StyleSheet, ViewStyle } from 'react-native';
import { colors, radii, spacing } from '@/theme';

type Props = {
  children: ReactNode;
  onPress?: () => void;
  style?: ViewStyle;
};

export function Card({ children, onPress, style }: Props) {
  if (!onPress) {
    return <Pressable style={[styles.card, style]}>{children}</Pressable>;
  }
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed, style]}
    >
      {children}
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
});
