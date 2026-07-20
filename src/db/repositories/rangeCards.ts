import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/db/client';
import { newId, now } from '@/db/ids';
import { RangeCard, rangeCards } from '@/db/schema';
import { CardPreset, presetConfig } from '@/lib/rangecard/presets';
import { DistanceUnit } from '@/lib/units';

export function cardForRifleLoadQuery(rifleId: string, loadVersionId: string) {
  return db
    .select()
    .from(rangeCards)
    .where(
      and(
        eq(rangeCards.rifleId, rifleId),
        eq(rangeCards.loadVersionId, loadVersionId),
        isNull(rangeCards.archivedAt),
      ),
    );
}

export async function getOrCreateCard(
  rifleId: string,
  loadVersionId: string,
  distanceUnit: DistanceUnit,
): Promise<RangeCard> {
  const existing = await db
    .select()
    .from(rangeCards)
    .where(
      and(
        eq(rangeCards.rifleId, rifleId),
        eq(rangeCards.loadVersionId, loadVersionId),
        isNull(rangeCards.archivedAt),
      ),
    );
  if (existing[0]) return existing[0];

  const t = now();
  const preset = presetConfig('bench', distanceUnit);
  const row = {
    id: newId(),
    rifleId,
    loadVersionId,
    preset: 'bench' as const,
    startDistanceYd: preset.startDistanceYd,
    endDistanceYd: preset.endDistanceYd,
    incrementYd: preset.incrementYd,
    mvOverrideFps: null,
    atmoSnapshot: null,
    createdAt: t,
    updatedAt: t,
  };
  // A unique index on (rifle_id, load_version_id) backs this: concurrent
  // callers can both miss the select above, but only one insert wins; the
  // loser no-ops and the re-select below returns the winner's row.
  await db.insert(rangeCards).values(row).onConflictDoNothing();
  const [card] = await db
    .select()
    .from(rangeCards)
    .where(and(eq(rangeCards.rifleId, rifleId), eq(rangeCards.loadVersionId, loadVersionId)));
  return card ?? (row as RangeCard);
}

export async function setCardPreset(
  cardId: string,
  preset: CardPreset,
  distanceUnit: DistanceUnit,
): Promise<void> {
  const cfg = presetConfig(preset, distanceUnit);
  await db
    .update(rangeCards)
    .set({
      preset,
      startDistanceYd: cfg.startDistanceYd,
      endDistanceYd: cfg.endDistanceYd,
      incrementYd: cfg.incrementYd,
      updatedAt: now(),
    })
    .where(eq(rangeCards.id, cardId));
}

export async function setCardMvOverride(cardId: string, mvFps: number | null): Promise<void> {
  await db
    .update(rangeCards)
    .set({ mvOverrideFps: mvFps, updatedAt: now() })
    .where(eq(rangeCards.id, cardId));
}
