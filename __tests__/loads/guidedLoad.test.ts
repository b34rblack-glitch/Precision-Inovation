import { describe, expect, it } from 'vitest';
import {
  draftPreview,
  draftToResult,
  emptyDraft,
  firstStepWithErrors,
  GUIDED_STEPS,
  GuidedDraft,
  guidedStepIndex,
  isDraftDirty,
  isStepFilled,
  shortPowderName,
  suggestLoadName,
  validateDraft,
} from '@/features/loads/guidedLoad';
import { STAGE_TITLES } from '@/features/loads/recipe';

const step = (key: (typeof GUIDED_STEPS)[number]['key']) => GUIDED_STEPS[guidedStepIndex(key)]!;

const draftWith = (patch: Partial<GuidedDraft>): GuidedDraft => ({ ...emptyDraft(), ...patch });

describe('guided load steps', () => {
  it('walks ingredients first, then assembly, then review — the order a loader works', () => {
    expect(GUIDED_STEPS.map((s) => s.key)).toEqual([
      'rifle',
      'bullet',
      'powder',
      'primer',
      'brass',
      'casePrep',
      'sizing',
      'seating',
      'review',
    ]);
  });

  it('every draft field belongs to exactly one step', () => {
    const seen = new Map<string, string>();
    for (const s of GUIDED_STEPS) {
      for (const f of s.fields) {
        expect(seen.has(f), `${f} is on both ${seen.get(f)} and ${s.key}`).toBe(false);
        seen.set(f, s.key);
      }
    }
    const all = Object.keys(emptyDraft()).sort();
    expect([...seen.keys()].sort()).toEqual(all);
  });

  it('the review step is the only place the name is collected', () => {
    expect(step('review').fields).toContain('name');
    for (const s of GUIDED_STEPS) if (s.key !== 'review') expect(s.fields).not.toContain('name');
  });
});

describe('emptyDraft / dirty / filled', () => {
  it('seeds the rifle and cartridge from a deep link', () => {
    const d = emptyDraft({ rifleId: 'r1', cartridge: '6.5 Creedmoor' });
    expect(d.rifleId).toBe('r1');
    expect(d.cartridge).toBe('6.5 Creedmoor');
    expect(d.bcModel).toBe('G7');
    expect(d.sizingDieType).toBe('—');
  });

  it('a fresh draft is clean against its own seed, dirty after any edit', () => {
    const seed = emptyDraft({ rifleId: 'r1', cartridge: '.308' });
    expect(isDraftDirty(seed, seed)).toBe(false);
    expect(isDraftDirty({ ...seed, primer: 'CCI BR-2' }, seed)).toBe(true);
    expect(isDraftDirty({ ...seed, annealed: 'Yes' }, seed)).toBe(true);
  });

  it('an optional step reads as filled once any of its fields moves off the default', () => {
    const d = emptyDraft();
    expect(isStepFilled(d, step('casePrep'))).toBe(false);
    expect(isStepFilled({ ...d, neckTurned: 'Yes' }, step('casePrep'))).toBe(true);
    expect(isStepFilled({ ...d, caseTrimLength: '1.910' }, step('casePrep'))).toBe(true);
    // A field on another step doesn't count.
    expect(isStepFilled({ ...d, primer: 'x' }, step('casePrep'))).toBe(false);
  });
});

describe('suggestLoadName', () => {
  it('builds the house-style name from bullet and powder', () => {
    const d = draftWith({
      bulletModel: 'ELD-M',
      bulletWeight: '140',
      powderName: 'Hodgdon H4350',
      chargeGr: '41.5',
    });
    expect(suggestLoadName(d)).toBe('140 ELD-M / H4350 41.5');
  });

  it('falls back to the maker when there is no model, and copes with partial drafts', () => {
    expect(suggestLoadName(draftWith({ bulletMake: 'Berger', bulletWeight: '105' }))).toBe(
      '105 Berger',
    );
    expect(suggestLoadName(draftWith({ powderName: 'Varget' }))).toBe('Varget');
    expect(suggestLoadName(draftWith({ chargeGr: '42' }))).toBe('42');
    expect(suggestLoadName(emptyDraft())).toBe('');
  });

  it('drops a maker prefix only where the powder name still stands on its own', () => {
    expect(shortPowderName('Hodgdon H4350')).toBe('H4350');
    expect(shortPowderName('Alliant Reloder 16')).toBe('Reloder 16');
    expect(shortPowderName('Vihtavuori N555')).toBe('N555');
    // "4064" alone is just a number — IMR stays.
    expect(shortPowderName('IMR 4064')).toBe('IMR 4064');
    expect(shortPowderName('Varget')).toBe('Varget');
    expect(shortPowderName('  Hodgdon  ')).toBe('Hodgdon');
  });
});

