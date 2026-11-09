// Naming and path rules for photos the app keeps on disk. PURE: no Expo, no
// React Native, so the rules can be unit-tested and the desktop app can share
// them. The I/O that uses them lives in src/features/workups/targetPhotos.ts.
//
// Rows store a bare file name, never an absolute URI. On iOS the app sandbox
// moves to a new path on every update, so an absolute file:// URI written
// today is broken after the next App Store release; a name resolved against
// the current document directory at render time never is.

/** Directory under the app's document directory that holds target photos. */
export const TARGET_PHOTO_DIR = 'target-photos';

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

const KNOWN_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'heic', 'heif', 'webp', 'gif']);

/**
 * File extension for a picked image. Prefers the MIME type the picker
 * reported, falls back to the extension on the source URI, and defaults to
 * jpg — which is what both platform cameras produce.
 */
export function imageExtension(uri: string, mimeType?: string | null): string {
  const mime = mimeType?.toLowerCase().split(';')[0]?.trim();
  if (mime && EXTENSION_BY_MIME[mime]) return EXTENSION_BY_MIME[mime]!;
  const path = uri.split('?')[0]?.split('#')[0] ?? '';
  const last = path.slice(path.lastIndexOf('/') + 1);
  const dot = last.lastIndexOf('.');
  if (dot > 0) {
    const ext = last.slice(dot + 1).toLowerCase();
    if (KNOWN_EXTENSIONS.has(ext)) return ext === 'jpeg' ? 'jpg' : ext;
  }
  return 'jpg';
}

/** The on-disk name for a photo row: its id plus the image's extension. */
export function targetPhotoFileName(id: string, extension: string): string {
  return `${id}.${extension.replace(/^\./, '')}`;
}

/**
 * A stored file name is a single path segment. Anything else — a slash, a
 * parent reference, an empty string — came from somewhere other than this app
 * (a hand-edited backup, a peer on a buggy build) and must not be joined onto
 * the photo directory.
 */
export function isSafePhotoFileName(name: unknown): name is string {
  return (
    typeof name === 'string' &&
    name.length > 0 &&
    name.length <= 255 &&
    !name.includes('/') &&
    !name.includes('\\') &&
    name !== '.' &&
    name !== '..' &&
    !name.includes('\0')
  );
}

/** Joins a directory URI and a file name with exactly one slash. */
export function joinPhotoUri(directoryUri: string, fileName: string): string {
  const base = directoryUri.endsWith('/') ? directoryUri.slice(0, -1) : directoryUri;
  return `${base}/${fileName}`;
}
