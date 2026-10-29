// Load comparison for one rifle: every tested load's velocity, groups, DOPE
// and workup ladders, shaped for charts. Pure (no React Native, no database):
// the screen hands in the raw rows its live queries return and renders what
// comes back, so every rule here is tested on fixtures.

import type {
  DopeEntry,
  Load,
  LoadVersion,
  RangeSession,
  ShotString,
  Workup,
  WorkupStep,
} from '@/db/schema';
import { holdToUnit, inchesToMoaAtRange, type TurretUnit } from '@/lib/units';

/**
 * Categorical series colours, stepped for the app's #1C1F24 card surface and
 * validated (lightness band, chroma, CVD and normal-vision separation, 3:1
 * contrast) as a set in this order. Assigned to loads in creation order and
 * never cycled: a ninth load lists but cannot be charted until another is
 * hidden from the palette.
 */
export const SERIES_COLORS = [
  '#3987e5',
  '#d95926',
  '#199e70',
  '#c98500',
  '#d55181',
  '#008300',
  '#9085e9',
  '#e66767',
] as const;

export const MAX_SERIES = SERIES_COLORS.length;

export type CompareSource = 'session' | 'workup';

export type CompareLoad = {
  loadId: string;
  name: string;
  /** Null past MAX_SERIES loads: listed, but not chartable. */
  color: string | null;
  versionIds: string[];
  bullet: string | null;
  chargeGr: number | null;
};

export type VelocitySample = {
  loadId: string;
  dateMs: number;
  source: CompareSource;
  avgFps: number;
  sdFps: number | null;
  esFps: number | null;
  shots: number | null;
  chargeGr: number | null;
};

export type GroupSample = {
  loadId: string;
  dateMs: number;
  source: CompareSource;
  distanceYd: number;
  groupIn: number;
  chargeGr: number | null;
};

export type DopeSample = {
  loadId: string;
  dateMs: number;
  distanceYd: number;
  /** Elevation hold converted to the rifle's turret unit. */
  elevation: number;
  confirmed: boolean;
};

export type LadderPoint = {
  loadId: string;
  workupId: string;
  dateMs: number;
  chargeGr: number;
  avgFps: number | null;
  sdFps: number | null;
  groupIn: number | null;
};

export type CompareModel = {
  unit: TurretUnit;
  loads: CompareLoad[];
  velocity: VelocitySample[];
  groups: GroupSample[];
  dope: DopeSample[];
  ladders: LadderPoint[];
};

export type CompareInput = {
  rifle: { id: string; turretUnit: TurretUnit };
  loads: readonly Load[];
  versions: readonly LoadVersion[];
  sessions: readonly RangeSession[];
  strings: readonly ShotString[];
  dope: readonly DopeEntry[];
  workups: readonly Workup[];
  steps: readonly WorkupStep[];
};

const ms = (d: Date | number) => (d instanceof Date ? d.getTime() : Number(d));

