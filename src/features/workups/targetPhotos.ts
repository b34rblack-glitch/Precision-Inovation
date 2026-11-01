import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { newId } from '@/db/ids';
import {
  addTargetPhoto,
  deleteTargetPhoto,
  updateTargetPhoto,
} from '@/db/repositories/targetPhotos';
import type { TargetPhoto } from '@/db/schema';
import {
  imageExtension,
  isSafePhotoFileName,
  TARGET_PHOTO_DIR,
  targetPhotoFileName,
} from '@/lib/photoFiles';

// The Expo side of target photos: camera and library pickers, copying the
// image into the app's own directory, hashing it, and the matching cleanup.
// The database rows are written by src/db/repositories/targetPhotos.ts.
//
// The picker hands back a URI inside the OS cache, which the system is free to
// purge at any time. A target photo is part of the load's permanent record, so
// it is copied into the document directory before the row is written.

export type PhotoSource = 'camera' | 'library';

export type TargetPhotoOwner = {
  workupId: string;
  /** The charge this photo shows; null for a whole-target photo. */
  workupStepId?: string | null;
};

/** Thrown when the user has denied camera access; the message is user-facing. */
export class PhotoPermissionError extends Error {
  constructor() {
    super('Camera access is off for this app. Allow it in Settings to photograph targets.');
    this.name = 'PhotoPermissionError';
  }
}

function photoDirectory(): Directory {
  return new Directory(Paths.document, TARGET_PHOTO_DIR);
}

/**
 * Local URI for a stored photo, or null when the name is not one this app
 * would have written (a row from a peer or a hand-edited backup) — the Image
 * then shows its placeholder instead of trying to load outside the directory.
 */
export function targetPhotoUri(photo: Pick<TargetPhoto, 'fileName'>): string | null {
  if (!isSafePhotoFileName(photo.fileName)) return null;
  return new File(photoDirectory(), photo.fileName).uri;
}

/**
 * Opens the camera or the photo library. Resolves to null when the user backs
 * out without choosing anything.
 */
export async function pickTargetPhoto(
  source: PhotoSource,
): Promise<ImagePicker.ImagePickerAsset | null> {
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    // Full-resolution camera frames are 3-12 MB; a target photo is read on a
    // phone screen and this keeps the document directory from growing by a
    // gigabyte over a season.
    quality: 0.8,
    exif: false,
  };
  let result: ImagePicker.ImagePickerResult;
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) throw new PhotoPermissionError();
    result = await ImagePicker.launchCameraAsync(options);
  } else {
    result = await ImagePicker.launchImageLibraryAsync(options);
  }
  if (result.canceled) return null;
  return result.assets[0] ?? null;
}

async function sha256Of(file: File): Promise<string | null> {
  try {
    const bytes = await file.bytes();
    const digest = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes);
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    // The hash only matters once blob sync exists; a photo without one is
    // still a perfectly good photo. Never fail the save over it.
    return null;
  }
}

/**
 * Copies a picked image into the app's photo directory and records it. If the
 * row cannot be written the copied file is removed again, so the directory
 * never accumulates photos nothing points at.
 */
export async function saveTargetPhoto(
  asset: Pick<ImagePicker.ImagePickerAsset, 'uri' | 'mimeType'>,
  owner: TargetPhotoOwner,
): Promise<TargetPhoto> {
  const id = newId();
  const fileName = targetPhotoFileName(id, imageExtension(asset.uri, asset.mimeType));

  const dir = photoDirectory();
  dir.create({ idempotent: true, intermediates: true });
  const dest = new File(dir, fileName);
  await new File(asset.uri).copy(dest);

  const sha256 = await sha256Of(dest);

  try {
    return await addTargetPhoto({
      id,
      workupId: owner.workupId,
      workupStepId: owner.workupStepId ?? null,
      sessionId: null,
      fileName,
      sha256,
      caption: null,
    });
  } catch (e) {
    try {
      if (dest.exists) dest.delete();
    } catch {
      // Best effort — the row is what matters, and it was not written.
    }
    throw e;
  }
}

export async function setTargetPhotoCaption(id: string, caption: string): Promise<void> {
  const trimmed = caption.trim();
  await updateTargetPhoto(id, { caption: trimmed === '' ? null : trimmed });
}

/** Re-pin a photo to a charge, or to the whole target with null. */
export async function setTargetPhotoStep(id: string, workupStepId: string | null): Promise<void> {
  await updateTargetPhoto(id, { workupStepId });
}

/**
 * Deletes the row, then the file. Row first: if the file delete fails the
 * worst case is an unreferenced file on disk, whereas the other order could
 * leave a row pointing at nothing.
 */
export async function removeTargetPhoto(photo: TargetPhoto): Promise<void> {
  await deleteTargetPhoto(photo.id);
  if (!isSafePhotoFileName(photo.fileName)) return;
  try {
    const file = new File(photoDirectory(), photo.fileName);
    if (file.exists) file.delete();
  } catch {
    // Orphaned bytes are harmless; the record is gone.
  }
}
