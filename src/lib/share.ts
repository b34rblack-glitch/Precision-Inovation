// Pure logic for sharing part of a database and merging it into another one.
//
// A backup file is a full dump: Settings → Restore replaces everything with
// it. Sharing a rifle with a friend needs the opposite: a file that carries
// ONE rifle with its loads, sessions, DOPE and range cards, and an import that
// ADDS those rows next to whatever the receiving phone already has.
//
// Everything here is pure (no database, no React Native) so it can be tested
// against fixtures and against the real schema in __tests__/.

import {
  COLUMNS,
  DATE_KEYS,
  FK_EDGES,
  onMissingParent,
  TABLE_ORDER,
  type FkEdge,
  type TableName,
} from '@/lib/tables';

export const BACKUP_SCHEMA_VERSION = 1;

export type Row = Record<string, unknown>;
export type BackupTables = Record<TableName, Row[]>;

/** Extra metadata carried by a file produced by "Share rifle". */
export type ShareInfo = {
  /** Names of the rifles in the file, for the picker on the receiving phone. */
  rifleNames: string[];
};

export type BackupFile = {
  schemaVersion: number;
  exportedAt: string;
  app: 'precision-innovation';
  tables: BackupTables;
  share?: ShareInfo;
};

/** What to pull out of a backup when adding to existing data. */
export type ImportSelection = {
  rifleIds: readonly string[];
  /** Also take loads that are not assigned to any rifle. */
  includeUnattachedLoads: boolean;
};

export type BackupRifleSummary = {
  id: string;
  name: string;
  archived: boolean;
  loads: number;
  sessions: number;
};

export type BackupSummary = {
  rifles: BackupRifleSummary[];
  unattachedLoads: number;
  share: ShareInfo | null;
};

/**
 * Validate and parse a backup file. The two error messages are user-facing and
 * documented in the user guide; keep them verbatim.
 */
export function parseBackup(json: string): BackupFile {
  const parsed = JSON.parse(json) as Partial<BackupFile>;
  if (parsed.app !== 'precision-innovation' || !parsed.tables || typeof parsed.tables !== 'object') {
    throw new Error('Not a Precision Innovation backup file.');
  }
  if (typeof parsed.schemaVersion !== 'number' || parsed.schemaVersion > BACKUP_SCHEMA_VERSION) {
    throw new Error('Backup was made by a newer app version — update the app first.');
  }
  const tables = {} as BackupTables;
  for (const name of TABLE_ORDER) {
    const rows = (parsed.tables as Partial<BackupTables>)[name];
    tables[name] = Array.isArray(rows) ? (rows as Row[]) : [];
  }
  return {
    schemaVersion: parsed.schemaVersion,
    exportedAt: typeof parsed.exportedAt === 'string' ? parsed.exportedAt : '',
    app: 'precision-innovation',
    tables,
    share: parsed.share && Array.isArray(parsed.share.rifleNames) ? parsed.share : undefined,
  };
}

/** JSON stores dates as ISO strings (or epoch ms); drizzle needs Date objects. */
export function reviveDates(row: Row): Row {
  const out: Row = { ...row };
  for (const key of Object.keys(out)) {
    const value = out[key];
    if (DATE_KEYS.has(key) && value != null) {
      out[key] = new Date(value as string | number);
    }
  }
  return out;
}

/** What a file contains, for the "Add from backup" picker. */
export function describeBackup(tables: BackupTables, share?: ShareInfo): BackupSummary {
  const loadsByRifle = new Map<string, number>();
  let unattachedLoads = 0;
  for (const load of tables.loads) {
    const rifleId = load.rifleId as string | null | undefined;
    if (rifleId == null) unattachedLoads++;
    else loadsByRifle.set(rifleId, (loadsByRifle.get(rifleId) ?? 0) + 1);
  }
  const sessionsByRifle = new Map<string, number>();
  for (const session of tables.rangeSessions) {
    const rifleId = session.rifleId as string;
    sessionsByRifle.set(rifleId, (sessionsByRifle.get(rifleId) ?? 0) + 1);
  }
  return {
    rifles: tables.rifles.map((r) => ({
      id: String(r.id),
      name: typeof r.name === 'string' && r.name.trim() ? r.name : 'Unnamed rifle',
      archived: r.archivedAt != null,
      loads: loadsByRifle.get(String(r.id)) ?? 0,
      sessions: sessionsByRifle.get(String(r.id)) ?? 0,
    })),
    unattachedLoads,
    share: share ?? null,
  };
}

const edgesOf = (tbl: TableName): FkEdge[] => FK_EDGES.filter((e) => e.tbl === tbl);

