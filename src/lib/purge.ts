// Permanent deletion, planned from the schema's own foreign keys. Pure: hand
// in the rows and the roots, get back exactly what to delete (children first)
// and which nullable references to clear. The repository runs the plan in one
// transaction with tombstones, so the deletion syncs like any other write.

import { FK_EDGES, onMissingParent, TABLE_ORDER, type TableName } from '@/lib/tables';

export type Row = Record<string, unknown> & { id: string };
export type Tables = Partial<Record<TableName, readonly Row[]>>;

export type PurgePlan = {
  /** Children before parents: safe to delete in this order with FKs enforced. */
  deletes: { tbl: TableName; id: string }[];
  /** Nullable references into the deleted set, to clear before the deletes. */
  nulls: { tbl: TableName; id: string; col: string }[];
  /** How many rows of each table the plan removes. */
  counts: Partial<Record<TableName, number>>;
};

/**
 * Nullable links that still mean ownership. A load's rifle is nullable (a
 * load can be unassigned), but deleting a rifle deletes its loads rather
 * than orphaning them, which is what "delete the rifle" means to a person.
 * A chrono string belongs to exactly one of a session or a workup step and
 * cannot outlive it, even though both columns are nullable.
 */
export const OWNING_NULLABLE: readonly { tbl: TableName; col: string }[] = [
  { tbl: 'loads', col: 'rifleId' },
  { tbl: 'shotStrings', col: 'sessionId' },
  { tbl: 'shotStrings', col: 'workupStepId' },
];

/**
 * Everything that must go when `roots` go. A row whose NOT NULL foreign key
 * (or an owning nullable one) points at a doomed row is doomed too: a workup
 * cannot outlive its load, a shot its string. A row whose only link is an
 * ordinary nullable key keeps living with that key cleared, so a session shot
 * with a deleted load's version stays, as a session of its rifle with no load.
 */
export function planPurge(
  tables: Tables,
  roots: { tbl: TableName; id: string }[],
  owning: readonly { tbl: TableName; col: string }[] = OWNING_NULLABLE,
): PurgePlan {
  const drops = (edge: { tbl: TableName; col: string }) =>
    onMissingParent(edge as Parameters<typeof onMissingParent>[0]) === 'drop' || owning.some((o) => o.tbl === edge.tbl && o.col === edge.col);
  const doomed = new Map<TableName, Set<string>>();
  for (const t of TABLE_ORDER) doomed.set(t, new Set());
  for (const r of roots) doomed.get(r.tbl)!.add(r.id);

  // Fixpoint over the FK graph: parents first, repeated until nothing new.
  let changed = true;
  while (changed) {
    changed = false;
    for (const edge of FK_EDGES) {
      if (!drops(edge)) continue;
      const parents = doomed.get(edge.parent)!;
      if (parents.size === 0) continue;
      const set = doomed.get(edge.tbl)!;
      for (const row of tables[edge.tbl] ?? []) {
        const ref = row[edge.col];
        if (ref != null && parents.has(String(ref)) && !set.has(row.id)) {
          set.add(row.id);
          changed = true;
        }
      }
    }
  }

  const nulls: PurgePlan['nulls'] = [];
  for (const edge of FK_EDGES) {
    if (drops(edge)) continue;
    const parents = doomed.get(edge.parent)!;
    if (parents.size === 0) continue;
    for (const row of tables[edge.tbl] ?? []) {
      const ref = row[edge.col];
      if (ref != null && parents.has(String(ref)) && !doomed.get(edge.tbl)!.has(row.id)) {
        nulls.push({ tbl: edge.tbl, id: row.id, col: edge.col });
      }
    }
  }

  const deletes: PurgePlan['deletes'] = [];
  const counts: PurgePlan['counts'] = {};
  for (const tbl of [...TABLE_ORDER].reverse()) {
    const ids = doomed.get(tbl)!;
    if (ids.size === 0) continue;
    counts[tbl] = ids.size;
    for (const id of ids) deletes.push({ tbl, id });
  }
  return { deletes, nulls, counts };
}

const LABELS: Partial<Record<TableName, [string, string]>> = {
  rifles: ['rifle', 'rifles'],
  loads: ['load', 'loads'],
  loadVersions: ['recipe version', 'recipe versions'],
  workups: ['workup', 'workups'],
  rangeSessions: ['range session', 'range sessions'],
  dopeEntries: ['DOPE entry', 'DOPE entries'],
  shotStrings: ['chrono string', 'chrono strings'],
  shots: ['shot', 'shots'],
  rangeCards: ['range card', 'range cards'],
  landsMeasurements: ['lands measurement', 'lands measurements'],
};

/** "2 loads, 5 range sessions, 18 DOPE entries" for the confirmation prompt. */
export function describePurge(plan: PurgePlan, skip: readonly TableName[] = []): string {
  const parts: string[] = [];
  for (const tbl of TABLE_ORDER) {
    const n = plan.counts[tbl];
    if (!n || skip.includes(tbl) || !LABELS[tbl]) continue;
    const [one, many] = LABELS[tbl]!;
    parts.push(`${n} ${n === 1 ? one : many}`);
  }
  return parts.join(', ');
}