export function buildCompareModel(input: CompareInput): CompareModel {
  const { rifle } = input;
  const unit = rifle.turretUnit;

  // Colour follows the load, by creation order, so hiding one never repaints
  // the rest. Archived loads keep their history out of the picture.
  const rifleLoads = input.loads
    .filter((l) => l.rifleId === rifle.id && l.archivedAt == null)
    .sort((a, b) => ms(a.createdAt) - ms(b.createdAt) || a.id.localeCompare(b.id));
  const loadIds = new Set(rifleLoads.map((l) => l.id));

  const versionById = new Map(input.versions.map((v) => [v.id, v]));
  const versionsByLoad = new Map<string, LoadVersion[]>();
  for (const v of input.versions) {
    if (!loadIds.has(v.loadId)) continue;
    const list = versionsByLoad.get(v.loadId) ?? [];
    list.push(v);
    versionsByLoad.set(v.loadId, list);
  }

  const loads: CompareLoad[] = rifleLoads.map((l, i) => {
    const current = l.currentVersionId ? versionById.get(l.currentVersionId) : undefined;
    const bullet = current
      ? [current.bulletMake, current.bulletModel, current.bulletWeightGr ? `${current.bulletWeightGr} gr` : null]
          .filter(Boolean)
          .join(' ') || null
      : null;
    return {
      loadId: l.id,
      name: l.name,
      color: i < MAX_SERIES ? SERIES_COLORS[i]! : null,
      versionIds: (versionsByLoad.get(l.id) ?? []).map((v) => v.id),
      bullet,
      chargeGr: current?.chargeGr ?? null,
    };
  });

  // Sessions attach to a load through any version in its lineage.
  const sessionById = new Map<string, RangeSession & { loadId: string }>();
  for (const s of input.sessions) {
    if (s.rifleId !== rifle.id || s.archivedAt != null || !s.loadVersionId) continue;
    const v = versionById.get(s.loadVersionId);
    if (!v || !loadIds.has(v.loadId)) continue;
    sessionById.set(s.id, { ...s, loadId: v.loadId });
  }

  const workupById = new Map<string, Workup>();
  for (const w of input.workups) {
    if (w.rifleId === rifle.id && w.archivedAt == null && loadIds.has(w.loadId)) workupById.set(w.id, w);
  }
  const stepById = new Map<string, WorkupStep & { workup: Workup }>();
  for (const st of input.steps) {
    const w = workupById.get(st.workupId);
    if (w) stepById.set(st.id, { ...st, workup: w });
  }

  const velocity: VelocitySample[] = [];
  const stringByStep = new Map<string, ShotString>();
  for (const str of input.strings) {
    if (str.avgFps == null) continue;
    if (str.sessionId) {
      const s = sessionById.get(str.sessionId);
      if (!s) continue;
      const v = s.loadVersionId ? versionById.get(s.loadVersionId) : undefined;
      velocity.push({
        loadId: s.loadId,
        dateMs: ms(s.date),
        source: 'session',
        avgFps: str.avgFps,
        sdFps: str.sdFps,
        esFps: str.esFps,
        shots: str.shotCount,
        chargeGr: v?.chargeGr ?? null,
      });
    } else if (str.workupStepId) {
      const st = stepById.get(str.workupStepId);
      if (!st) continue;
      stringByStep.set(st.id, str);
      velocity.push({
        loadId: st.workup.loadId,
        dateMs: ms(str.createdAt),
        source: 'workup',
        avgFps: str.avgFps,
        sdFps: str.sdFps,
        esFps: str.esFps,
        shots: str.shotCount,
        chargeGr: st.chargeGr,
      });
    }
  }

  const groups: GroupSample[] = [];
  const dope: DopeSample[] = [];
  for (const d of input.dope) {
    const s = sessionById.get(d.sessionId);
    if (!s) continue;
    const v = s.loadVersionId ? versionById.get(s.loadVersionId) : undefined;
    if (d.groupSizeIn != null) {
      groups.push({
        loadId: s.loadId,
        dateMs: ms(s.date),
        source: 'session',
        distanceYd: d.distanceYd,
        groupIn: d.groupSizeIn,
        chargeGr: v?.chargeGr ?? null,
      });
    }
    if (d.elevationHold != null) {
      dope.push({
        loadId: s.loadId,
        dateMs: ms(s.date),
        distanceYd: d.distanceYd,
        elevation: holdToUnit(d.elevationHold, d.holdUnit ?? unit, unit),
        confirmed: d.confirmed,
      });
    }
  }

  const ladders: LadderPoint[] = [];
  for (const st of stepById.values()) {
    const str = stringByStep.get(st.id);
    if (st.groupSizeIn != null && st.workup.distanceYd != null) {
      groups.push({
        loadId: st.workup.loadId,
        dateMs: ms(st.updatedAt),
        source: 'workup',
        distanceYd: st.workup.distanceYd,
        groupIn: st.groupSizeIn,
        chargeGr: st.chargeGr,
      });
    }
    if (str?.avgFps == null && st.groupSizeIn == null) continue;
    ladders.push({
      loadId: st.workup.loadId,
      workupId: st.workupId,
      dateMs: ms(st.workup.createdAt),
      chargeGr: st.chargeGr,
      avgFps: str?.avgFps ?? null,
      sdFps: str?.sdFps ?? null,
      groupIn: st.groupSizeIn,
    });
  }

  const byDate = <T extends { dateMs: number }>(a: T, b: T) => a.dateMs - b.dateMs;
  velocity.sort(byDate);
  groups.sort(byDate);
  dope.sort((a, b) => a.distanceYd - b.distanceYd || a.dateMs - b.dateMs);
  ladders.sort((a, b) => a.chargeGr - b.chargeGr);

  return { unit, loads, velocity, groups, dope, ladders };
}

