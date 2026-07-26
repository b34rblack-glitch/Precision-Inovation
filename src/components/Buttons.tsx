import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleSheet, Text, ViewStyle } from 'react-native';
import { colors, radii, spacing, touchTarget } from '@/theme';

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
};

export function Button({ label, onPress, variant = 'primary', disabled, loading, style }: ButtonProps) {
  const inert = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={inert}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inert, busy: !!loading }}
      style={({ pressed }) => [
        styles.btn,
        variant === 'primary' && { backgroundColor: pressed ? colors.accentPressed : colors.accent },
        variant === 'secondary' && {
          backgroundColor: pressed ? colors.surfaceRaised : colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
        },
        variant === 'danger' && { backgroundColor: colors.dangerFill, opacity: pressed ? 0.85 : 1 },
        disabled && { opacity: 0.4 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === 'primary' ? colors.onAccent : variant === 'danger' ? colors.onDanger : colors.text}
        />
      ) : (
        <Text
          style={[
            styles.btnLabel,
            {
              color:
                variant === 'primary'
                  ? colors.onAccent
                  : variant === 'danger'
                    ? colors.onDanger
                    : colors.text,
            },
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

type FabProps = {
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  accessibilityLabel?: string;
};

export function Fab({ onPress, icon = 'add', accessibilityLabel = 'Add' }: FabProps) {
  // FABs render inside tab scenes, which already sit above the tab bar —
  // adding insets.bottom here would double-count the safe area.
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        styles.fab,
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
    bottom: spacing.lg,
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
