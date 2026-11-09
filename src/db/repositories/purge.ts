import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { deleteRow, mutate, updateRow } from '@/db/mutate';
import { describePurge, planPurge, type PurgePlan, type Tables } from '@/lib/purge';
import { TABLE_ORDER, TABLES, type TableName } from '@/lib/tables';

// Permanent deletion of a rifle or a load and everything under it. The plan
// is computed by the pure planner from the whole database (personal-scale,
// a few thousand rows at most) and applied in one transaction through the
// write funnel, so every removed row leaves a tombstone and syncs away from
// the other devices too.

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

function readAll(tx: Tx): Tables {
  const out: Tables = {};
  for (const tbl of TABLE_ORDER) {
    out[tbl] = tx.select().from(TABLES[tbl] as never).all() as unknown as Tables[TableName];
  }
  return out;
}

/** What deleting this row would take with it, in words, before anyone confirms. */
export async function deletionSummary(tbl: 'rifles' | 'loads', id: string): Promise<{ plan: PurgePlan; text: string }> {
  const tables: Tables = {};
  for (const t of TABLE_ORDER) {
    tables[t] = (await db.select().from(TABLES[t] as never)) as unknown as Tables[TableName];
  }
  const plan = planPurge(tables, [{ tbl, id }]);
  return { plan, text: describePurge(plan, [tbl]) };
}

/**
 * Delete the row and its whole subtree. Re-plans inside the transaction so
 * a write between the prompt and the tap cannot leave an orphan behind.
 */
export async function purge(tbl: 'rifles' | 'loads', id: string): Promise<PurgePlan> {
  return mutate((tx) => {
    const plan = planPurge(readAll(tx), [{ tbl, id }]);
    for (const n of plan.nulls) updateRow(tx, n.tbl, n.id, { [n.col]: null } as never);
    for (const d of plan.deletes) deleteRow(tx, d.tbl, d.id);
    // Loads pointing at a deleted current version would dangle; the merge
    // engine repairs that, but the local row should not wait for a sync.
    const deletedVersions = new Set(plan.deletes.filter((d) => d.tbl === 'loadVersions').map((d) => d.id));
    if (deletedVersions.size > 0) {
      for (const load of tx.select().from(TABLES.loads).all()) {
        if (load.currentVersionId && deletedVersions.has(load.currentVersionId)) {
          const [latest] = tx
            .select()
            .from(TABLES.loadVersions)
            .where(eq(TABLES.loadVersions.loadId, load.id))
            .all()
            .sort((a, b) => b.versionNumber - a.versionNumber);
          updateRow(tx, 'loads', load.id, { currentVersionId: latest?.id ?? null });
        }
      }
    }
    return plan;
  });
}