// --- filters ------------------------------------------------------------------

export type CompareFilters = {
  /** Loads switched off in the legend. */
  hidden: ReadonlySet<string>;
  sources: ReadonlySet<CompareSource>;
  /** Inclusive, in ms since epoch; null = everything. */
  dateRangeMs: readonly [number, number] | null;
  /** Inclusive, canonical yards; null = everything. */
  distanceRangeYd: readonly [number, number] | null;
  /** Strings with fewer recorded shots are dropped (unknown counts pass). */
  minShots: number;
  confirmedOnly: boolean;
};

export const DEFAULT_FILTERS: CompareFilters = {
  hidden: new Set(),
  sources: new Set<CompareSource>(['session', 'workup']),
  dateRangeMs: null,
  distanceRangeYd: null,
  minShots: 1,
  confirmedOnly: false,
};

const inRange = (v: number, r: readonly [number, number] | null) => r === null || (v >= r[0] && v <= r[1]);

export function applyFilters(model: CompareModel, f: CompareFilters): CompareModel {
  const shown = (loadId: string) => !f.hidden.has(loadId);
  return {
    ...model,
    velocity: model.velocity.filter(
      (s) =>
        shown(s.loadId) &&
        f.sources.has(s.source) &&
        inRange(s.dateMs, f.dateRangeMs) &&
        (s.shots == null || s.shots >= f.minShots),
    ),
    groups: model.groups.filter(
      (g) =>
        shown(g.loadId) &&
        f.sources.has(g.source) &&
        inRange(g.dateMs, f.dateRangeMs) &&
        inRange(g.distanceYd, f.distanceRangeYd),
    ),
    dope: model.dope.filter(
      (d) =>
        shown(d.loadId) &&
        f.sources.has('session') &&
        inRange(d.dateMs, f.dateRangeMs) &&
        inRange(d.distanceYd, f.distanceRangeYd) &&
        (!f.confirmedOnly || d.confirmed),
    ),
    ladders: model.ladders.filter(
      (p) => shown(p.loadId) && f.sources.has('workup') && inRange(p.dateMs, f.dateRangeMs),
    ),
  };
}

/** The slider bounds: where the data actually is, before any filter. */
export function dataExtent(model: CompareModel): {
  dateMs: [number, number] | null;
  distanceYd: [number, number] | null;
  maxShots: number;
} {
  const dates = [
    ...model.velocity.map((s) => s.dateMs),
    ...model.groups.map((g) => g.dateMs),
    ...model.dope.map((d) => d.dateMs),
    ...model.ladders.map((p) => p.dateMs),
  ];
  const distances = [...model.groups.map((g) => g.distanceYd), ...model.dope.map((d) => d.distanceYd)];
  const shots = model.velocity.map((s) => s.shots ?? 0);
  const span = (xs: number[]): [number, number] | null =>
    xs.length === 0 ? null : [Math.min(...xs), Math.max(...xs)];
  return { dateMs: span(dates), distanceYd: span(distances), maxShots: shots.length ? Math.max(...shots) : 0 };
}

// --- aggregates ------------------------------------------------------------------

export type VelocitySummary = {
  loadId: string;
  /** Shot-count-weighted mean of string averages (unknown counts weigh 1). */
  avgFps: number;
  /** Shot-count-weighted mean of string SDs; null when no string has one. */
  sdFps: number | null;
  /** Largest extreme spread seen; null when no string has one. */
  esFps: number | null;
  strings: number;
  shots: number;
};

export function velocitySummary(samples: readonly VelocitySample[]): VelocitySummary[] {
  const acc = new Map<
    string,
    { w: number; avg: number; sdW: number; sd: number; es: number | null; strings: number; shots: number }
  >();
  for (const s of samples) {
    const w = s.shots ?? 1;
    const a = acc.get(s.loadId) ?? { w: 0, avg: 0, sdW: 0, sd: 0, es: null, strings: 0, shots: 0 };
    a.w += w;
    a.avg += s.avgFps * w;
    if (s.sdFps != null) {
      a.sdW += w;
      a.sd += s.sdFps * w;
    }
    if (s.esFps != null) a.es = a.es == null ? s.esFps : Math.max(a.es, s.esFps);
    a.strings += 1;
    a.shots += s.shots ?? 0;
    acc.set(s.loadId, a);
  }
  return [...acc].map(([loadId, a]) => ({
    loadId,
    avgFps: a.avg / a.w,
    sdFps: a.sdW > 0 ? a.sd / a.sdW : null,
    esFps: a.es,
    strings: a.strings,
    shots: a.shots,
  }));
}

