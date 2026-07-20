import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { db } from '@/db/client';
import { newId, now } from '@/db/ids';
import { loads, loadVersions, shots, shotStrings, Workup, workups, workupSteps } from '@/db/schema';
import { generateChargeSeries, WorkupType } from '@/lib/workup/seriesGenerator';

export function workupsForLoadQuery(loadId: string) {
  return db
    .select()
    .from(workups)
    .where(and(eq(workups.loadId, loadId), isNull(workups.archivedAt)))
    .orderBy(desc(workups.createdAt));
}

export function workupByIdQuery(id: string) {
  return db.select().from(workups).where(eq(workups.id, id));
}

export function stepsForWorkupQuery(workupId: string) {
  return db
    .select()
    .from(workupSteps)
    .where(eq(workupSteps.workupId, workupId))
    .orderBy(asc(workupSteps.seq));
}

export function stringsForStepsQuery(workupId: string) {
  return db
    .select({ string: shotStrings, step: workupSteps })
    .from(shotStrings)
    .innerJoin(workupSteps, eq(shotStrings.workupStepId, workupSteps.id))
    .where(eq(workupSteps.workupId, workupId));
}

export async function createWorkup(params: {
  rifleId: string;
  loadId: string;
  baseVersionId: string | null;
  type: WorkupType;
  startChargeGr: number | null;
  incrementGr: number | null;
  stepCount: number | null;
  shotsPerCharge: number | null;
  distanceYd: number | null;
  notes: string | null;
}): Promise<Workup> {
  const t = now();
  const workupId = newId();
  await db.insert(workups).values({
    id: workupId,
    rifleId: params.rifleId,
    loadId: params.loadId,
    baseVersionId: params.baseVersionId,
    type: params.type,
    startChargeGr: params.startChargeGr,
    incrementGr: params.incrementGr,
    stepCount: params.stepCount,
    shotsPerCharge: params.shotsPerCharge,
    distanceYd: params.distanceYd,
    status: 'planned',
    notes: params.notes,
    createdAt: t,
    updatedAt: t,
  });

  if (
    params.type !== 'freeform' &&
    params.startChargeGr != null &&
    params.incrementGr != null &&
    params.stepCount != null
  ) {
    const series = generateChargeSeries({
      startChargeGr: params.startChargeGr,
      incrementGr: params.incrementGr,
      stepCount: params.stepCount,
    });
    if (series.length > 0) {
      await db.insert(workupSteps).values(
        series.map((chargeGr, i) => ({
          id: newId(),
          workupId,
          seq: i + 1,
          chargeGr,
          createdAt: t,
          updatedAt: t,
        })),
      );
    }
  }

  const rows = await db.select().from(workups).where(eq(workups.id, workupId));
  return rows[0]!;
}

export async function updateWorkupStatus(
  id: string,
  status: 'planned' | 'in_progress' | 'complete',
): Promise<void> {
  await db.update(workups).set({ status, updatedAt: now() }).where(eq(workups.id, id));
}

export async function updateStepResult(
  stepId: string,
  data: { groupSizeIn?: number | null; poiXIn?: number | null; poiYIn?: number | null; notes?: string | null },
): Promise<void> {
  await db.update(workupSteps).set({ ...data, updatedAt: now() }).where(eq(workupSteps.id, stepId));
}

export async function archiveWorkup(id: string): Promise<void> {
  await db.update(workups).set({ archivedAt: now(), updatedAt: now() }).where(eq(workups.id, id));
}

/**
 * Measured muzzle velocity (avg fps) for a workup's charge weight, taken from
 * the chronograph string attached to that charge's step. Returns null when the
 * charge has no step or no string with a recorded average.
 */
export async function measuredMvForCharge(
  workupId: string,
  chargeGr: number,
): Promise<number | null> {
  const [step] = await db
    .select()
    .from(workupSteps)
    .where(and(eq(workupSteps.workupId, workupId), eq(workupSteps.chargeGr, chargeGr)));
  if (!step) return null;
  const [string] = await db
    .select()
    .from(shotStrings)
    .where(eq(shotStrings.workupStepId, step.id));
  return string?.avgFps ?? null;
}

/**
 * Promote a winning charge weight to a new load version (the workup's result).
 * Copies the workup's base version components with the chosen charge.
 */
export async function promoteChargeToVersion(workupId: string, chargeGr: number): Promise<string> {
  const t = now();
  const [workup] = await db.select().from(workups).where(eq(workups.id, workupId));
  if (!workup) throw new Error(`Workup ${workupId} not found`);
  const [load] = await db.select().from(loads).where(eq(loads.id, workup.loadId));
  if (!load) throw new Error(`Load ${workup.loadId} not found`);

  const baseId = workup.baseVersionId ?? load.currentVersionId;
  const base = baseId
    ? (await db.select().from(loadVersions).where(eq(loadVersions.id, baseId)))[0]
    : undefined;
  const latest = await db
    .select()
    .from(loadVersions)
    .where(eq(loadVersions.loadId, load.id))
    .orderBy(desc(loadVersions.versionNumber))
    .limit(1);
  const nextNumber = (latest[0]?.versionNumber ?? 0) + 1;

  // Carry the winning charge's measured muzzle velocity onto the new version so
  // the load card's 'load' MV source works immediately after promotion. Look up
  // the workup step for the promoted charge, then its chronograph string.
  const measuredMv = await measuredMvForCharge(workupId, chargeGr);

  const versionId = newId();
  await db.insert(loadVersions).values({
    id: versionId,
    loadId: load.id,
    versionNumber: nextNumber,
    parentVersionId: baseId ?? null,
    bulletMake: base?.bulletMake ?? null,
    bulletModel: base?.bulletModel ?? null,
    bulletWeightGr: base?.bulletWeightGr ?? null,
    bcValue: base?.bcValue ?? null,
    bcModel: base?.bcModel ?? null,
    powderName: base?.powderName ?? null,
    chargeGr,
    primer: base?.primer ?? null,
    brass: base?.brass ?? null,
    brassFirings: base?.brassFirings ?? null,
    cbtoIn: base?.cbtoIn ?? null,
    coalIn: base?.coalIn ?? null,
    crimp: base?.crimp ?? null,
    muzzleVelocityFps: measuredMv,
    notes: `Promoted from workup (${workup.type}) at ${chargeGr}gr`,
    createdAt: t,
    updatedAt: t,
  });

  await db
    .update(workups)
    .set({ resultLoadVersionId: versionId, status: 'complete', updatedAt: t })
    .where(eq(workups.id, workupId));
  await db
    .update(loads)
    .set({ currentVersionId: versionId, updatedAt: t })
    .where(eq(loads.id, load.id));
  return versionId;
}

/** Per-shot velocities for a step's string, if any. */
export async function velocitiesForStep(stepId: string): Promise<number[]> {
  const strings = await db
    .select()
    .from(shotStrings)
    .where(eq(shotStrings.workupStepId, stepId));
  if (strings.length === 0) return [];
  const rows = await db
    .select()
    .from(shots)
    .where(eq(shots.stringId, strings[0]!.id))
    .orderBy(asc(shots.seq));
  return rows.map((r) => r.velocityFps);
}
