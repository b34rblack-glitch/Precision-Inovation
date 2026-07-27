// Google Drive v3, spoken directly over fetch.
//
// No SDK: the official client is large, Node-shaped, and would have to be
// replaced on the desktop side anyway. The surface we need is seven calls.
//
// Everything the platform provides — the HTTP client and the access token —
// arrives through DriveDeps, which is what lets the entire protocol be tested
// against an in-memory fake with no Google account involved.
//
// PURE (no imports outside the sync module).

export const DRIVE_FILES = 'https://www.googleapis.com/drive/v3/files';
export const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';

export const FOLDER_MIME = 'application/vnd.google-apps.folder';
export const JSON_MIME = 'application/json';

/** The folder the user sees in their own Drive. */
export const ROOT_FOLDER_NAME = 'Precision Innovation';
export const DEVICES_FOLDER_NAME = 'devices';
export const BLOBS_FOLDER_NAME = 'blobs';

export type DriveFile = {
  id: string;
  name: string;
  modifiedTime?: string;
  size?: string;
  md5Checksum?: string;
};

export type HttpResponseLike = {
  status: number;
  ok: boolean;
  text(): Promise<string>;
};

export type FetchLike = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<HttpResponseLike>;

export type DriveDeps = {
  fetchImpl: FetchLike;
  /** Returns a valid access token, refreshing if needed. */
  getAccessToken: () => Promise<string>;
  /** Forces a token refresh after a 401. Returns the new token. */
  refreshAccessToken?: () => Promise<string>;
  /** Injected so tests do not actually wait. */
  sleep?: (ms: number) => Promise<void>;
};

export class DriveError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(message);
    this.name = 'DriveError';
  }
}

const MAX_ATTEMPTS = 5;

function backoffMs(attempt: number): number {
  // 0.5s, 1s, 2s, 4s — deterministic, no jitter, so tests stay predictable.
  return 500 * 2 ** attempt;
}

function isRetryableStatus(status: number, body: string): boolean {
  if (status === 429) return true;
  if (status >= 500) return true;
  // Drive reports quota problems as 403 with a specific reason; other 403s are
  // permission failures that will never succeed on retry.
  if (status === 403) {
    return /rateLimitExceeded|userRateLimitExceeded|sharingRateLimitExceeded/.test(body);
  }
  return false;
}

