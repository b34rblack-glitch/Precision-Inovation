// The Google authentication contract, implemented once per platform.
//
// The sync engine depends on this and nothing else, which is deliberate: the
// two platforms get their tokens in genuinely different ways (Android hands
// the work to Play Services, the desktop runs a loopback OAuth flow in the
// system browser), and the exact behaviour of Google's token endpoint for
// installed apps is the one thing about this project that cannot be verified
// without a real Google project. Isolating it here means that if the first
// approach turns out to be wrong, only this file's implementations change and
// no sync code moves.
//
// PURE.

/** The only scope this app ever requests. */
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

/**
 * Non-sensitive scopes, so no Google security assessment, no annual review fee
 * and no cap on users. Widening this list past drive.file would change that —
 * `drive`, `drive.readonly` and `drive.metadata` are all restricted scopes.
 */
export const REQUESTED_SCOPES = [DRIVE_SCOPE, 'openid', 'email', 'profile'] as const;

export type GoogleAccount = {
  email: string | null;
  displayName: string | null;
};

export interface GoogleAuth {
  /** Interactive sign-in. Only called when the user taps Connect. */
  signIn(): Promise<GoogleAccount>;

  /** The signed-in account, or null. Must not prompt. */
  currentAccount(): Promise<GoogleAccount | null>;

  /**
   * A usable access token, refreshing silently if the current one has expired.
   * Throws NotSignedInError if the user must re-authenticate.
   */
  accessToken(): Promise<string>;

  /** Discards the cached token and obtains a fresh one. */
  refresh(): Promise<string>;

  signOut(): Promise<void>;
}

export class NotSignedInError extends Error {
  constructor(message = 'Not signed in to Google') {
    super(message);
    this.name = 'NotSignedInError';
  }
}

export class SyncUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SyncUnavailableError';
  }
}
