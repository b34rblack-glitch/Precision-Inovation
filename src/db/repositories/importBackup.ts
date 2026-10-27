import { newId, now } from '@/db/ids';
import { insertRows, mutate } from '@/db/mutate';
import {
  parseBackup,
  remapIds,
  reviveDates,
  selectSubset,
  type ImportSelection,
} from '@/lib/share';
import { TABLE_ORDER, type TableName } from '@/lib/tables';

export type ImportCounts = Record<TableName, number>;

/**
 * Add the selected rifles (and optionally the loads assigned to no rifle) from
 * a backup or share file to the existing data, without touching anything
 * already in the app.
 *
 * Every imported row gets a fresh id, so importing the same file twice makes
 * two copies rather than overwriting the first, and a friend's rifle can never
 * collide with one of yours. Rows go through the sync funnel, so they are
 * stamped and will sync like rows created here.
 */
export async function addFromBackup(
  json: string,
  selection: ImportSelection,
): Promise<{ counts: ImportCounts }> {
  const parsed = parseBackup(json);
  const subset = selectSubset(parsed.tables, selection);
  const rows = remapIds(subset, newId, now());
  const counts = {} as ImportCounts;
  mutate((tx) => {
    for (const table of TABLE_ORDER) {
      const revived = rows[table].map(reviveDates);
      counts[table] = revived.length;
      insertRows(tx, table, revived as never[]);
    }
  });
  return { counts };
}
