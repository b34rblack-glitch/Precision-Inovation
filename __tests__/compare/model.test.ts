import { describe, expect, it } from 'vitest';
import type {
  DopeEntry,
  Load,
  LoadVersion,
  RangeSession,
  ShotString,
  Workup,
  WorkupStep,
} from '@/db/schema';
import {
  applyFilters,
  bestGroups,
  buildCompareModel,
  dataExtent,
  DEFAULT_FILTERS,
  dopeCurves,
  groupPoints,
  ladderCurves,
  MAX_SERIES,
  SERIES_COLORS,
  velocitySummary,
  velocityTrends,
  type CompareInput,
} from '@/lib/compare/model';

// Fixtures carry only the columns the model reads; the cast keeps them short.
const day = (n: number) => new Date(Date.UTC(2026, 9, n));
const load = (o: Partial<Load>): Load =>
  ({ archivedAt: null, rifleId: 'r1', currentVersionId: null, createdAt: day(1), ...o }) as Load;
const version = (o: Partial<LoadVersion>): LoadVersion => ({ chargeGr: null, ...o }) as LoadVersion;
const session = (o: Partial<RangeSession>): RangeSession =>
  ({ rifleId: 'r1', archivedAt: null, loadVersionId: null, date: day(1), ...o }) as RangeSession;
const string = (o: Partial<ShotString>): ShotString =>
  ({ sessionId: null, workupStepId: null, sdFps: null, esFps: null, shotCount: null, createdAt: day(1), ...o }) as ShotString;
const dopeRow = (o: Partial<DopeEntry>): DopeEntry =>
  ({ elevationHold: null, groupSizeIn: null, holdUnit: 'MIL', confirmed: true, ...o }) as DopeEntry;
const workup = (o: Partial<Workup>): Workup =>
  ({ rifleId: 'r1', archivedAt: null, distanceYd: 100, createdAt: day(1), ...o }) as Workup;
const step = (o: Partial<WorkupStep>): WorkupStep => ({ groupSizeIn: null, updatedAt: day(1), ...o }) as WorkupStep;

const input: CompareInput = {
  rifle: { id: 'r1', turretUnit: 'MIL' },
  loads: [
    load({ id: 'B', name: 'Load B', currentVersionId: 'vB1', createdAt: day(2) }),
    load({ id: 'A', name: 'Load A', currentVersionId: 'vA2', createdAt: day(1) }),
    load({ id: 'X', name: 'Other rifle', rifleId: 'r2', createdAt: day(1) }),
    load({ id: 'Z', name: 'Archived', archivedAt: day(3), createdAt: day(1) }),
  ],
  versions: [
    version({ id: 'vA1', loadId: 'A', chargeGr: 41.0, bulletMake: 'Hornady', bulletModel: 'ELD-X', bulletWeightGr: 212 }),
    version({ id: 'vA2', loadId: 'A', chargeGr: 41.5, bulletMake: 'Hornady', bulletModel: 'ELD-X', bulletWeightGr: 212 }),
    version({ id: 'vB1', loadId: 'B', chargeGr: 72.0 }),
    version({ id: 'vX', loadId: 'X' }),
  ],
  sessions: [
    // Old version of A: still A's history.
    session({ id: 's1', loadVersionId: 'vA1', date: day(5) }),
    session({ id: 's2', loadVersionId: 'vA2', date: day(10) }),
    session({ id: 's3', loadVersionId: 'vB1', date: day(12) }),
    session({ id: 's4', loadVersionId: 'vB1', date: day(13), archivedAt: day(14) }),
    session({ id: 's5', loadVersionId: 'vX', rifleId: 'r2', date: day(6) }),
    session({ id: 's6', loadVersionId: null, date: day(7) }),
  ],
  strings: [
    string({ id: 'str1', sessionId: 's1', avgFps: 2800, sdFps: 10, esFps: 30, shotCount: 5 }),
    string({ id: 'str2', sessionId: 's2', avgFps: 2820, sdFps: 6, esFps: 18, shotCount: 10 }),
    string({ id: 'str3', sessionId: 's3', avgFps: 2900, sdFps: 12, esFps: 40, shotCount: 3 }),
    string({ id: 'str4', sessionId: 's4', avgFps: 9999 }),
    string({ id: 'str5', sessionId: 's2', avgFps: null }),
    string({ id: 'str6', workupStepId: 'st2', avgFps: 2790, sdFps: 8, esFps: 20, shotCount: 3, createdAt: day(3) }),
    string({ id: 'str7', workupStepId: 'st3', avgFps: 2812, sdFps: 5, esFps: 12, shotCount: 3, createdAt: day(3) }),
    string({ id: 'str8', workupStepId: 'stX', avgFps: 1, createdAt: day(3) }),
  ],
  dope: [
    dopeRow({ id: 'd1', sessionId: 's1', distanceYd: 100, elevationHold: 0, groupSizeIn: 0.9 }),
    dopeRow({ id: 'd2', sessionId: 's2', distanceYd: 500, elevationHold: 2.4, groupSizeIn: 3.0 }),
    dopeRow({ id: 'd3', sessionId: 's2', distanceYd: 500, elevationHold: 2.6, confirmed: false }),
    // MOA on a MIL rifle converts.
    dopeRow({ id: 'd4', sessionId: 's3', distanceYd: 300, elevationHold: 3.4377467707849396, holdUnit: 'MOA', groupSizeIn: 1.5 }),
    dopeRow({ id: 'd5', sessionId: 's4', distanceYd: 900, elevationHold: 9, groupSizeIn: 9 }),
    dopeRow({ id: 'd6', sessionId: 's6', distanceYd: 100, elevationHold: 1 }),
  ],
  workups: [
    workup({ id: 'w1', loadId: 'A', createdAt: day(3) }),
    workup({ id: 'w0', loadId: 'A', createdAt: day(2), distanceYd: null }),
    workup({ id: 'wX', loadId: 'X', rifleId: 'r2' }),
  ],
  steps: [
    step({ id: 'st1', workupId: 'w1', seq: 1, chargeGr: 40.5, groupSizeIn: 1.2 }),
    step({ id: 'st2', workupId: 'w1', seq: 2, chargeGr: 41.0, groupSizeIn: 0.7 }),
    step({ id: 'st3', workupId: 'w1', seq: 3, chargeGr: 41.5 }),
    step({ id: 'st0', workupId: 'w0', seq: 1, chargeGr: 40.0, groupSizeIn: 2 }),
    step({ id: 'stX', workupId: 'wX', seq: 1, chargeGr: 1 }),
  ],
};

