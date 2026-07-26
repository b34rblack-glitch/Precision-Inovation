import type { Hlc } from '@/sync/hlc';
import { mergeSnapshots } from '@/sync/merge';
import {
  BLOBS_FOLDER_NAME,
  DEVICES_FOLDER_NAME,
  deviceFileName,
  FOLDER_README,
  ROOT_FOLDER_NAME,
  type DriveClient,
  type DriveFile,
} from '@/sync/drive';
import { MIGRATION_TAG, SYNC_PROTOCOL, TABLE_SCHEMA_VERSION } from '@/sync/protocol';
import { decodeSnapshot, encodeSnapshot } from '@/sync/serialize';
import type { MergeWarning, MintedTombstone, Operation, Snapshot } from '@/sync/types';

// One sync run: discover the folder, pull what changed, merge, apply, publish.
//
// Everything platform-specific arrives through SyncStore and DriveClient, so
// this whole flow runs against an in-memory fake in the tests — including the
// awkward cases (a peer file that will not parse, a crash between apply and
// publish, a device whose file was deleted from Drive) that are impractical to
// stage against a real Google account.
//
// PURE.

export type SyncPhase =
  | 'starting'
  | 'discovering'
  | 'pulling'
  | 'merging'
  | 'backing-up'
  | 'applying'
  | 'publishing'
  | 'done';

/** Cached Drive ids and per-peer checksums, persisted in sync_state. */
export type SyncStateValues = {
  deviceId: string;
  deviceName: string;
  platform: string;
  rootFolderId: string | null;
  devicesFolderId: string | null;
  blobsFolderId: string | null;
  myFileId: string | null;
  peerCacheJson: string | null;
};

export type PeerCache = Record<string, { md5?: string; modifiedTime?: string; json: string }>;

/** Everything sync needs from the local database. */
export interface SyncStore {
  readState(): Promise<SyncStateValues>;
  writeState(patch: Partial<SyncStateValues> & Record<string, unknown>): Promise<void>;
  /** This device's complete view, for merging and for publishing. */
  readSnapshot(): Promise<Snapshot>;
  /** Applies merge operations in a single transaction. */
  applyOps(ops: readonly Operation[]): Promise<void>;
  /** Stamps tombstones for rows the merge removed. Advances the clock. */
  mintTombstones(list: readonly MintedTombstone[]): Promise<void>;
  /** Folds the highest observed remote timestamp into the local clock. */
  observeRemote(hlc: Hlc): Promise<void>;
  /** Writes a local safety copy before the first change of every sync. */
  backupBeforeApply(): Promise<void>;
}

export type SyncDeps = {
  store: SyncStore;
  drive: DriveClient;
  onPhase?: (phase: SyncPhase, detail?: string) => void;
};

export type SyncReport = {
  peers: number;
  peersSkipped: number;
  pulled: number;
  applied: number;
  upserts: number;
  deletes: number;
  conflicts: number;
  published: boolean;
  warnings: MergeWarning[];
};

async function ensureFolder(
  drive: DriveClient,
  name: string,
  cachedId: string | null,
  parentId?: string,
): Promise<string> {
  if (cachedId) return cachedId;
  const found = await drive.findFolder(name, parentId);
  if (found) return found;
  return drive.createFolder(name, parentId);
}