export function createDriveClient(deps: DriveDeps) {
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  async function request(
    url: string,
    init: { method?: string; headers?: Record<string, string>; body?: string } = {},
  ): Promise<string> {
    let token = await deps.getAccessToken();
    let refreshed = false;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const response = await deps.fetchImpl(url, {
        ...init,
        headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` },
      });

      if (response.ok) return response.text();

      const body = await response.text();

      // One re-auth attempt: the token may simply have expired mid-sync.
      if (response.status === 401 && !refreshed && deps.refreshAccessToken) {
        refreshed = true;
        token = await deps.refreshAccessToken();
        continue;
      }

      if (isRetryableStatus(response.status, body) && attempt < MAX_ATTEMPTS - 1) {
        await sleep(backoffMs(attempt));
        continue;
      }

      throw new DriveError(
        `Drive request failed (${response.status}) for ${init.method ?? 'GET'} ${url}`,
        response.status,
        body,
      );
    }

    throw new DriveError(`Drive request gave up after ${MAX_ATTEMPTS} attempts`, 0, '');
  }

  async function json<T>(url: string, init?: Parameters<typeof request>[1]): Promise<T> {
    return JSON.parse(await request(url, init)) as T;
  }

  function quote(value: string): string {
    // Drive query strings are single-quoted; escaping matters because folder
    // names are user-visible and could contain an apostrophe.
    return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  }

  return {
    /** Finds a folder by name. With drive.file this only ever sees our own. */
    async findFolder(name: string, parentId?: string): Promise<string | null> {
      const clauses = [
        `mimeType = ${quote(FOLDER_MIME)}`,
        `name = ${quote(name)}`,
        'trashed = false',
      ];
      if (parentId) clauses.push(`${quote(parentId)} in parents`);

      const url =
        `${DRIVE_FILES}?q=${encodeURIComponent(clauses.join(' and '))}` +
        `&spaces=drive&fields=${encodeURIComponent('files(id,name)')}&pageSize=10`;

      const result = await json<{ files?: DriveFile[] }>(url);
      return result.files?.[0]?.id ?? null;
    },

    async createFolder(name: string, parentId?: string): Promise<string> {
      const body: Record<string, unknown> = { name, mimeType: FOLDER_MIME };
      if (parentId) body.parents = [parentId];

      const created = await json<DriveFile>(`${DRIVE_FILES}?fields=id`, {
        method: 'POST',
        headers: { 'Content-Type': JSON_MIME },
        body: JSON.stringify(body),
      });
      return created.id;
    },

    /** Everything directly inside a folder, following pagination. */
    async list(parentId: string): Promise<DriveFile[]> {
      const files: DriveFile[] = [];
      let pageToken: string | undefined;

      do {
        const q = `${quote(parentId)} in parents and trashed = false`;
        const url =
          `${DRIVE_FILES}?q=${encodeURIComponent(q)}&spaces=drive` +
          `&fields=${encodeURIComponent('nextPageToken,files(id,name,modifiedTime,size,md5Checksum)')}` +
          `&pageSize=100${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;

        const page = await json<{ files?: DriveFile[]; nextPageToken?: string }>(url);
        files.push(...(page.files ?? []));
        pageToken = page.nextPageToken;
      } while (pageToken);

      return files;
    },

    async download(fileId: string): Promise<string> {
      return request(`${DRIVE_FILES}/${encodeURIComponent(fileId)}?alt=media`);
    },

    async create(
      name: string,
      parentId: string,
      content: string,
      mimeType = JSON_MIME,
    ): Promise<DriveFile> {
      const boundary = `pi-${name}-boundary`;
      const metadata = JSON.stringify({ name, parents: [parentId], mimeType });
      const body =
        `--${boundary}\r\nContent-Type: ${JSON_MIME}; charset=UTF-8\r\n\r\n${metadata}\r\n` +
        `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n${content}\r\n` +
        `--${boundary}--`;

      return json<DriveFile>(
        `${DRIVE_UPLOAD}?uploadType=multipart&fields=${encodeURIComponent('id,name,modifiedTime,md5Checksum')}`,
        {
          method: 'POST',
          headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
          body,
        },
      );
    },

    async update(fileId: string, content: string, mimeType = JSON_MIME): Promise<DriveFile> {
      // Deliberately no `parents` in the body: reparenting needs the
      // addParents/removeParents query params, and a body `parents` here is
      // silently ignored, which is a confusing way to lose a file.
      return json<DriveFile>(
        `${DRIVE_UPLOAD}/${encodeURIComponent(fileId)}?uploadType=media` +
          `&fields=${encodeURIComponent('id,name,modifiedTime,md5Checksum')}`,
        { method: 'PATCH', headers: { 'Content-Type': mimeType }, body: content },
      );
    },

    async remove(fileId: string): Promise<void> {
      await request(`${DRIVE_FILES}/${encodeURIComponent(fileId)}`, { method: 'DELETE' });
    },
  };
}

export type DriveClient = ReturnType<typeof createDriveClient>;

/** `<deviceId>.json` — the file a device owns and is the only writer of. */
export function deviceFileName(deviceId: string): string {
  return `${deviceId}.json`;
}

export function deviceIdFromFileName(name: string): string | null {
  return name.endsWith('.json') ? name.slice(0, -'.json'.length) : null;
}

export const FOLDER_README = `Precision Innovation — synced data

This folder is created and maintained by the Precision Innovation app.
Each file under devices/ is one device's copy of your rifles, loads and
range data.

You can copy this folder to back it up, and you can delete it to stop
syncing. Editing the files by hand is not supported: the app treats them
as a whole and will overwrite changes it did not make.

Your data is not sent anywhere else. The app can only see files it
created in your Drive.
`;
