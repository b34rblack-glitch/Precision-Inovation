import { describe, expect, it } from 'vitest';
import {
  imageExtension,
  isSafePhotoFileName,
  joinPhotoUri,
  TARGET_PHOTO_DIR,
  targetPhotoFileName,
} from '@/lib/photoFiles';

// Rows store a bare file name resolved against the photo directory at render
// time (the iOS sandbox path changes on every update). These rules decide what
// that name is and what is allowed to be joined onto the directory.

describe('imageExtension', () => {
  it('prefers the MIME type the picker reported', () => {
    expect(imageExtension('file:///tmp/IMG_0001.PNG', 'image/jpeg')).toBe('jpg');
    expect(imageExtension('file:///tmp/x', 'image/png')).toBe('png');
    expect(imageExtension('file:///tmp/x', 'image/heic')).toBe('heic');
    expect(imageExtension('file:///tmp/x', 'IMAGE/WEBP; charset=binary')).toBe('webp');
  });

  it('falls back to the extension on the URI, normalising jpeg', () => {
    expect(imageExtension('file:///tmp/ImagePicker/abc.jpeg')).toBe('jpg');
    expect(imageExtension('file:///tmp/ImagePicker/abc.PNG', null)).toBe('png');
    expect(imageExtension('content://media/external/images/1.heic?x=1#frag')).toBe('heic');
  });

  it('defaults to jpg when nothing usable is known', () => {
    expect(imageExtension('content://media/external/images/media/42')).toBe('jpg');
    expect(imageExtension('file:///tmp/.hidden', 'application/octet-stream')).toBe('jpg');
    expect(imageExtension('file:///tmp/archive.zip')).toBe('jpg');
  });
});

describe('targetPhotoFileName', () => {
  it('is the row id plus the extension', () => {
    expect(targetPhotoFileName('0f3c-aaaa', 'jpg')).toBe('0f3c-aaaa.jpg');
    expect(targetPhotoFileName('0f3c-aaaa', '.png')).toBe('0f3c-aaaa.png');
  });

  it('produces a name the safety check accepts', () => {
    expect(isSafePhotoFileName(targetPhotoFileName('0f3c-aaaa', 'jpg'))).toBe(true);
  });
});

describe('isSafePhotoFileName', () => {
  it('accepts a single path segment', () => {
    expect(isSafePhotoFileName('abc.jpg')).toBe(true);
    expect(isSafePhotoFileName('IMG 0001 (2).heic')).toBe(true);
  });

  it('rejects anything that could escape the photo directory', () => {
    for (const bad of ['', '.', '..', '../x.jpg', 'a/b.jpg', 'a\\b.jpg', 'x\0.jpg', 'a'.repeat(256)]) {
      expect(isSafePhotoFileName(bad), JSON.stringify(bad)).toBe(false);
    }
  });

  it('rejects non-strings from a hand-edited file', () => {
    expect(isSafePhotoFileName(null)).toBe(false);
    expect(isSafePhotoFileName(42)).toBe(false);
    expect(isSafePhotoFileName({ name: 'x.jpg' })).toBe(false);
  });
});

describe('joinPhotoUri', () => {
  it('joins with exactly one slash whether or not the directory has one', () => {
    expect(joinPhotoUri('file:///data/doc/target-photos', 'a.jpg')).toBe(
      'file:///data/doc/target-photos/a.jpg',
    );
    expect(joinPhotoUri('file:///data/doc/target-photos/', 'a.jpg')).toBe(
      'file:///data/doc/target-photos/a.jpg',
    );
  });

  it('the directory name is a single segment too', () => {
    expect(isSafePhotoFileName(TARGET_PHOTO_DIR)).toBe(true);
  });
});
