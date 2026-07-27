import { TABLE_ORDER, type TableName } from '@/lib/tables';
import { formatHlc, type Hlc } from '@/sync/hlc';
import { MIGRATION_TAG, SYNC_PROTOCOL, TABLE_SCHEMA_VERSION } from '@/sync/protocol';
import type { Row, Snapshot, StampedRow, Tombstone } from '@/sync/types';

// Builders for merge tests. Kept terse so a test reads as a scenario rather
// than as object construction.

export const DEV_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const DEV_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
export const DEV_C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

export const T0 = 1_784_562_354_988;

/** A logical timestamp `t` milliseconds after the base, from `device`. */
export function at(t: number, device: string, counter = 0): Hlc {
  return formatHlc(T0 + t, counter, device);
}

const DEFAULTS: Partial<Record<TableName, Record<string, unknown>>> = {
  rifles: {
    name: 'Tikka T3x',
    sightHeightIn: 1.9,
    turretUnit: 'MIL',
    distanceUnit: 'yd',
    zeroDistance: 100,
    twistRight: true,
    archivedAt: null,
  },
  loads: { name: '6.5CM 140 ELD-M', rifleId: null, currentVersionId: null, archivedAt: null },
  loadVersions: { loadId: 'load-1', versionNumber: 1, parentVersionId: null },
  workups: {
    rifleId: 'rifle-1',
    loadId: 'load-1',
    type: 'velocity',
    status: 'planned',
    baseVersionId: null,
    resultLoadVersionId: null,
    archivedAt: null,
  },
  workupSteps: { workupId: 'workup-1', seq: 1, chargeGr: 41 },
  rangeSessions: { rifleId: 'rifle-1', loadVersionId: null, date: new Date(T0), archivedAt: null },
  shotStrings: {
    sessionId: 'session-1',
    workupStepId: null,
    source: 'manual',
    avgFps: null,
    sdFps: null,
    esFps: null,
    shotCount: null,
  },
  shots: { stringId: 'string-1', seq: 1, velocityFps: 2700 },
  dopeEntries: { sessionId: 'session-1', distanceYd: 600, confirmed: true },
  rangeCards: {
    rifleId: 'rifle-1',
    loadVersionId: 'ver-1',
    preset: 'bench',
    startDistanceYd: 100,
    endDistanceYd: 1000,
    incrementYd: 50,
    useLoggedWind: false,
    spinDriftEnabled: true,
    archivedAt: null,
  },
};

export function row(
  tbl: TableName,
  id: string,
  hlc: Hlc,
  fields: Record<string, unknown> = {},
): StampedRow {
  return {
    id,
    createdAt: new Date(T0),
    updatedAt: new Date(T0),
    ...(DEFAULTS[tbl] ?? {}),
    ...fields,
    _h: hlc,
  } as StampedRow;
}

export function tomb(t: TableName, id: string, hlc: Hlc): Tombstone {
  return { t, id, _h: hlc };
}

export type SnapshotInput = {
  device: string;
  rows?: Partial<Record<TableName, StampedRow[]>>;
  tombstones?: Tombstone[];
  hlc?: Hlc;
  overrides?: Partial<Snapshot>;
};

export function snapshot(input: SnapshotInput): Snapshot {
  return {
    protocol: SYNC_PROTOCOL,
    app: 'precision-innovation',
    tableSchemaVersion: TABLE_SCHEMA_VERSION,
    migrationTag: MIGRATION_TAG,
    device: { id: input.device, name: `Device ${input.device.slice(0, 4)}`, platform: 'test' },
    publishedAt: new Date(T0).toISOString(),
    hlc: input.hlc ?? at(0, input.device),
    rows: input.rows ?? {},
    tombstones: input.tombstones ?? [],
    ...(input.overrides ?? {}),
  };
}

export const EMPTY = (device = DEV_A): Snapshot => snapshot({ device });

/**
 * Applies merge operations to a snapshot, producing the resulting state.
 * Mirrors what a real driver does, so tests can assert on end state and drive
 * multi-round convergence checks.
 */
export function applyOps(
  base: Snapshot,
  result: { ops: readonly { kind: string; tbl: TableName; [k: string]: unknown }[] },
  device: string,
): Snapshot {
  const rows = new Map<TableName, Map<string, StampedRow>>();
  for (const tbl of TABLE_ORDER) {
    rows.set(tbl, new Map((base.rows[tbl] ?? []).map((r) => [r.id, { ...r }])));
  }
  const meta = new Map<string, { hlc: Hlc; deleted: boolean }>();
  for (const tbl of TABLE_ORDER) {
    for (const r of base.rows[tbl] ?? []) meta.set(`${tbl} ${r.id}`, { hlc: r._h, deleted: false });
  }
  for (const t of base.tombstones) meta.set(`${t.t} ${t.id}`, { hlc: t._h, deleted: true });

  for (const op of result.ops) {
    if (op.kind === 'delete') {
      rows.get(op.tbl)!.delete(op.id as string);
    } else if (op.kind === 'upsert') {
      const r = op.row as Row;
      const existing = rows.get(op.tbl)!.get(r.id);
      rows.get(op.tbl)!.set(r.id, { ...r, _h: existing?._h ?? '' } as StampedRow);
    } else {
      meta.set(`${op.tbl} ${op.id as string}`, {
        hlc: op.hlc as Hlc,
        deleted: op.deleted as boolean,
      });
    }
  }

  // Re-attach timestamps from the meta map and rebuild the tombstone list.
  const outRows: Partial<Record<TableName, StampedRow[]>> = {};
  for (const tbl of TABLE_ORDER) {
    const list: StampedRow[] = [];
    for (const r of rows.get(tbl)!.values()) {
      const m = meta.get(`${tbl} ${r.id}`);
      if (m?.deleted) continue;
      list.push({ ...r, _h: m?.hlc ?? r._h });
    }
    if (list.length > 0) outRows[tbl] = list;
  }

  const tombstones: Tombstone[] = [];
  for (const [k, m] of meta) {
    if (!m.deleted) continue;
    const sep = k.indexOf(' ');
    tombstones.push({ t: k.slice(0, sep) as TableName, id: k.slice(sep + 1), _h: m.hlc });
  }

  return snapshot({ device, rows: outRows, tombstones });
}

/** Stable, comparable view of a snapshot's data for convergence assertions. */
export function fingerprint(s: Snapshot): string {
  const parts: string[] = [];
  for (const tbl of TABLE_ORDER) {
    const list = [...(s.rows[tbl] ?? [])].sort((a, b) => (a.id < b.id ? -1 : 1));
    for (const r of list) {
      const keys = Object.keys(r)
        .filter((k) => k !== '_h')
        .sort();
      parts.push(`${tbl}/${r.id}:${keys.map((k) => `${k}=${fmt(r[k])}`).join(',')}`);
    }
  }
  parts.push(
    `tombstones:${[...s.tombstones]
      .map((t) => `${t.t}/${t.id}`)
      .sort()
      .join('|')}`,
  );
  return parts.join('\n');
}

function fmt(v: unknown): string {
  if (v instanceof Date) return String(v.getTime());
  return String(v);
}
