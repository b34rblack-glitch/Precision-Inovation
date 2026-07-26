import {
  NotSignedInError,
  SyncUnavailableError,
  type GoogleAccount,
  type GoogleAuth,
} from '@/sync/auth';
import { DRIVE_SCOPE } from '@/sync/auth';
import { googleClientIds, syncAvailability } from '@/sync/platform/syncAvailability';

// Google sign-in on Android, via Play Services.
//
// Why this rather than a browser OAuth flow: the one genuinely unverifiable
// part of this project is whether Google reliably returns a refresh token to an
// Android-type OAuth client. Handing token lifetime to Play Services removes
// the question — signInSilently() returns a fresh access token and no refresh
// token ever passes through this app. If that turns out to be wrong, only this
// file changes: everything else depends on the GoogleAuth interface.
//
// The module is imported dynamically (see settings) because requiring the
// native module inside Expo Go throws at require time.

let configured = false;
let cachedToken: string | null = null;

type GoogleSigninApi = Awaited<
  typeof import('@react-native-google-signin/google-signin')
>['GoogleSignin'];

async function load(): Promise<GoogleSigninApi> {
  const availability = syncAvailability();
  if (!availability.available) throw new SyncUnavailableError(availability.message);

  const { GoogleSignin } = await import('@react-native-google-signin/google-signin');

  if (!configured) {
    const { webClientId, iosClientId } = googleClientIds();
    GoogleSignin.configure({
      webClientId: webClientId!,
      iosClientId,
      // drive.file only. Anything broader is a restricted scope and would pull
      // this project into a paid annual security assessment.
      scopes: [DRIVE_SCOPE],
      // No server to receive a refresh token, and no need for one: Play
      // Services refreshes the access token itself.
      offlineAccess: false,
    });
    configured = true;
  }
  return GoogleSignin;
}

type CurrentUser = ReturnType<GoogleSigninApi['getCurrentUser']>;

function accountOf(current: CurrentUser): GoogleAccount | null {
  if (!current?.user?.email) return null;
  return { email: current.user.email, displayName: current.user.name ?? null };
}

export const googleAuth: GoogleAuth = {
  async signIn(): Promise<GoogleAccount> {
    const GoogleSignin = await load();
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    await GoogleSignin.signIn();
    cachedToken = null;
    const account = accountOf(GoogleSignin.getCurrentUser());
    if (!account) throw new NotSignedInError('Google sign-in did not return an account');
    return account;
  },

  async currentAccount(): Promise<GoogleAccount | null> {
    const GoogleSignin = await load();
    return accountOf(GoogleSignin.getCurrentUser());
  },

  async accessToken(): Promise<string> {
    if (cachedToken) return cachedToken;
    const GoogleSignin = await load();
    try {
      // Silent: refreshes without a prompt when the session is still valid.
      await GoogleSignin.signInSilently();
      const { accessToken } = await GoogleSignin.getTokens();
      cachedToken = accessToken;
      return accessToken;
    } catch (e) {
      throw new NotSignedInError(
        `Google sign-in has expired — connect again in Settings (${(e as Error).message})`,
      );
    }
  },

  async refresh(): Promise<string> {
    const GoogleSignin = await load();
    // Explicitly drop the server-side cached token, otherwise getTokens can
    // hand back the same expired one.
    if (cachedToken && GoogleSignin.clearCachedAccessToken) {
      await GoogleSignin.clearCachedAccessToken(cachedToken).catch(() => {});
    }
    cachedToken = null;
    return googleAuth.accessToken();
  },

  async signOut(): Promise<void> {
    const GoogleSignin = await load();
    cachedToken = null;
    await GoogleSignin.signOut();
  },
};