/**
 * The rows reachable from the selected rifles (and, optionally, the loads
 * assigned to no rifle), with referential integrity guaranteed.
 *
 * Tables are walked parents-first. A row is anchored when any of its foreign
 * keys points into what has already been kept; it is then swept the way the
 * sync merge sweeps orphans: a NOT NULL key that points outside the subset
 * drops the row, a nullable one is blanked. So a workup on a kept rifle whose
 * load belongs to another rifle is dropped, and a session whose load version
 * was not selected is kept with its load reference cleared.
 */
export function selectSubset(tables: BackupTables, selection: ImportSelection): BackupTables {
  const kept = {} as Record<TableName, Set<string>>;
  const out = {} as BackupTables;
  const wanted = new Set(selection.rifleIds);

  for (const tbl of TABLE_ORDER) {
    const edges = edgesOf(tbl);
    const rows: Row[] = [];
    for (const raw of tables[tbl] ?? []) {
      let anchored: boolean;
      if (tbl === 'rifles') {
        anchored = wanted.has(String(raw.id));
      } else if (tbl === 'loads') {
        const rifleId = raw.rifleId as string | null | undefined;
        anchored =
          rifleId == null
            ? selection.includeUnattachedLoads
            : kept.rifles.has(rifleId);
      } else {
        anchored = edges.some((e) => {
          const v = raw[e.col];
          return v != null && kept[e.parent].has(String(v));
        });
      }
      if (!anchored) continue;

      let row = raw;
      let drop = false;
      for (const e of edges) {
        const v = row[e.col];
        if (v == null || kept[e.parent].has(String(v))) continue;
        if (onMissingParent(e) === 'drop') {
          drop = true;
          break;
        }
        row = { ...row, [e.col]: null };
      }
      if (drop) continue;
      rows.push(row);
    }
    out[tbl] = rows;
    kept[tbl] = new Set(rows.map((r) => String(r.id)));
  }
  return out;
}

/**
 * Columns that hold another row's id without a database-level foreign key.
 * `loads.currentVersionId` is repaired deterministically by the merge engine;
 * `loadVersions.parentVersionId` is history. Both must still be rewritten when
 * ids change, and blanked when their target is not in the file.
 */
const SOFT_REFS: readonly FkEdge[] = [
  { tbl: 'loads', col: 'currentVersionId', parent: 'loadVersions' },
  { tbl: 'loadVersions', col: 'parentVersionId', parent: 'loadVersions' },
];

/** Device-local paths and the hashes of blobs that do not travel in the file. */
const DEVICE_LOCAL_KEYS = new Set(['photoUri', 'photoSha256', 'targetPhotoUri', 'targetPhotoSha256']);

/** Blank photo references: the bytes are not in the file, so they mean nothing elsewhere. */
export function stripDeviceLocal(tables: BackupTables): BackupTables {
  const out = {} as BackupTables;
  for (const tbl of TABLE_ORDER) {
    out[tbl] = (tables[tbl] ?? []).map((row) => {
      const keys = Object.keys(row).filter((k) => DEVICE_LOCAL_KEYS.has(k) && row[k] != null);
      if (keys.length === 0) return row;
      const copy: Row = { ...row };
      for (const k of keys) copy[k] = null;
      return copy;
    });
  }
  return out;
}

/**
 * Give every row a fresh id and rewrite every reference to match, so the rows
 * can be inserted next to existing data without colliding with it (or with a
 * previous import of the same file). Photo references are blanked, and
 * `updatedAt` is set to `now` so the imported rows sort as newly arrived.
 */
export function remapIds(tables: BackupTables, newId: () => string, now?: Date): BackupTables {
  const map = new Map<string, string>();
  for (const tbl of TABLE_ORDER) {
    for (const row of tables[tbl] ?? []) {
      const id = String(row.id);
      if (!map.has(id)) map.set(id, newId());
    }
  }
  const refs = [...FK_EDGES, ...SOFT_REFS];
  const stripped = stripDeviceLocal(tables);
  const out = {} as BackupTables;
  for (const tbl of TABLE_ORDER) {
    const tableRefs = refs.filter((e) => e.tbl === tbl);
    out[tbl] = stripped[tbl].map((row) => {
      const copy: Row = { ...row, id: map.get(String(row.id)) };
      for (const e of tableRefs) {
        const v = copy[e.col];
        if (v == null) continue;
        copy[e.col] = map.get(String(v)) ?? null;
      }
      if (now && COLUMNS[tbl].includes('updatedAt')) copy.updatedAt = now;
      return copy;
    });
  }
  return out;
}
