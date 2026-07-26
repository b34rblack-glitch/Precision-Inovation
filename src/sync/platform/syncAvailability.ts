import Constants from 'expo-constants';

// Google Sign-In needs native code, which Expo Go cannot provide. The rest of
// the app runs there perfectly well, so sync is gated rather than the app being
// broken: in Expo Go the Settings screen explains why the section is inert.
//
// The gate matters beyond the message. The auth module must be loaded through a
// dynamic import behind this check, because merely importing the native module
// in an Expo Go bundle throws at require time and would take the whole screen
// down.

export type SyncAvailability =
  | { available: true }
  | { available: false; reason: 'expo-go' | 'not-configured'; message: string };

function isExpoGo(): boolean {
  // appOwnership is 'expo' only inside Expo Go; it is null in a dev build and
  // in a store build.
  return (Constants as { appOwnership?: string | null }).appOwnership === 'expo';
}

export function googleClientIds(): { webClientId?: string; iosClientId?: string } {
  const extra = (Constants.expoConfig?.extra ?? {}) as {
    googleWebClientId?: string;
    googleIosClientId?: string;
  };
  return { webClientId: extra.googleWebClientId, iosClientId: extra.googleIosClientId };
}

export function syncAvailability(): SyncAvailability {
  if (isExpoGo()) {
    return {
      available: false,
      reason: 'expo-go',
      message:
        'Cloud sync needs a development or Play Store build — Expo Go cannot sign in to Google. Everything else works here.',
    };
  }
  if (!googleClientIds().webClientId) {
    return {
      available: false,
      reason: 'not-configured',
      message:
        'This build has no Google client ID configured, so cloud sync is unavailable. See docs/google-cloud-setup.md.',
    };
  }
  return { available: true };
}

export const SYNC_AVAILABLE = syncAvailability().available;