export type GroupUnit = 'in' | 'MOA';

export const groupInUnit = (groupIn: number, distanceYd: number, unit: GroupUnit): number =>
  unit === 'in' ? groupIn : inchesToMoaAtRange(groupIn, distanceYd);

export type BestGroup = { loadId: string; groupIn: number; distanceYd: number; groups: number };

/** The tightest group per load, in the unit asked for (MOA ranks across distances fairly). */
export function bestGroups(groups: readonly GroupSample[], unit: GroupUnit): BestGroup[] {
  const best = new Map<string, BestGroup>();
  for (const g of groups) {
    const prev = best.get(g.loadId);
    const value = groupInUnit(g.groupIn, g.distanceYd, unit);
    const prevValue = prev ? groupInUnit(prev.groupIn, prev.distanceYd, unit) : Infinity;
    const groupsSeen = (prev?.groups ?? 0) + 1;
    if (value < prevValue) best.set(g.loadId, { loadId: g.loadId, groupIn: g.groupIn, distanceYd: g.distanceYd, groups: groupsSeen });
    else if (prev) prev.groups = groupsSeen;
  }
  return [...best.values()];
}

export type XY = { x: number; y: number };

/** Per load, the mean elevation hold at each distance, ascending by distance. */
export function dopeCurves(dope: readonly DopeSample[]): Map<string, XY[]> {
  const sums = new Map<string, Map<number, { n: number; sum: number }>>();
  for (const d of dope) {
    const byDist = sums.get(d.loadId) ?? new Map();
    const cell = byDist.get(d.distanceYd) ?? { n: 0, sum: 0 };
    cell.n += 1;
    cell.sum += d.elevation;
    byDist.set(d.distanceYd, cell);
    sums.set(d.loadId, byDist);
  }
  const out = new Map<string, XY[]>();
  for (const [loadId, byDist] of sums) {
    out.set(
      loadId,
      [...byDist]
        .map(([x, c]) => ({ x, y: c.sum / c.n }))
        .sort((a, b) => a.x - b.x),
    );
  }
  return out;
}

/** Per load, each string's average velocity by date. */
export function velocityTrends(samples: readonly VelocitySample[]): Map<string, XY[]> {
  const out = new Map<string, XY[]>();
  for (const s of samples) {
    const list = out.get(s.loadId) ?? [];
    list.push({ x: s.dateMs, y: s.avgFps });
    out.set(s.loadId, list);
  }
  for (const list of out.values()) list.sort((a, b) => a.x - b.x);
  return out;
}

/** Per load, each group by distance (y in the unit asked for). */
export function groupPoints(groups: readonly GroupSample[], unit: GroupUnit): Map<string, XY[]> {
  const out = new Map<string, XY[]>();
  for (const g of groups) {
    const list = out.get(g.loadId) ?? [];
    list.push({ x: g.distanceYd, y: groupInUnit(g.groupIn, g.distanceYd, unit) });
    out.set(g.loadId, list);
  }
  for (const list of out.values()) list.sort((a, b) => a.x - b.x);
  return out;
}

/** Per load, the latest workup's charge ladder: velocity by charge weight. */
export function ladderCurves(ladders: readonly LadderPoint[]): Map<string, { workupId: string; points: XY[] }> {
  const latest = new Map<string, { workupId: string; dateMs: number }>();
  for (const p of ladders) {
    const prev = latest.get(p.loadId);
    if (!prev || p.dateMs > prev.dateMs) latest.set(p.loadId, { workupId: p.workupId, dateMs: p.dateMs });
  }
  const out = new Map<string, { workupId: string; points: XY[] }>();
  for (const [loadId, { workupId }] of latest) {
    const points = ladders
      .filter((p) => p.loadId === loadId && p.workupId === workupId && p.avgFps != null)
      .map((p) => ({ x: p.chargeGr, y: p.avgFps! }))
      .sort((a, b) => a.x - b.x);
    if (points.length > 0) out.set(loadId, { workupId, points });
  }
  return out;
}
