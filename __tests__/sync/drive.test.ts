import { describe, expect, it } from 'vitest';
import { createDriveClient, DriveError, JSON_MIME } from '@/sync/drive';
import { FakeDrive, noSleep } from './fakeDrive';

function client(fake: FakeDrive, extra: Record<string, unknown> = {}) {
  return createDriveClient({
    fetchImpl: fake.fetch,
    getAccessToken: async () => fake.validToken,
    sleep: noSleep,
    ...extra,
  });
}

describe('folder discovery', () => {
  it('finds an existing folder by name', async () => {
    const fake = new FakeDrive();
    const folder = fake.mkdir('Precision Innovation');

    expect(await client(fake).findFolder('Precision Innovation')).toBe(folder.id);
  });

  it('returns null when there is nothing to find', async () => {
    expect(await client(new FakeDrive()).findFolder('Precision Innovation')).toBeNull();
  });

  it('scopes the search to a parent when given one', async () => {
    const fake = new FakeDrive();
    const rootA = fake.mkdir('Precision Innovation');
    const rootB = fake.mkdir('Other');
    fake.mkdir('devices', rootA.id);
    const wanted = fake.mkdir('devices', rootB.id);

    expect(await client(fake).findFolder('devices', rootB.id)).toBe(wanted.id);
  });

  it('escapes apostrophes in names, which Drive queries would otherwise break on', async () => {
    const fake = new FakeDrive();
    const folder = fake.mkdir("Bob's rifles");

    expect(await client(fake).findFolder("Bob's rifles")).toBe(folder.id);
  });

  it('creates a folder under a parent', async () => {
    const fake = new FakeDrive();
    const root = fake.mkdir('Precision Innovation');

    const id = await client(fake).createFolder('devices', root.id);
    expect(fake.nodes.get(id)).toMatchObject({
      name: 'devices',
      mimeType: 'application/vnd.google-apps.folder',
      parents: [root.id],
    });
  });
});

describe('listing', () => {
  it('follows pagination to the end', async () => {
    // The fake pages at two per request, so five files exercises the loop.
    const fake = new FakeDrive();
    const devices = fake.mkdir('devices');
    for (let i = 0; i < 5; i++) fake.put(`device-${i}.json`, devices.id, '{}');

    const files = await client(fake).list(devices.id);
    expect(files).toHaveLength(5);
    expect(new Set(files.map((f) => f.name)).size).toBe(5);
  });

  it('returns the checksum used to skip unchanged peers', async () => {
    const fake = new FakeDrive();
    const devices = fake.mkdir('devices');
    fake.put('a.json', devices.id, '{"hello":true}');

    const [file] = await client(fake).list(devices.id);
    expect(file!.md5Checksum).toMatch(/^[0-9a-f]{32}$/);
    expect(file!.modifiedTime).toBeTruthy();
  });
});

