import { describe, expect, it } from 'vitest';
import type { LoadVersion } from '@/db/schema';
import {
  FORM_GROUPS,
  groupHasData,
  isGroupNotUsed,
  isGroupVisible,
  stageHasVisibleGroups,
  type FormPrefs,
} from '@/features/loads/formGroups';

const version = (o: Partial<LoadVersion> = {}): LoadVersion => ({ ...o }) as LoadVersion;
const prefs = (mode: FormPrefs['mode'], ...notUsed: FormPrefs['notUsed'] extends ReadonlySet<infer K> ? K[] : never): FormPrefs => ({
  mode,
  notUsed: new Set(notUsed),
});

describe('groupHasData', () => {
  it('counts strings, numbers, true and non-empty lists; not blanks, false or null', () => {
    expect(groupHasData('crimp', version({ crimp: '  ' }))).toBe(false);
    expect(groupHasData('crimp', version({ crimpDie: 'Lee FCD' }))).toBe(true);
    expect(groupHasData('neckTurning', version({ caseNeckTurned: false }))).toBe(false);
    expect(groupHasData('neckTurning', version({ caseNeckTurned: true }))).toBe(true);
    expect(groupHasData('bulletDetail', version({ bcSegments: [] }))).toBe(false);
    expect(groupHasData('bulletDetail', version({ bcSegments: [{ minVelocityFps: 2000, bc: 0.3 }] }))).toBe(true);
    expect(groupHasData('shoulderBump', version({ shoulderBumpIn: 0 }))).toBe(true);
    expect(groupHasData('runout', undefined)).toBe(false);
  });

  it('every group names at least one field', () => {
    for (const g of FORM_GROUPS) expect(g.fields.length, g.key).toBeGreaterThan(0);
  });
});

describe('isGroupVisible', () => {
  it('Simple shows core groups only; Full shows everything not marked unused', () => {
    expect(isGroupVisible('shoulderBump', prefs('simple'), undefined)).toBe(true);
    expect(isGroupVisible('crimp', prefs('simple'), undefined)).toBe(false);
    expect(isGroupVisible('crimp', prefs('full'), undefined)).toBe(true);
    expect(isGroupVisible('crimp', prefs('full', 'crimp'), undefined)).toBe(false);
    expect(isGroupVisible('shoulderBump', prefs('simple', 'shoulderBump'), undefined)).toBe(false);
  });

  it('data on the load always wins', () => {
    const v = version({ crimp: 'light taper' });
    expect(isGroupVisible('crimp', prefs('simple', 'crimp'), v)).toBe(true);
    expect(isGroupNotUsed('crimp', prefs('full', 'crimp'), v)).toBe(false);
    expect(isGroupNotUsed('crimp', prefs('full', 'crimp'), undefined)).toBe(true);
    expect(isGroupNotUsed('crimp', prefs('simple'), undefined)).toBe(false);
  });
});

describe('stageHasVisibleGroups', () => {
  it('drops a stage whose groups are all hidden, keeps it when any shows or is marked unused in Full', () => {
    expect(stageHasVisibleGroups('priming', prefs('simple'), undefined)).toBe(false);
    expect(stageHasVisibleGroups('priming', prefs('full'), undefined)).toBe(true);
    expect(stageHasVisibleGroups('priming', prefs('full', 'primerLot', 'primerSeating'), undefined)).toBe(true);
    expect(stageHasVisibleGroups('priming', prefs('simple'), version({ primerLotNumber: 'L1' }))).toBe(true);
    expect(stageHasVisibleGroups('seating', prefs('simple', 'jump'), undefined, true)).toBe(true);
  });
});
