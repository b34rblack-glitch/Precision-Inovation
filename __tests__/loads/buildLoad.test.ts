import { describe, expect, it } from 'vitest';
import {
  BUILD_STEPS,
  BuildDraft,
  canAdvance,
  CHARGE_ACK_TEXT,
  draftToPrefill,
  emptyDraft,
  isDraftDirty,
  isStepFilled,
  ladderPlan,
  prefillAsVersion,
  shortPowderName,
  stepIndexFor,
  stepsFor,
  suggestLoadName,
  validateStep,
} from '@/features/loads/buildLoad';
import { filledStageKeys } from '@/features/loads/recipe';
import { DEFAULT_SHOTS_PER_CHARGE, generateChargeSeries } from '@/lib/workup/seriesGenerator';

const step = (type: 'batch' | 'ladder', key: (typeof BUILD_STEPS)[number]['key']) =>
  stepsFor(type)[stepIndexFor(type, key)]!;

const draftWith = (patch: Partial<BuildDraft>): BuildDraft => ({ ...emptyDraft(), ...patch });

describe('step list', () => {
  it('a batch walks the production line and sizes the batch before seating', () => {
    expect(stepsFor('batch').map((s) => s.key)).toEqual([
      'stringType',
      'rifle',
      'bullet',
      'powder',
      'primer',
      'brass',
      'sizing',
      'charging',
      'batchCount',
      'seating',
      'review',
    ]);
  });

  it('a ladder swaps the batch size for the ladder plan, right after the charge', () => {
    const keys = stepsFor('ladder').map((s) => s.key);
    expect(keys).toContain('ladderPlan');
    expect(keys).not.toContain('batchCount');
    expect(keys.indexOf('ladderPlan')).toBe(keys.indexOf('charging') + 1);
    expect(keys[keys.length - 1]).toBe('review');
  });

  it('every draft field belongs to exactly one step and nothing asks for QC results', () => {
    const seen = new Map<string, string>();
    for (const s of BUILD_STEPS) {
      for (const f of s.fields) {
        expect(seen.has(f), `${f} is on both ${seen.get(f)} and ${s.key}`).toBe(false);
        seen.set(f, s.key);
      }
    }
    expect([...seen.keys()].sort()).toEqual(Object.keys(emptyDraft()).sort());
    expect([...seen.keys()]).not.toContain('muzzleVelocity');
    expect([...seen.keys()]).not.toContain('runout');
  });

  it('the review step collects nothing itself — the form does', () => {
    expect(step('batch', 'review').fields).toEqual([]);
  });
});

describe('draft state', () => {
  it('starts with the acknowledgement off and the velocity ladder defaults', () => {
    const d = emptyDraft({ rifleId: 'r1', cartridge: '6.5 Creedmoor' });
    expect(d.rifleId).toBe('r1');
    expect(d.cartridge).toBe('6.5 Creedmoor');
    expect(d.chargeAcknowledged).toBe(false);
    expect(d.ladderMethod).toBe('velocity');
    expect(d.stepCount).toBe(10);
    expect(d.incrementGr).toBe(0.3);
  });

  it('picking batch vs ladder alone is not dirty; any real entry is', () => {
    const seed = emptyDraft();
    expect(isDraftDirty({ ...seed, stringType: 'ladder' }, seed)).toBe(false);
    expect(isDraftDirty({ ...seed, primer: 'CCI BR-2' }, seed)).toBe(true);
    expect(isDraftDirty({ ...seed, chargeAcknowledged: true }, seed)).toBe(true);
  });

  it('an optional step reads as filled once any of its fields moves', () => {
    const d = emptyDraft();
    const brass = step('batch', 'brass');
    expect(isStepFilled(d, brass)).toBe(false);
    expect(isStepFilled({ ...d, annealed: 'Yes' }, brass)).toBe(true);
    expect(isStepFilled({ ...d, primer: 'x' }, brass)).toBe(false);
  });
});

describe('gates', () => {
  it('the rifle step needs a rifle', () => {
    const s = step('batch', 'rifle');
    expect(canAdvance(emptyDraft(), s)).toBe(false);
    expect(canAdvance(emptyDraft({ rifleId: 'r1' }), s)).toBe(true);
  });

  it('the charge step needs a positive charge AND the acknowledgement', () => {
    const s = step('batch', 'charging');
    expect(canAdvance(draftWith({ chargeGr: '41.5' }), s)).toBe(false);
    expect(canAdvance(draftWith({ chargeAcknowledged: true }), s)).toBe(false);
    expect(canAdvance(draftWith({ chargeGr: '0', chargeAcknowledged: true }), s)).toBe(false);
    expect(canAdvance(draftWith({ chargeGr: '41,5', chargeAcknowledged: true }), s)).toBe(true);
    expect(CHARGE_ACK_TEXT).toMatch(/published load data/);
    expect(CHARGE_ACK_TEXT).not.toMatch(/\d/);
  });

  it('the batch size must be a whole number of at least 1', () => {
    const s = step('batch', 'batchCount');
    expect(canAdvance(draftWith({ roundsLoaded: '' }), s)).toBe(false);
    expect(canAdvance(draftWith({ roundsLoaded: '0' }), s)).toBe(false);
    expect(canAdvance(draftWith({ roundsLoaded: '2.5' }), s)).toBe(false);
    expect(canAdvance(draftWith({ roundsLoaded: '20' }), s)).toBe(true);
    expect(validateStep(draftWith({ roundsLoaded: '2.5' }), s).roundsLoaded).toMatch(/whole number/);
  });

  it('the ladder plan needs a series, which needs a starting charge', () => {
    const s = step('ladder', 'ladderPlan');
    expect(canAdvance(draftWith({ stringType: 'ladder' }), s)).toBe(false);
    expect(canAdvance(draftWith({ stringType: 'ladder', chargeGr: '40' }), s)).toBe(true);
  });

  it('other steps never block Next; they report parse errors instead', () => {
    const s = step('batch', 'bullet');
    expect(canAdvance(draftWith({ bcValue: 'abc' }), s)).toBe(true);
    expect(validateStep(draftWith({ bcValue: 'abc' }), s)).toEqual({
      bcValue: 'Enter a number like 41.5',
    });
  });
});

