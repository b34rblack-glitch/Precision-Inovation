import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/Card';
import type { TargetPhoto, WorkupStep } from '@/db/schema';
import { PhotoSourceButtons } from '@/features/workups/PhotoSourceButtons';
import { PhotoThumb } from '@/features/workups/PhotoThumb';
import type { PhotoSource } from '@/features/workups/targetPhotos';
import { formatChargeGr } from '@/lib/workup/format';
import { colors, spacing, type } from '@/theme';

/** "42.2 gr" for a photo pinned to a charge, "Target" for a whole-target shot. */
export function photoBadge(photo: TargetPhoto, steps: readonly WorkupStep[]): string {
  if (photo.workupStepId == null) return 'Target';
  const step = steps.find((s) => s.id === photo.workupStepId);
  return step ? formatChargeGr(step.chargeGr) : 'Target';
}

type Props = {
  photos: TargetPhoto[];
  steps: WorkupStep[];
  busy: boolean;
  /** Add a whole-target photo. */
  onPick: (source: PhotoSource) => void;
  onOpen: (photo: TargetPhoto) => void;
};

/**
 * The workup's photo strip: every photo on the workup, whole-target shots and
 * per-charge groups alike, newest last, plus the buttons for adding a photo of
 * the whole target. Per-charge photos are added from inside the charge card.
 */
export function TargetPhotoGallery({ photos, steps, busy, onPick, onOpen }: Props) {
  return (
    <Card>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={type.label}>Target photos</Text>
          <Text style={[type.secondary, { marginTop: 2 }]}>
            {photos.length === 0
              ? 'Whole target, or the chrono screen'
              : `${photos.length} ${photos.length === 1 ? 'photo' : 'photos'}`}
          </Text>
        </View>
        <PhotoSourceButtons onPick={onPick} busy={busy} subject="the whole target" />
      </View>

      {photos.length === 0 ? (
        <Text style={[type.secondary, styles.hint]}>
          Photograph the target as you shoot it. Use the buttons above for the whole target — a
          tall-target ladder, an OCW sheet — or the camera inside a charge card to pin a group to
          its charge.
        </Text>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.strip}
          style={{ marginTop: spacing.md }}
        >
          {photos.map((photo) => (
            <PhotoThumb
              key={photo.id}
              photo={photo}
              badge={photoBadge(photo, steps)}
              onPress={() => onOpen(photo)}
            />
          ))}
        </ScrollView>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  hint: { marginTop: spacing.md, color: colors.textTertiary },
  strip: { gap: spacing.sm, paddingRight: spacing.sm },
});