describe('file contents', () => {
  it('round-trips a create then a download', async () => {
    const fake = new FakeDrive();
    const devices = fake.mkdir('devices');
    const payload = JSON.stringify({ app: 'precision-innovation', rows: { rifles: [] } });

    const created = await client(fake).create('dev-1.json', devices.id, payload);
    expect(await client(fake).download(created.id)).toBe(payload);
  });

  it('survives content containing the multipart boundary characters', async () => {
    const fake = new FakeDrive();
    const devices = fake.mkdir('devices');
    const payload = JSON.stringify({ notes: 'line1\r\nline2 -- dashes --', quote: '"' });

    const created = await client(fake).create('dev-1.json', devices.id, payload);
    expect(await client(fake).download(created.id)).toBe(payload);
  });

  it('updates in place, keeping the same file id', async () => {
    const fake = new FakeDrive();
    const devices = fake.mkdir('devices');
    const created = await client(fake).create('dev-1.json', devices.id, '{"v":1}');

    const updated = await client(fake).update(created.id, '{"v":2}');
    expect(updated.id).toBe(created.id);
    expect(await client(fake).download(created.id)).toBe('{"v":2}');
  });

  it('never sends parents on an update', async () => {
    // A `parents` field in a PATCH body is silently ignored by Drive —
    // reparenting needs addParents/removeParents — which is a confusing way to
    // think you have moved a file when you have not.
    const fake = new FakeDrive();
    const devices = fake.mkdir('devices');
    const created = await client(fake).create('dev-1.json', devices.id, '{}');
    fake.calls.length = 0;

    await client(fake).update(created.id, '{"v":2}');
    const patch = fake.calls.find((c) => c.method === 'PATCH')!;
    expect(patch.body).not.toContain('parents');
  });

  it('deletes a file', async () => {
    const fake = new FakeDrive();
    const devices = fake.mkdir('devices');
    const created = await client(fake).create('gone.json', devices.id, '{}');

    await client(fake).remove(created.id);
    expect(fake.nodes.has(created.id)).toBe(false);
  });

  it('reports a 404 as a DriveError carrying the status', async () => {
    // syncOnce keys its "my file was deleted from Drive" recovery off this.
    const fake = new FakeDrive();
    await expect(client(fake).download('missing')).rejects.toMatchObject({
      name: 'DriveError',
      status: 404,
    });
  });
});

describe('failure handling', () => {
  it('refreshes the token once after a 401, then succeeds', async () => {
    const fake = new FakeDrive();
    const folder = fake.mkdir('Precision Innovation');
    fake.validToken = 'token-2';

    let refreshes = 0;
    const drive = createDriveClient({
      fetchImpl: fake.fetch,
      getAccessToken: async () => 'token-1', // stale
      refreshAccessToken: async () => {
        refreshes += 1;
        return 'token-2';
      },
      sleep: noSleep,
    });

    expect(await drive.findFolder('Precision Innovation')).toBe(folder.id);
    expect(refreshes).toBe(1);
  });

  it('gives up rather than looping when the refreshed token is also rejected', async () => {
    const fake = new FakeDrive();
    fake.validToken = 'never-matches';

    const drive = createDriveClient({
      fetchImpl: fake.fetch,
      getAccessToken: async () => 'bad',
      refreshAccessToken: async () => 'still-bad',
      sleep: noSleep,
    });

    await expect(drive.findFolder('x')).rejects.toMatchObject({ status: 401 });
  });

  it('backs off and retries a rate-limit response', async () => {
    const fake = new FakeDrive({ failures: [429, 403] });
    const folder = fake.mkdir('Precision Innovation');

    expect(await client(fake).findFolder('Precision Innovation')).toBe(folder.id);
  });

  it('retries a server error', async () => {
    const fake = new FakeDrive({ failures: [500, 503] });
    const folder = fake.mkdir('Precision Innovation');

    expect(await client(fake).findFolder('Precision Innovation')).toBe(folder.id);
  });

  it('does not retry a permission failure, which would never succeed', async () => {
    const fake = new FakeDrive({ failures: [403, 403, 403, 403, 403, 403] });
    // A plain 403 with no rate-limit reason is a permission problem.
    const drive = createDriveClient({
      fetchImpl: async (url, init) => {
        const response = await fake.fetch(url, init);
        return response.status === 403
          ? { status: 403, ok: false, text: async () => 'insufficientPermissions' }
          : response;
      },
      getAccessToken: async () => fake.validToken,
      sleep: noSleep,
    });

    await expect(drive.findFolder('x')).rejects.toBeInstanceOf(DriveError);
    // One attempt only.
    expect(fake.calls).toHaveLength(1);
  });

  it('sends JSON with the right content type on create', async () => {
    const fake = new FakeDrive();
    const devices = fake.mkdir('devices');
    await client(fake).create('a.json', devices.id, '{}', JSON_MIME);

    const upload = fake.calls.find((c) => c.url.includes('uploadType=multipart'))!;
    expect(upload.body).toContain(`Content-Type: ${JSON_MIME}`);
  });
});
