import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radii, spacing, touchTarget } from '@/theme';

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  style?: ViewStyle;
};

export function Button({ label, onPress, variant = 'primary', disabled, style }: ButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.btn,
        variant === 'primary' && { backgroundColor: pressed ? colors.accentPressed : colors.accent },
        variant === 'secondary' && {
          backgroundColor: pressed ? colors.surfaceRaised : colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
        },
        variant === 'danger' && { backgroundColor: colors.danger, opacity: pressed ? 0.85 : 1 },
        disabled && { opacity: 0.4 },
        style,
      ]}
    >
      <Text
        style={[
          styles.btnLabel,
          { color: variant === 'primary' ? colors.onAccent : colors.text },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

type FabProps = {
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
};

export function Fab({ onPress, icon = 'add' }: FabProps) {
  const insets = useSafeAreaInsets();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.fab,
        { bottom: insets.bottom + spacing.lg },
        { backgroundColor: pressed ? colors.accentPressed : colors.accent },
      ]}
    >
      <Ionicons name={icon} size={30} color={colors.onAccent} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    minHeight: touchTarget,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  btnLabel: { fontSize: 16, fontWeight: '700' },
  fab: {
    position: 'absolute',
    right: spacing.xl,
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
});
