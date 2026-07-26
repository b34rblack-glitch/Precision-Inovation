import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/Buttons';
import { colors, spacing, type } from '@/theme';

type Props = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  message: string;
  action?: { label: string; onPress: () => void };
};

export function EmptyState({ icon, title, message, action }: Props) {
  return (
    <View style={styles.root}>
      <View style={styles.iconCircle}>
        <Ionicons name={icon} size={34} color={colors.textTertiary} />
      </View>
      <Text style={[type.heading, styles.title]}>{title}</Text>
      <Text style={[type.secondary, styles.message]}>{message}</Text>
      {action ? (
        <Button
          label={action.label}
          onPress={action.onPress}
          variant="primary"
          style={styles.action}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', paddingVertical: 72, paddingHorizontal: spacing.xl },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { marginTop: spacing.lg },
  message: { marginTop: spacing.sm, textAlign: 'center', lineHeight: 20 },
  action: { marginTop: spacing.xl },
});
