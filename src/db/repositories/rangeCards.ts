import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/db/client';
import { newId, now } from '@/db/ids';
import { deleteRow, mutate, stampRow, updateRow } from '@/db/mutate';
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
  return mutate((tx) => {
    const [existing] = tx
      .select()
      .from(rangeCards)
      .where(
        and(
          eq(rangeCards.rifleId, rifleId),
          eq(rangeCards.loadVersionId, loadVersionId),
          isNull(rangeCards.archivedAt),
        ),
      )
      .all();
    if (existing) return existing;

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
      bcScaleFactor: null,
      atmoSnapshot: null,
      latitudeDeg: null,
      azimuthDeg: null,
      inclineDeg: null,
      useLoggedWind: false,
      spinDriftEnabled: true,
      createdAt: t,
      updatedAt: t,
      archivedAt: null,
    };

    // A unique index on (rifle_id, load_version_id) backs this: concurrent
    // callers can both miss the select above, but only one insert wins; the
    // loser no-ops and the re-select below returns the winner's row. Only stamp
    // the row if our insert is the one that landed, so the loser does not claim
    // authorship of a row it did not write.
    tx.insert(rangeCards).values(row).onConflictDoNothing().run();
    const [card] = tx
      .select()
      .from(rangeCards)
      .where(and(eq(rangeCards.rifleId, rifleId), eq(rangeCards.loadVersionId, loadVersionId)))
      .all();

    if (card?.id === row.id) stampRow(tx, 'rangeCards', row.id);
    return card ?? (row as RangeCard);
  });
}

export async function setCardPreset(
  cardId: string,
  preset: CardPreset,
  distanceUnit: DistanceUnit,
): Promise<void> {
  const cfg = presetConfig(preset, distanceUnit);
  mutate((tx) =>
    updateRow(tx, 'rangeCards', cardId, {
      preset,
      startDistanceYd: cfg.startDistanceYd,
      endDistanceYd: cfg.endDistanceYd,
      incrementYd: cfg.incrementYd,
    }),
  );
}

/** Custom distance range for a card. Values are canonical yards; the caller
 * converts from the rifle's display unit. Sanitizes so end > start and step > 0. */
export async function setCardDistances(
  cardId: string,
  startDistanceYd: number,
  endDistanceYd: number,
  incrementYd: number,
): Promise<void> {
  const start = Math.max(1, startDistanceYd);
  const end = Math.max(start + 1, endDistanceYd);
  const step = Math.max(1, incrementYd);
  mutate((tx) =>
    updateRow(tx, 'rangeCards', cardId, {
      startDistanceYd: start,
      endDistanceYd: end,
      incrementYd: step,
    }),
  );
}

/** Stage-2 truing: drag scale factor multiplying the load's BC (null = reset). */
export async function setCardBcScale(cardId: string, scale: number | null): Promise<void> {
  mutate((tx) => updateRow(tx, 'rangeCards', cardId, { bcScaleFactor: scale }));
}

export async function setCardMvOverride(cardId: string, mvFps: number | null): Promise<void> {
  mutate((tx) => updateRow(tx, 'rangeCards', cardId, { mvOverrideFps: mvFps }));
}

/** Partial update of a card's advanced-ballistics settings. Only the keys
 * present are written; angles are degrees (see schema for conventions). */
export async function setCardBallistics(
  cardId: string,
  values: Partial<{
    latitudeDeg: number | null;
    azimuthDeg: number | null;
    inclineDeg: number | null;
    useLoggedWind: boolean;
    spinDriftEnabled: boolean;
  }>,
): Promise<void> {
  mutate((tx) => updateRow(tx, 'rangeCards', cardId, values));
}

/** See deleteRifle — exists for the sync engine, not the UI. */
export async function deleteRangeCard(id: string): Promise<void> {
  mutate((tx) => deleteRow(tx, 'rangeCards', id));
}