describe('validateDraft', () => {
  it('passes an empty draft except for the missing name', () => {
    expect(validateDraft(emptyDraft())).toEqual({
      name: 'Give the load a name — everything else is optional.',
    });
  });

  it('scoped to a step, only checks that step (so the name is not demanded early)', () => {
    const d = draftWith({ bcValue: 'abc' });
    expect(validateDraft(d, step('bullet').fields)).toEqual({ bcValue: 'Enter a number like 41.5' });
    expect(validateDraft(d, step('powder').fields)).toEqual({});
  });

  it('applies the same physical-dimension rules as the full form', () => {
    const d = draftWith({
      name: 'x',
      bcValue: '0',
      bulletLength: '-1',
      caseTrimLength: '0',
      bushingSize: '0',
      shoulderBump: '-0.001',
      neckTension: '0',
      jumpToLands: '-0.010', // a jam: signed, allowed
      brassFirings: '3',
      chargeGr: '41,5', // decimal comma is fine
    });
    expect(validateDraft(d)).toEqual({
      bcValue: 'BC must be greater than 0.',
      bulletLength: 'Length must be greater than 0.',
      caseTrimLength: 'Trim length must be greater than 0.',
      bushingSize: 'Bushing size must be greater than 0.',
      shoulderBump: "Shoulder bump can't be negative.",
      neckTension: 'Neck tension must be greater than 0.',
    });
  });

  it('firstStepWithErrors points at the earliest offending step', () => {
    expect(firstStepWithErrors({})).toBe(-1);
    expect(firstStepWithErrors({ name: 'x' })).toBe(guidedStepIndex('review'));
    expect(firstStepWithErrors({ cbto: 'x', bulletWeight: 'y' })).toBe(guidedStepIndex('bullet'));
  });
});

describe('draftToResult', () => {
  it('trims strings, parses numbers, rounds firings and nulls what was not asked', () => {
    const d = draftWith({
      name: '  140 ELD-M / H4350 41.5 ',
      cartridge: '6.5 Creedmoor',
      rifleId: 'r1',
      bulletMake: 'Hornady',
      bulletModel: 'ELD-M',
      bulletWeight: '140',
      bcValue: '0.326',
      bcModel: 'G7',
      powderName: 'Hodgdon H4350',
      chargeGr: '41,5',
      primer: 'CCI BR-2',
      brass: 'Lapua',
      brassFirings: '2.6',
      annealed: 'Yes',
      annealMethod: 'AMP',
      sizingDieType: 'Full-length',
      shoulderBump: '0.002',
      cbto: '2.230',
      jumpToLands: '-0.010',
      notes: '  ',
    });
    const { meta, components } = draftToResult(d);
    expect(meta).toEqual({ name: '140 ELD-M / H4350 41.5', cartridge: '6.5 Creedmoor', rifleId: 'r1' });
    expect(components.bulletWeightGr).toBe(140);
    expect(components.bcValue).toBe(0.326);
    expect(components.chargeGr).toBe(41.5);
    expect(components.brassFirings).toBe(3);
    expect(components.caseAnnealed).toBe(true);
    expect(components.annealMethod).toBe('AMP');
    expect(components.caseNeckTurned).toBe(false);
    expect(components.sizingDieType).toBe('full-length');
    expect(components.shoulderBumpIn).toBe(0.002);
    expect(components.cbtoIn).toBe(2.23);
    expect(components.jumpToLandsIn).toBe(-0.01);
    expect(components.notes).toBeNull();
    // Not collected by the walkthrough — explicitly null, never undefined.
    expect(components.muzzleVelocityFps).toBeNull();
    expect(components.runoutIn).toBeNull();
    expect(components.bcSegments).toBeNull();
    expect(Object.values(components).some((v) => v === undefined)).toBe(false);
  });

  it('an untouched sizing type stores null, not the "—" placeholder', () => {
    expect(draftToResult(draftWith({ name: 'x' })).components.sizingDieType).toBeNull();
  });
});

describe('draftPreview', () => {
  it('renders through the recipe presenter so review matches the detail screen', () => {
    const { ingredients, stages } = draftPreview(
      draftWith({
        bulletModel: 'ELD-M',
        bulletWeight: '140',
        powderName: 'H4350',
        chargeGr: '41.5',
        seatingDie: 'Wilson',
        cbto: '2.230',
      }),
    );
    expect(ingredients.map((r) => r.label)).toEqual(['Bullet', 'Powder']);
    expect(ingredients[0]!.value).toBe('ELD-M 140gr');
    expect(stages.map((s) => s.title)).toEqual([STAGE_TITLES.charging, STAGE_TITLES.seating]);
  });

  it('is empty for an empty draft', () => {
    expect(draftPreview(emptyDraft())).toEqual({ ingredients: [], stages: [] });
  });
});
