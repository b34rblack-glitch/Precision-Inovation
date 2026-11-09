import { describe, expect, it } from 'vitest';
import { describePurge, planPurge, type Tables } from '@/lib/purge';

// Two rifles. Rifle A owns load L1 (versions v1, v2), a session with DOPE
// and a chrono string with shots, a workup with steps and a string, a range
// card and a lands reading. Rifle B shot a session with A's load (nullable
// link) and started a workup on A's load (NOT NULL link).
const tables: Tables = {
  rifles: [{ id: 'A' }, { id: 'B' }],
  landsMeasurements: [{ id: 'lm1', rifleId: 'A' }],
  loads: [
    { id: 'L1', rifleId: 'A' },
    { id: 'L2', rifleId: 'B' },
  ],
  loadVersions: [
    { id: 'v1', loadId: 'L1' },
    { id: 'v2', loadId: 'L1' },
    { id: 'vB', loadId: 'L2' },
  ],
  workups: [
    { id: 'wA', rifleId: 'A', loadId: 'L1', baseVersionId: 'v1', resultLoadVersionId: null },
    { id: 'wB', rifleId: 'B', loadId: 'L1', baseVersionId: null, resultLoadVersionId: null },
    { id: 'wB2', rifleId: 'B', loadId: 'L2', baseVersionId: 'v2', resultLoadVersionId: null },
  ],
  workupSteps: [
    { id: 'stA', workupId: 'wA' },
    { id: 'stB', workupId: 'wB' },
  ],
  rangeSessions: [
    { id: 'sA', rifleId: 'A', loadVersionId: 'v2' },
    { id: 'sB', rifleId: 'B', loadVersionId: 'v1' },
    { id: 'sB2', rifleId: 'B', loadVersionId: 'vB' },
  ],
  shotStrings: [
    { id: 'strA', sessionId: 'sA', workupStepId: null },
    { id: 'strStep', sessionId: null, workupStepId: 'stB' },
    { id: 'strB', sessionId: 'sB', workupStepId: null },
  ],
  shots: [
    { id: 'sh1', stringId: 'strA' },
    { id: 'sh2', stringId: 'strB' },
  ],
  dopeEntries: [
    { id: 'd1', sessionId: 'sA' },
    { id: 'd2', sessionId: 'sB' },
  ],
  rangeCards: [
    { id: 'cA', rifleId: 'A', loadVersionId: 'v1' },
    { id: 'cB', rifleId: 'B', loadVersionId: 'v2' },
  ],
};

const ids = (plan: ReturnType<typeof planPurge>, tbl: string) => plan.deletes.filter((d) => d.tbl === tbl).map((d) => d.id).sort();

describe('planPurge', () => {
  it('deleting a rifle takes its loads, their workups anywhere, its sessions, cards and lands; clears other rifles\' session links', () => {
    const plan = planPurge(tables, [{ tbl: 'rifles', id: 'A' }]);
    expect(ids(plan, 'rifles')).toEqual(['A']);
    expect(ids(plan, 'loads')).toEqual(['L1']);
    expect(ids(plan, 'loadVersions')).toEqual(['v1', 'v2']);
    // wB belongs to rifle B but its NOT NULL loadId is L1: it goes too.
    expect(ids(plan, 'workups')).toEqual(['wA', 'wB']);
    expect(ids(plan, 'workupSteps')).toEqual(['stA', 'stB']);
    expect(ids(plan, 'rangeSessions')).toEqual(['sA']);
    expect(ids(plan, 'dopeEntries')).toEqual(['d1']);
    expect(ids(plan, 'shotStrings')).toEqual(['strA', 'strStep']);
    expect(ids(plan, 'shots')).toEqual(['sh1']);
    // Both cards reference A's versions (NOT NULL): both go.
    expect(ids(plan, 'rangeCards')).toEqual(['cA', 'cB']);
    expect(ids(plan, 'landsMeasurements')).toEqual(['lm1']);
    // Rifle B's session with A's load lives on with the link cleared; its
    // workup on its own load drops the nullable base-version link.
    expect(plan.nulls).toEqual(
      expect.arrayContaining([
        { tbl: 'rangeSessions', id: 'sB', col: 'loadVersionId' },
        { tbl: 'workups', id: 'wB2', col: 'baseVersionId' },
      ]),
    );
    expect(plan.nulls).toHaveLength(2);
    expect(plan.deletes.map((d) => d.id)).not.toContain('sB');
  });

  it('orders deletes children first', () => {
    const plan = planPurge(tables, [{ tbl: 'rifles', id: 'A' }]);
    const pos = (id: string) => plan.deletes.findIndex((d) => d.id === id);
    expect(pos('sh1')).toBeLessThan(pos('strA'));
    expect(pos('strA')).toBeLessThan(pos('sA'));
    expect(pos('d1')).toBeLessThan(pos('sA'));
    expect(pos('stA')).toBeLessThan(pos('wA'));
    expect(pos('wA')).toBeLessThan(pos('L1'));
    expect(pos('v1')).toBeLessThan(pos('L1'));
    expect(pos('L1')).toBeLessThan(pos('A'));
    expect(pos('lm1')).toBeLessThan(pos('A'));
  });

  it('deleting a load keeps the rifle and other sessions, clearing their link', () => {
    const plan = planPurge(tables, [{ tbl: 'loads', id: 'L1' }]);
    expect(ids(plan, 'rifles')).toEqual([]);
    expect(ids(plan, 'loads')).toEqual(['L1']);
    expect(ids(plan, 'workups')).toEqual(['wA', 'wB']);
    expect(ids(plan, 'rangeSessions')).toEqual([]);
    expect(plan.nulls).toEqual(
      expect.arrayContaining([
        { tbl: 'rangeSessions', id: 'sA', col: 'loadVersionId' },
        { tbl: 'rangeSessions', id: 'sB', col: 'loadVersionId' },
      ]),
    );
    expect(plan.counts).toMatchObject({ loads: 1, loadVersions: 2, workups: 2, rangeCards: 2 });
  });

  it('describes the plan in words, skipping tables asked for', () => {
    const plan = planPurge(tables, [{ tbl: 'rifles', id: 'A' }]);
    expect(describePurge(plan, ['rifles'])).toBe(
      '1 lands measurement, 1 load, 2 recipe versions, 2 workups, 1 range session, 2 chrono strings, 1 shot, 1 DOPE entry, 2 range cards',
    );
  });
});
