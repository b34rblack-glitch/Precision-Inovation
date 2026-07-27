import { createDriveClient } from '@/sync/drive';
import { NotSignedInError, SyncUnavailableError, type GoogleAuth } from '@/sync/auth';
import { expoSyncStore } from '@/sync/platform/expoDriver';
import { syncAvailability } from '@/sync/platform/syncAvailability';
import { syncOnce, type SyncPhase, type SyncReport } from '@/sync/syncOnce';

// Wires the pure sync engine to this platform's auth, HTTP and database.
//
// The auth module is loaded lazily so that Expo Go, where the native Google
// module cannot be required at all, still renders the Settings screen.

let authModule: GoogleAuth | null = null;

async function auth(): Promise<GoogleAuth> {
  const availability = syncAvailability();
  if (!availability.available) throw new SyncUnavailableError(availability.message);
  if (!authModule) {
    const { googleAuth } = await import('@/sync/platform/googleAuth');
    authModule = googleAuth;
  }
  return authModule;
}

export async function connectGoogle() {
  return (await auth()).signIn();
}

export async function currentGoogleAccount() {
  try {
    return await (await auth()).currentAccount();
  } catch {
    // Not configured, or Expo Go — the UI shows the reason separately.
    return null;
  }
}

export async function disconnectGoogle(): Promise<void> {
  await (await auth()).signOut();
  await expoSyncStore.writeState({
    // Forget where the data lived, but keep the device id and clock: the same
    // device reconnecting later should not look like a new one.
    rootFolderId: null,
    devicesFolderId: null,
    blobsFolderId: null,
    myFileId: null,
    peerCacheJson: null,
    googleAccountEmail: null,
  });
}

export type RunSyncOptions = {
  onPhase?: (phase: SyncPhase, detail?: string) => void;
};

export async function runSync(options: RunSyncOptions = {}): Promise<SyncReport> {
  const google = await auth();

  const drive = createDriveClient({
    // React Native provides a global fetch; the desktop app substitutes a
    // Rust-side client here so the access token never enters the webview.
    fetchImpl: (url, init) => fetch(url, init as RequestInit),
    getAccessToken: () => google.accessToken(),
    refreshAccessToken: () => google.refresh(),
  });

  try {
    const report = await syncOnce({ store: expoSyncStore, drive, onPhase: options.onPhase });
    const account = await google.currentAccount();
    await expoSyncStore.writeState({ googleAccountEmail: account?.email ?? null });
    return report;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await expoSyncStore.writeState({ lastSyncError: message }).catch(() => {});
    throw e;
  }
}

export function describeSyncError(error: unknown): string {
  if (error instanceof NotSignedInError) {
    return 'Your Google sign-in has expired. Connect again to keep syncing.';
  }
  if (error instanceof SyncUnavailableError) return error.message;
  const message = error instanceof Error ? error.message : String(error);
  if (/network|fetch|timeout|ENOTFOUND/i.test(message)) {
    return 'Could not reach Google Drive. Check your connection and try again.';
  }
  return `Sync failed: ${message}`;
}

/** Human summary of what a sync did, for the Settings screen. */
export function describeSyncReport(report: SyncReport): string {
  const bits: string[] = [];
  if (report.upserts > 0) bits.push(`${report.upserts} record${report.upserts === 1 ? '' : 's'} updated`);
  if (report.deletes > 0) bits.push(`${report.deletes} removed`);
  if (bits.length === 0) bits.push('already up to date');
  const peers = report.peers === 1 ? '1 other device' : `${report.peers} other devices`;
  return `${bits.join(', ')} · ${peers}`;
}

export type { SyncPhase, SyncReport };
