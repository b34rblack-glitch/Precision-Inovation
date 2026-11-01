import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import type { TargetPhoto } from '@/db/schema';
import { targetPhotoUri } from '@/features/workups/targetPhotos';
import { colors, radii, spacing, type } from '@/theme';

type Props = {
  photo: TargetPhoto;
  /** Charge the photo is pinned to, or "Target" for a whole-target shot. */
  badge?: string;
  size?: number;
  onPress: () => void;
  style?: ViewStyle;
};

/**
 * One thumbnail. A photo synced from another device has a row but no bytes
 * here (blob sync has not landed), so a failed load shows a placeholder
 * rather than a blank square.
 */
export function PhotoThumb({ photo, badge, size = 96, onPress, style }: Props) {
  const uri = targetPhotoUri(photo);
  const [failed, setFailed] = useState(uri === null);
  useEffect(() => setFailed(uri === null), [uri]);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="imagebutton"
      accessibilityLabel={
        (badge ? `${badge} target photo` : 'Target photo') +
        (photo.caption ? `, ${photo.caption}` : '') +
        (failed ? ', not on this device' : '')
      }
      style={({ pressed }) => [
        styles.box,
        { width: size, height: size },
        pressed && { opacity: 0.8 },
        style,
      ]}
    >
      {failed || uri === null ? (
        <View style={styles.missing}>
          <Ionicons name="image-outline" size={size * 0.3} color={colors.textTertiary} />
          <Text style={[type.caption, { textAlign: 'center' }]} numberOfLines={2}>
            Not on this device
          </Text>
        </View>
      ) : (
        <Image
          source={{ uri }}
          style={styles.image}
          resizeMode="cover"
          onError={() => setFailed(true)}
        />
      )}
      {badge ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText} numberOfLines={1}>
            {badge}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
    overflow: 'hidden',
  },
  image: { width: '100%', height: '100%' },
  missing: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xs,
    gap: 2,
  },
  badge: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  badgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
});
