import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/Buttons';
import { Chip } from '@/components/Chip';
import { Field } from '@/components/Form';
import type { TargetPhoto, WorkupStep } from '@/db/schema';
import { targetPhotoUri } from '@/features/workups/targetPhotos';
import { formatChargeGr } from '@/lib/workup/format';
import { colors, spacing, touchTarget, type } from '@/theme';

type Props = {
  /** The photo to show; null hides the viewer. */
  photo: TargetPhoto | null;
  steps: WorkupStep[];
  onClose: () => void;
  onCaption: (caption: string) => Promise<void>;
  /** Pin to a charge step, or to the whole target with null. */
  onPin: (workupStepId: string | null) => Promise<void>;
  onDelete: () => Promise<void>;
};

const fail = (title: string, e: unknown) =>
  Alert.alert(title, e instanceof Error ? e.message : String(e));

/**
 * Full-screen view of one target photo with its caption and the charge it is
 * pinned to, both editable, and delete.
 */
export function TargetPhotoViewer({ photo, steps, onClose, onCaption, onPin, onDelete }: Props) {
  const insets = useSafeAreaInsets();
  const [caption, setCaption] = useState(photo?.caption ?? '');
  const [saving, setSaving] = useState(false);
  const [pinning, setPinning] = useState(false);
  const [failed, setFailed] = useState(false);

  // Re-seed the draft when a different photo opens (or the live row changes
  // underneath us after a save), not on every keystroke.
  useEffect(() => {
    setCaption(photo?.caption ?? '');
    setFailed(false);
  }, [photo?.id, photo?.caption]);

  if (!photo) return null;
  const uri = targetPhotoUri(photo);
  const captionDirty = caption.trim() !== (photo.caption ?? '');
  const pinnedStep = steps.find((s) => s.id === photo.workupStepId) ?? null;

  const saveCaption = async () => {
    setSaving(true);
    try {
      await onCaption(caption);
    } catch (e) {
      fail('Could not save caption', e);
    } finally {
      setSaving(false);
    }
  };

  const pin = async (stepId: string | null) => {
    if (pinning || stepId === (photo.workupStepId ?? null)) return;
    setPinning(true);
    try {
      await onPin(stepId);
    } catch (e) {
      fail('Could not move photo', e);
    } finally {
      setPinning(false);
    }
  };

  const confirmDelete = () => {
    Alert.alert('Delete this photo?', 'The photo is removed from this workup and from the app.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await onDelete();
            onClose();
          } catch (e) {
            fail('Could not delete photo', e);
          }
        },
      },
    ]);
  };

  return (
    <Modal
      visible
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
      presentationStyle="fullScreen"
    >
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.topBar}>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close photo"
            style={styles.iconBtn}
          >
            <Ionicons name="close" size={28} color={colors.text} />
          </Pressable>
          <Text style={[type.label, { flex: 1, textAlign: 'center' }]}>
            {pinnedStep ? formatChargeGr(pinnedStep.chargeGr) : 'Whole target'}
          </Text>
          <Pressable
            onPress={confirmDelete}
            accessibilityRole="button"
            accessibilityLabel="Delete photo"
            style={styles.iconBtn}
          >
            <Ionicons name="trash-outline" size={24} color={colors.danger} />
          </Pressable>
        </View>

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.imageBox}>
            {uri === null || failed ? (
              <View style={styles.missing}>
                <Ionicons name="image-outline" size={56} color={colors.textTertiary} />
                <Text style={[type.secondary, { textAlign: 'center' }]}>
                  This photo was taken on another device. Its details are here, but the image
                  itself has not been copied to this phone.
                </Text>
              </View>
            ) : (
              <Image
                source={{ uri }}
                style={styles.image}
                resizeMode="contain"
                accessibilityLabel={photo.caption ?? 'Target photo'}
                onError={() => setFailed(true)}
              />
            )}
          </View>

          <ScrollView
            style={styles.panel}
            contentContainerStyle={{ paddingBottom: insets.bottom + spacing.lg }}
            keyboardShouldPersistTaps="handled"
          >
            <Field
              label="Caption"
              value={caption}
              onChangeText={setCaption}
              placeholder="3-shot group, 0.6 in, slight vertical"
              autoCapitalize="sentences"
              autoCorrect
            />
            {captionDirty ? (
              <Button
                label="Save Caption"
                onPress={saveCaption}
                loading={saving}
                style={{ marginTop: -spacing.sm, marginBottom: spacing.lg }}
              />
            ) : null}

            {steps.length > 0 ? (
              <>
                <Text style={[type.label, { marginBottom: spacing.sm }]}>Pinned to</Text>
                <View style={styles.chipWrap} accessibilityRole="radiogroup">
                  <Chip
                    label="Whole target"
                    selected={photo.workupStepId == null}
                    onPress={() => pin(null)}
                  />
                  {steps.map((s) => (
                    <Chip
                      key={s.id}
                      label={formatChargeGr(s.chargeGr)}
                      selected={photo.workupStepId === s.id}
                      onPress={() => pin(s.id)}
                    />
                  ))}
                </View>
              </>
            ) : null}
            <Text style={[type.caption, { marginTop: spacing.lg, color: colors.textTertiary }]}>
              Added {new Date(photo.createdAt).toLocaleString()}
            </Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    minHeight: touchTarget,
  },
  iconBtn: {
    width: touchTarget,
    height: touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageBox: { flex: 1, backgroundColor: '#000', justifyContent: 'center' },
  image: { width: '100%', height: '100%' },
  missing: { alignItems: 'center', gap: spacing.md, padding: spacing.xl },
  panel: {
    maxHeight: 320,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    backgroundColor: colors.surface,
  },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
