import { createHash } from 'node:crypto';
import type { FetchLike, HttpResponseLike } from '@/sync/drive';

// An in-memory Google Drive, spoken over fetch.
//
// Faking at the HTTP layer rather than at the DriveClient interface means the
// tests exercise the real client: URL and query construction, the multipart
// upload body, pagination, and the retry rules. A fake that implemented
// DriveClient directly would test almost none of that.

type Node = {
  id: string;
  name: string;
  mimeType: string;
  parents: string[];
  content: string;
  modifiedTime: string;
  trashed: boolean;
};

export type FakeDriveOptions = {
  /** Queue of statuses to return before succeeding, for retry tests. */
  failures?: number[];
};

export class FakeDrive {
  readonly nodes = new Map<string, Node>();
  /** Every request, for asserting on URLs and methods. */
  readonly calls: { method: string; url: string; body?: string }[] = [];
  private seq = 0;
  private clock = 0;
  private failures: number[];
  /** Set to fail the next N requests with this status. */
  validToken = 'token-1';

  constructor(options: FakeDriveOptions = {}) {
    this.failures = [...(options.failures ?? [])];
  }

  private nextId(prefix = 'file'): string {
    this.seq += 1;
    return `${prefix}-${this.seq}`;
  }

  private stamp(): string {
    this.clock += 1000;
    return new Date(1_784_562_354_988 + this.clock).toISOString();
  }

  /** Directly seed a file, e.g. another device's snapshot. */
  put(name: string, parentId: string, content: string, mimeType = 'application/json'): Node {
    const existing = [...this.nodes.values()].find(
      (n) => n.name === name && n.parents.includes(parentId) && !n.trashed,
    );
    if (existing) {
      existing.content = content;
      existing.modifiedTime = this.stamp();
      return existing;
    }
    const node: Node = {
      id: this.nextId(),
      name,
      mimeType,
      parents: [parentId],
      content,
      modifiedTime: this.stamp(),
      trashed: false,
    };
    this.nodes.set(node.id, node);
    return node;
  }

  mkdir(name: string, parentId?: string): Node {
    const node: Node = {
      id: this.nextId('folder'),
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: parentId ? [parentId] : [],
      content: '',
      modifiedTime: this.stamp(),
      trashed: false,
    };
    this.nodes.set(node.id, node);
    return node;
  }

  byName(name: string): Node | undefined {
    return [...this.nodes.values()].find((n) => n.name === name && !n.trashed);
  }

  private meta(node: Node, fields: string): Record<string, unknown> {
    const all: Record<string, unknown> = {
      id: node.id,
      name: node.name,
      modifiedTime: node.modifiedTime,
      size: String(node.content.length),
      md5Checksum: createHash('md5').update(node.content).digest('hex'),
    };
    if (!fields) return all;
    const wanted = fields.replace(/^.*\(|\)$/g, '').split(',');
    return Object.fromEntries(Object.entries(all).filter(([k]) => wanted.includes(k)));
  }

  private ok(body: string): HttpResponseLike {
    return { status: 200, ok: true, text: async () => body };
  }

  private err(status: number, body = ''): HttpResponseLike {
    return { status, ok: false, text: async () => body };
  }

