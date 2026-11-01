import Ionicons from '@expo/vector-icons/Ionicons';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import type { PhotoSource } from '@/features/workups/targetPhotos';
import { colors, radii, spacing, touchTarget } from '@/theme';

type Props = {
  onPick: (source: PhotoSource) => void;
  busy?: boolean;
  /** Spoken before "with the camera" / "from your photos". */
  subject: string;
  compact?: boolean;
};

/** Camera and library buttons, side by side. */
export function PhotoSourceButtons({ onPick, busy, subject, compact }: Props) {
  const size = compact ? touchTarget : touchTarget + 8;
  return (
    <View style={styles.row}>
      {busy ? (
        <View style={[styles.btn, { width: size, height: size }]}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : (
        <>
          <Pressable
            onPress={() => onPick('camera')}
            accessibilityRole="button"
            accessibilityLabel={`Photograph ${subject} with the camera`}
            style={({ pressed }) => [
              styles.btn,
              { width: size, height: size },
              pressed && styles.pressed,
            ]}
          >
            <Ionicons name="camera" size={compact ? 22 : 26} color={colors.accent} />
          </Pressable>
          <Pressable
            onPress={() => onPick('library')}
            accessibilityRole="button"
            accessibilityLabel={`Choose a photo of ${subject} from your photos`}
            style={({ pressed }) => [
              styles.btn,
              { width: size, height: size },
              pressed && styles.pressed,
            ]}
          >
            <Ionicons name="images-outline" size={compact ? 20 : 24} color={colors.accent} />
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm },
  btn: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { backgroundColor: colors.surfaceRaised },
});