const model = buildCompareModel(input);

describe('buildCompareModel', () => {
  it('lists the rifle\'s active loads in creation order with fixed colours', () => {
    expect(model.loads.map((l) => l.loadId)).toEqual(['A', 'B']);
    expect(model.loads.map((l) => l.color)).toEqual([SERIES_COLORS[0], SERIES_COLORS[1]]);
    expect(model.loads[0]).toMatchObject({ bullet: 'Hornady ELD-X 212 gr', chargeGr: 41.5, versionIds: ['vA1', 'vA2'] });
    expect(model.unit).toBe('MIL');
  });

  it('runs out of colours after MAX_SERIES loads instead of cycling', () => {
    const many = buildCompareModel({
      ...input,
      loads: Array.from({ length: MAX_SERIES + 1 }, (_, i) => load({ id: `L${i}`, name: `L${i}`, createdAt: day(i + 1) })),
    });
    expect(many.loads.at(-1)?.color).toBeNull();
    expect(many.loads.slice(0, MAX_SERIES).every((l) => l.color)).toBe(true);
  });

  it('attaches session strings through the whole version lineage and drops archived, foreign and unassigned sessions', () => {
    expect(model.velocity.filter((s) => s.source === 'session').map((s) => [s.loadId, s.avgFps, s.chargeGr])).toEqual([
      ['A', 2800, 41.0],
      ['A', 2820, 41.5],
      ['B', 2900, 72.0],
    ]);
  });

  it('attaches workup strings to their step\'s charge', () => {
    const w = model.velocity.filter((s) => s.source === 'workup');
    expect(w.map((s) => [s.loadId, s.chargeGr, s.avgFps])).toEqual([
      ['A', 41.0, 2790],
      ['A', 41.5, 2812],
    ]);
  });

  it('collects groups from DOPE and from workup steps with a test distance', () => {
    expect(model.groups.map((g) => [g.loadId, g.source, g.distanceYd, g.groupIn])).toEqual(
      expect.arrayContaining([
        ['A', 'session', 100, 0.9],
        ['A', 'session', 500, 3.0],
        ['B', 'session', 300, 1.5],
        ['A', 'workup', 100, 1.2],
        ['A', 'workup', 100, 0.7],
      ]),
    );
    expect(model.groups).toHaveLength(5);
  });

  it('converts DOPE holds to the rifle\'s turret unit and keeps the confirmed flag', () => {
    expect(model.dope.map((d) => [d.loadId, d.distanceYd, Number(d.elevation.toFixed(3)), d.confirmed])).toEqual([
      ['A', 100, 0, true],
      ['B', 300, 1, true],
      ['A', 500, 2.4, true],
      ['A', 500, 2.6, false],
    ]);
  });

  it('keeps ladder points that have a velocity or a group, sorted by charge', () => {
    expect(model.ladders.map((p) => [p.workupId, p.chargeGr, p.avgFps, p.groupIn])).toEqual([
      ['w0', 40.0, null, 2],
      ['w1', 40.5, null, 1.2],
      ['w1', 41.0, 2790, 0.7],
      ['w1', 41.5, 2812, null],
    ]);
  });
});