  readonly fetch: FetchLike = async (url, init = {}) => {
    const method = init.method ?? 'GET';
    this.calls.push({ method, url, body: init.body });

    const injected = this.failures.shift();
    if (injected !== undefined) {
      return this.err(
        injected,
        injected === 403 ? JSON.stringify({ error: { errors: [{ reason: 'rateLimitExceeded' }] } }) : '',
      );
    }

    const auth = (init.headers ?? {}).Authorization;
    if (auth !== `Bearer ${this.validToken}`) return this.err(401, 'invalid token');

    const parsed = new URL(url);
    const params = parsed.searchParams;

    // -- download -------------------------------------------------------
    if (method === 'GET' && params.get('alt') === 'media') {
      const id = decodeURIComponent(parsed.pathname.split('/').pop()!);
      const node = this.nodes.get(id);
      if (!node || node.trashed) return this.err(404, 'not found');
      return this.ok(node.content);
    }

    // -- list / find ----------------------------------------------------
    if (method === 'GET' && parsed.pathname.endsWith('/files')) {
      const q = params.get('q') ?? '';
      const fields = params.get('fields') ?? '';

      const nameMatch = /name = '((?:[^'\\]|\\.)*)'/.exec(q);
      const mimeMatch = /mimeType = '([^']*)'/.exec(q);
      const parentMatch = /'([^']*)' in parents/.exec(q);

      let matches = [...this.nodes.values()].filter((n) => !n.trashed);
      if (nameMatch) {
        const wanted = nameMatch[1]!.replace(/\\'/g, "'").replace(/\\\\/g, '\\');
        matches = matches.filter((n) => n.name === wanted);
      }
      if (mimeMatch) matches = matches.filter((n) => n.mimeType === mimeMatch[1]);
      if (parentMatch) matches = matches.filter((n) => n.parents.includes(parentMatch[1]!));

      // Force pagination so the client's paging loop is exercised.
      const pageSize = 2;
      const start = Number(params.get('pageToken') ?? '0');
      const page = matches.slice(start, start + pageSize);
      const next = start + pageSize < matches.length ? String(start + pageSize) : undefined;

      return this.ok(
        JSON.stringify({
          files: page.map((n) => this.meta(n, fields)),
          ...(next && fields.includes('nextPageToken') ? { nextPageToken: next } : {}),
        }),
      );
    }

    // -- multipart upload -----------------------------------------------
    // Checked before the metadata-only create: the upload host's path is
    // /upload/drive/v3/files, which also ends with /drive/v3/files.
    if (method === 'POST' && parsed.pathname.includes('/upload/drive/v3/files')) {
      const raw = init.body ?? '';
      const boundaryMatch = /boundary=(.+)$/.exec((init.headers ?? {})['Content-Type'] ?? '');
      if (!boundaryMatch) return this.err(400, 'missing boundary');

      const parts = raw.split(`--${boundaryMatch[1]}`).filter((p) => p.trim() && p.trim() !== '--');
      const metaPart = parts[0]!.split('\r\n\r\n').slice(1).join('\r\n\r\n').trim();
      const contentPart = parts[1]!.split('\r\n\r\n').slice(1).join('\r\n\r\n').replace(/\r\n$/, '');

      const metadata = JSON.parse(metaPart) as { name: string; parents: string[] };
      const node = this.put(metadata.name, metadata.parents[0]!, contentPart);
      return this.ok(JSON.stringify(this.meta(node, params.get('fields') ?? '')));
    }

    // -- create folder / metadata-only ----------------------------------
    if (method === 'POST' && parsed.pathname.endsWith('/drive/v3/files')) {
      const body = JSON.parse(init.body ?? '{}') as {
        name: string;
        mimeType?: string;
        parents?: string[];
      };
      const node = this.mkdir(body.name, body.parents?.[0]);
      if (body.mimeType) node.mimeType = body.mimeType;
      return this.ok(JSON.stringify({ id: node.id }));
    }

    // -- media update ---------------------------------------------------
    if (method === 'PATCH' && parsed.pathname.includes('/upload/drive/v3/files/')) {
      const id = decodeURIComponent(parsed.pathname.split('/').pop()!);
      const node = this.nodes.get(id);
      if (!node || node.trashed) return this.err(404, 'not found');
      node.content = init.body ?? '';
      node.modifiedTime = this.stamp();
      return this.ok(JSON.stringify(this.meta(node, params.get('fields') ?? '')));
    }

    // -- delete ----------------------------------------------------------
    if (method === 'DELETE') {
      const id = decodeURIComponent(parsed.pathname.split('/').pop()!);
      const node = this.nodes.get(id);
      if (!node) return this.err(404, 'not found');
      this.nodes.delete(id);
      return this.ok('');
    }

    return this.err(400, `unhandled ${method} ${url}`);
  };
}

/** No-wait sleep so retry tests do not actually back off. */
export const noSleep = async (): Promise<void> => {};