export async function syncOnce(deps: SyncDeps): Promise<SyncReport> {
  const { store, drive } = deps;
  const phase = (p: SyncPhase, detail?: string) => deps.onPhase?.(p, detail);

  phase('starting');
  const state = await store.readState();

  // -- discover ------------------------------------------------------------
  // Folder ids are cached because Drive's file listing is eventually
  // consistent: a file that was just uploaded may not appear in a listing for
  // several seconds, and rediscovering by name in that window would create a
  // second folder.
  phase('discovering');
  const rootFolderId = await ensureFolder(drive, ROOT_FOLDER_NAME, state.rootFolderId);
  const devicesFolderId = await ensureFolder(
    drive,
    DEVICES_FOLDER_NAME,
    state.devicesFolderId,
    rootFolderId,
  );

  if (!state.rootFolderId) {
    // First run on this account: leave a note explaining what the folder is,
    // since the whole point of a visible folder is that the user can find it.
    await drive.create('README.txt', rootFolderId, FOLDER_README, 'text/plain').catch(() => {
      // A missing README is cosmetic; never fail a sync over it.
    });
  }

  await store.writeState({ rootFolderId, devicesFolderId });

  // -- pull ----------------------------------------------------------------
  phase('pulling');
  const myFileName = deviceFileName(state.deviceId);
  const listing = await drive.list(devicesFolderId);
  const peerFiles = listing.filter((f) => f.name !== myFileName && f.name.endsWith('.json'));

  const cache: PeerCache = state.peerCacheJson ? (JSON.parse(state.peerCacheJson) as PeerCache) : {};
  const nextCache: PeerCache = {};
  const remotes: Snapshot[] = [];
  const warnings: MergeWarning[] = [];
  let pulled = 0;

  for (const file of peerFiles) {
    const cached = cache[file.id];
    const unchanged =
      cached &&
      ((file.md5Checksum && cached.md5 === file.md5Checksum) ||
        (!file.md5Checksum && cached.modifiedTime === file.modifiedTime));

    let json: string;
    if (unchanged) {
      json = cached.json;
    } else {
      try {
        json = await drive.download(file.id);
        pulled += 1;
      } catch (e) {
        // One unreadable peer must not stop the others from merging.
        warnings.push({
          code: 'peer-skipped',
          message: `Could not read ${file.name} from Drive (${(e as Error).message}).`,
        });
        continue;
      }
    }

    nextCache[file.id] = { md5: file.md5Checksum, modifiedTime: file.modifiedTime, json };

    try {
      remotes.push(decodeSnapshot(json));
    } catch {
      warnings.push({
        code: 'peer-skipped',
        message: `Skipped ${file.name}: it is not readable sync data.`,
      });
    }
  }

  // -- merge ---------------------------------------------------------------
  phase('merging');
  const local = await store.readSnapshot();
  const result = mergeSnapshots(local, remotes);
  const hasChanges = result.ops.length > 0 || result.mintTombstones.length > 0;

  // -- apply ---------------------------------------------------------------
  if (hasChanges) {
    // A local safety copy before the first change of every sync. buildBackup
    // already exists and costs milliseconds; it is the difference between a
    // recoverable bug and an unrecoverable one.
    phase('backing-up');
    await store.backupBeforeApply();

    phase('applying');
    await store.applyOps(result.ops);
    if (result.mintTombstones.length > 0) {
      await store.mintTombstones(result.mintTombstones);
    }
  }

  if (result.maxObservedHlc) await store.observeRemote(result.maxObservedHlc);

  // -- publish -------------------------------------------------------------
  // After the merge, not before: the published snapshot should describe what
  // this device knows now, including everything it just learned.
  phase('publishing');
  const outgoing = await store.readSnapshot();
  const payload = encodeSnapshot({
    ...outgoing,
    protocol: SYNC_PROTOCOL,
    app: 'precision-innovation',
    tableSchemaVersion: TABLE_SCHEMA_VERSION,
    migrationTag: MIGRATION_TAG,
    device: { id: state.deviceId, name: state.deviceName, platform: state.platform },
  });

  let myFileId = state.myFileId;
  let published = false;

  const mine = listing.find((f) => f.name === myFileName);
  if (!myFileId && mine) myFileId = mine.id;

  if (myFileId) {
    try {
      const updated = await drive.update(myFileId, payload);
      myFileId = updated.id ?? myFileId;
      published = true;
    } catch (e) {
      // The file was deleted from Drive (by the user, or from another device's
      // "remove device"). Recreate rather than failing the sync.
      if ((e as { status?: number }).status === 404) {
        const created = await drive.create(myFileName, devicesFolderId, payload);
        myFileId = created.id;
        published = true;
      } else {
        throw e;
      }
    }
  } else {
    const created = await drive.create(myFileName, devicesFolderId, payload);
    myFileId = created.id;
    published = true;
  }

  await store.writeState({
    myFileId,
    peerCacheJson: JSON.stringify(nextCache),
    lastSyncAt: new Date(),
    lastPublishedHlc: outgoing.hlc,
    lastSyncError: null,
  });

  phase('done');

  return {
    peers: result.stats.peers,
    peersSkipped: result.stats.peersSkipped + warnings.length,
    pulled,
    applied: result.ops.length,
    upserts: result.stats.upserts,
    deletes: result.stats.deletes,
    conflicts: result.stats.conflicts,
    published,
    warnings: [...warnings, ...result.warnings],
  };
}

/** Lazily created only when photo sync is enabled. */
export async function ensureBlobsFolder(
  drive: DriveClient,
  rootFolderId: string,
  cachedId: string | null,
): Promise<string> {
  return ensureFolder(drive, BLOBS_FOLDER_NAME, cachedId, rootFolderId);
}

export type { DriveFile };
