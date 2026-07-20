import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing, type } from '@/theme';

type Props = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  message: string;
};

export function EmptyState({ icon, title, message }: Props) {
  return (
    <View style={styles.root}>
      <Ionicons name={icon} size={44} color={colors.textTertiary} />
      <Text style={[type.heading, styles.title]}>{title}</Text>
      <Text style={[type.secondary, styles.message]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', paddingVertical: 72, paddingHorizontal: spacing.xl },
  title: { marginTop: spacing.lg },
  message: { marginTop: spacing.sm, textAlign: 'center', lineHeight: 20 },
});
