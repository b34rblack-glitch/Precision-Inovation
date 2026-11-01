import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { newId, now } from '@/db/ids';
import { deleteRow, insertRow, mutate, updateRow } from '@/db/mutate';
import { BenchItem, benchItems, BenchKind, NewBenchItem } from '@/db/schema';
import { normalizeName, type LearnedItem } from '@/lib/bench/model';

// The user's bench: components and tools the pickers show first.

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export function benchItemsQuery() {
  return db.select().from(benchItems).orderBy(benchItems.name);
}

function findInTx(tx: Tx, kind: BenchKind, name: string): BenchItem | undefined {
  const key = normalizeName(name);
  return tx
    .select()
    .from(benchItems)
    .where(eq(benchItems.kind, kind))
    .all()
    .find((i) => normalizeName(i.name) === key);
}

/**
 * Add an item unless one with the same name (case and punctuation aside) is
 * already there. A learned item never overwrites a ticked one; a ticked one
 * upgrades a learned row's source so it stays after the load is archived.
 */
export function upsertBenchItemSync(
  tx: Tx,
  item: LearnedItem & { source: BenchItem['source'] },
): BenchItem {
  const existing = findInTx(tx, item.kind, item.name);
  const t = now();
  if (existing) {
    const patch: Partial<NewBenchItem> = {};
    if (existing.source === 'learned' && item.source === 'manual') patch.source = 'manual';
    if (existing.cartridge == null && item.cartridge) patch.cartridge = item.cartridge;
    if (existing.bcValue == null && item.bcValue != null) {
      patch.bcValue = item.bcValue;
      patch.bcModel = item.bcModel;
    }
    if (Object.keys(patch).length > 0) updateRow(tx, 'benchItems', existing.id, patch);
    return { ...existing, ...patch } as BenchItem;
  }
  const row: NewBenchItem = { ...item, id: newId(), createdAt: t, updatedAt: t };
  insertRow(tx, 'benchItems', row);
  return row as BenchItem;
}

export async function addBenchItem(item: LearnedItem): Promise<BenchItem> {
  return mutate((tx) => upsertBenchItemSync(tx, { ...item, source: 'manual' }));
}

/** Teach the bench what a saved load uses; called inside the load's own transaction. */
export function learnBenchSync(tx: Tx, items: readonly LearnedItem[]): void {
  for (const item of items) upsertBenchItemSync(tx, { ...item, source: 'learned' });
}

export async function setBenchItemCartridge(id: string, cartridge: string | null): Promise<void> {
  mutate((tx) => updateRow(tx, 'benchItems', id, { cartridge }));
}

/** Hard delete plus a tombstone, like every other delete. */
export async function removeBenchItem(id: string): Promise<void> {
  mutate((tx) => deleteRow(tx, 'benchItems', id));
}