describe('applyFilters', () => {
  it('passes everything with the defaults', () => {
    expect(applyFilters(model, DEFAULT_FILTERS)).toEqual(model);
  });

  it('hides a load everywhere', () => {
    const out = applyFilters(model, { ...DEFAULT_FILTERS, hidden: new Set(['A']) });
    for (const list of [out.velocity, out.groups, out.dope, out.ladders]) {
      expect(list.every((r) => r.loadId === 'B')).toBe(true);
    }
    expect(out.loads).toEqual(model.loads);
  });

  it('switches sources off: no workups means no ladders, no sessions means no DOPE', () => {
    const noWorkups = applyFilters(model, { ...DEFAULT_FILTERS, sources: new Set(['session']) });
    expect(noWorkups.ladders).toEqual([]);
    expect(noWorkups.velocity.every((s) => s.source === 'session')).toBe(true);
    const noSessions = applyFilters(model, { ...DEFAULT_FILTERS, sources: new Set(['workup']) });
    expect(noSessions.dope).toEqual([]);
    expect(noSessions.groups.every((g) => g.source === 'workup')).toBe(true);
  });

  it('clips to the date and distance ranges, and to a minimum shot count', () => {
    const dated = applyFilters(model, { ...DEFAULT_FILTERS, dateRangeMs: [day(10).getTime(), day(12).getTime()] });
    expect(dated.velocity.map((s) => s.avgFps)).toEqual([2820, 2900]);
    expect(dated.ladders).toEqual([]);
    const near = applyFilters(model, { ...DEFAULT_FILTERS, distanceRangeYd: [0, 300] });
    expect(near.dope.map((d) => d.distanceYd)).toEqual([100, 300]);
    expect(near.groups.every((g) => g.distanceYd <= 300)).toBe(true);
    const fiveUp = applyFilters(model, { ...DEFAULT_FILTERS, minShots: 5 });
    expect(fiveUp.velocity.map((s) => s.avgFps)).toEqual([2800, 2820]);
  });

  it('confirmedOnly drops unconfirmed DOPE', () => {
    const out = applyFilters(model, { ...DEFAULT_FILTERS, confirmedOnly: true });
    expect(out.dope.every((d) => d.confirmed)).toBe(true);
    expect(out.dope).toHaveLength(3);
  });
});

describe('aggregates', () => {
  it('dataExtent spans every dated row and the longest string', () => {
    const ext = dataExtent(model);
    // Workup-step groups date from the step's last edit (day 1 in the fixtures).
    expect(ext.dateMs).toEqual([day(1).getTime(), day(12).getTime()]);
    expect(ext.distanceYd).toEqual([100, 500]);
    expect(ext.maxShots).toBe(10);
    expect(dataExtent({ ...model, velocity: [], groups: [], dope: [], ladders: [] })).toEqual({
      dateMs: null,
      distanceYd: null,
      maxShots: 0,
    });
  });

  it('velocitySummary weights by shot count and takes the worst ES', () => {
    const [a, b] = velocitySummary(model.velocity.filter((s) => s.source === 'session'));
    expect(a).toMatchObject({ loadId: 'A', strings: 2, shots: 15 });
    expect(a!.avgFps).toBeCloseTo((2800 * 5 + 2820 * 10) / 15, 6);
    expect(a!.sdFps).toBeCloseTo((10 * 5 + 6 * 10) / 15, 6);
    expect(a!.esFps).toBe(30);
    expect(b).toMatchObject({ loadId: 'B', avgFps: 2900, sdFps: 12, esFps: 40, strings: 1, shots: 3 });
    expect(velocitySummary([{ loadId: 'C', dateMs: 0, source: 'session', avgFps: 2700, sdFps: null, esFps: null, shots: null, chargeGr: null }])).toEqual([
      { loadId: 'C', avgFps: 2700, sdFps: null, esFps: null, strings: 1, shots: 0 },
    ]);
  });

  it('bestGroups ranks in inches or in MOA, which changes the winner across distances', () => {
    const inches = bestGroups(model.groups, 'in');
    expect(inches.find((b) => b.loadId === 'A')).toMatchObject({ groupIn: 0.7, distanceYd: 100, groups: 4 });
    // 3.0 in at 500 yd is 0.57 MOA, tighter than 0.7 in at 100 yd (0.67 MOA).
    const moa = bestGroups(model.groups, 'MOA');
    expect(moa.find((b) => b.loadId === 'A')).toMatchObject({ groupIn: 3.0, distanceYd: 500 });
  });

  it('dopeCurves averages repeats at a distance and sorts by distance', () => {
    const curves = dopeCurves(model.dope);
    expect(curves.get('A')).toEqual([
      { x: 100, y: 0 },
      { x: 500, y: 2.5 },
    ]);
  });

  it('velocityTrends and groupPoints are per load and sorted along x', () => {
    expect(velocityTrends(model.velocity).get('A')?.map((p) => p.y)).toEqual([2790, 2812, 2800, 2820]);
    const pts = groupPoints(model.groups, 'MOA').get('A')!;
    expect(pts.map((p) => p.x)).toEqual([100, 100, 100, 500]);
    expect(pts[3]!.y).toBeCloseTo(0.573, 3);
  });

  it('ladderCurves takes the latest workup per load and only charges with a velocity', () => {
    const curves = ladderCurves(model.ladders);
    expect(curves.get('A')).toEqual({
      workupId: 'w1',
      points: [
        { x: 41.0, y: 2790 },
        { x: 41.5, y: 2812 },
      ],
    });
    expect(curves.has('B')).toBe(false);
  });
});