describe('validateStep', () => {
  it('applies the same physical-dimension rules as the full form, per step', () => {
    const d = draftWith({
      bcValue: '0',
      bulletLength: '-1',
      caseTrimLength: '0',
      bushingSize: '0',
      shoulderBump: '-0.001',
      neckTension: '0',
      jumpToLands: '-0.010', // a jam: signed, allowed
      chargeVariance: '-0.1',
    });
    expect(validateStep(d, step('batch', 'bullet'))).toEqual({
      bcValue: 'BC must be greater than 0.',
      bulletLength: 'Length must be greater than 0.',
    });
    expect(validateStep(d, step('batch', 'brass'))).toEqual({
      caseTrimLength: 'Trim length must be greater than 0.',
    });
    expect(validateStep(d, step('batch', 'sizing'))).toEqual({
      bushingSize: 'Bushing size must be greater than 0.',
      shoulderBump: "Shoulder bump can't be negative.",
    });
    expect(validateStep(d, step('batch', 'seating'))).toEqual({
      neckTension: 'Neck tension must be greater than 0.',
    });
    expect(validateStep(d, step('batch', 'charging'))).toEqual({
      chargeVariance: "Charge tolerance can't be negative.",
    });
  });
});

describe('ladderPlan', () => {
  it('matches the workup series generator and the method defaults', () => {
    const d = draftWith({
      stringType: 'ladder',
      chargeGr: '40.0',
      ladderMethod: 'ocw',
      incrementGr: 0.3,
      stepCount: 7,
    });
    const plan = ladderPlan(d);
    expect(plan.startChargeGr).toBe(40);
    expect(plan.series).toEqual(
      generateChargeSeries({ startChargeGr: 40, incrementGr: 0.3, stepCount: 7 }),
    );
    expect(plan.shotsPerCharge).toBe(DEFAULT_SHOTS_PER_CHARGE.ocw);
    expect(plan.rounds).toBe(21);
  });

  it('is empty without a starting charge', () => {
    expect(ladderPlan(draftWith({ stringType: 'ladder' }))).toMatchObject({
      startChargeGr: null,
      series: [],
      rounds: 0,
    });
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

  it('copes with partial drafts and keeps IMR', () => {
    expect(suggestLoadName(draftWith({ bulletMake: 'Berger', bulletWeight: '105' }))).toBe(
      '105 Berger',
    );
    expect(suggestLoadName(emptyDraft())).toBe('');
    expect(shortPowderName('IMR 4064')).toBe('IMR 4064');
    expect(shortPowderName('Alliant Reloder 16')).toBe('Reloder 16');
  });
});

describe('draftToPrefill', () => {
  it('emits only what the walkthrough asked, parsed, with the batch size for a batch', () => {
    const d = draftWith({
      stringType: 'batch',
      rifleId: 'r1',
      cartridge: ' 6.5 Creedmoor ',
      bulletModel: 'ELD-M',
      bulletWeight: '140',
      powderName: 'H4350',
      chargeGr: '41,5',
      chargeAcknowledged: true,
      brassFirings: '2.6',
      annealed: 'Yes',
      sizingDieType: 'Full-length',
      jumpToLands: '-0.010',
      roundsLoaded: '20',
    });
    const p = draftToPrefill(d);
    expect(p.name).toBe('140 ELD-M / H4350 41,5');
    expect(p.cartridge).toBe('6.5 Creedmoor');
    expect(p.rifleId).toBe('r1');
    expect(p.version).toMatchObject({
      bulletModel: 'ELD-M',
      bulletWeightGr: 140,
      chargeGr: 41.5,
      brassFirings: 3,
      caseAnnealed: true,
      caseNeckTurned: false,
      sizingDieType: 'full-length',
      jumpToLandsIn: -0.01,
    });
    // Never asked by the walkthrough — left for the form's defaults.
    expect(p.version).not.toHaveProperty('muzzleVelocityFps');
    expect(p.version).not.toHaveProperty('runoutIn');
    // The acknowledgement is a gate, not data.
    expect(p.version).not.toHaveProperty('chargeAcknowledged');
  });

  it('no string type carries the batch size onto the recipe — it opens a batch-log row', () => {
    for (const stringType of ['ladder', 'batch'] as const) {
      const p = draftToPrefill(draftWith({ stringType, roundsLoaded: '20' }));
      expect(p.version).not.toHaveProperty('roundsLoaded');
    }
  });

  it('prefillAsVersion lets the recipe helpers see which stages are filled', () => {
    const v = prefillAsVersion(draftToPrefill(draftWith({ shoulderBump: '0.002', cbto: '2.23' })));
    expect(v).toBeDefined();
    expect([...filledStageKeys(v)]).toEqual(['sizing', 'seating']);
    expect(prefillAsVersion(undefined)).toBeUndefined();
  });
});
