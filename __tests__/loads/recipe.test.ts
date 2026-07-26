import { describe, expect, it } from 'vitest';
import type { LoadVersion } from '@/db/schema';
import {
  filledStageKeys,
  fromYesNo,
  ingredientRows,
  recipeRows,
  recipeStages,
  sizingDieTypeLabel,
  sizingDieTypeToChoice,
  sizingDieTypeToStored,
  STAGE_ORDER,
  toYesNo,
} from '@/features/loads/recipe';

// Every recipe field is nullable, so a version fixture is just the fields under
// test — the helpers must tolerate everything else being absent.
const version = (over: Partial<LoadVersion> = {}): LoadVersion => ({ ...over }) as LoadVersion;

const valueOf = (rows: { label: string; value: string }[], label: string) =>
  rows.find((r) => r.label === label)?.value;

describe('ingredientRows', () => {
  it('drops every unset row', () => {
    expect(ingredientRows(version())).toEqual([]);
  });

  it('joins bullet make/model/weight and pairs charge with powder', () => {
    const rows = ingredientRows(
      version({
        bulletMake: 'Hornady',
        bulletModel: 'ELD-M',
        bulletWeightGr: 140,
        bcValue: 0.326,
        bcModel: 'G7',
        powderName: 'H4350',
        chargeGr: 41.5,
        brass: 'Lapua',
        brassFirings: 3,
        caseLotNumber: 'Lot 4823',
      }),
    );
    expect(valueOf(rows, 'Bullet')).toBe('Hornady ELD-M 140gr');
    expect(valueOf(rows, 'BC')).toBe('0.326 G7');
    expect(valueOf(rows, 'Powder')).toBe('41.5gr H4350');
    expect(valueOf(rows, 'Brass')).toBe('Lapua (3x fired)');
    expect(valueOf(rows, 'Case lot')).toBe('Lot 4823');
  });
});

describe('recipeStages', () => {
  it('returns nothing for an empty version or no version at all', () => {
    expect(recipeStages(version())).toEqual([]);
    expect(recipeStages(undefined)).toEqual([]);
    expect(recipeStages(null)).toEqual([]);
  });

  it('keeps only stages that hold data, in loading order', () => {
    const stages = recipeStages(
      version({ runoutIn: 0.001, caseWeightGr: 155.2, seatingDie: 'Redding Competition' }),
    );
    expect(stages.map((s) => s.key)).toEqual(['casePrep', 'seating', 'qc']);
    const order = stages.map((s) => STAGE_ORDER.indexOf(s.key));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('numbers stage titles so they read as a procedure', () => {
    const [stage] = recipeStages(version({ caseWeightGr: 155.2 }));
    expect(stage!.title).toBe('1 · Case prep');
  });

  it('only shows a boolean when it is on', () => {
    expect(recipeStages(version({ caseNeckTurned: false, flashHoleDeburred: false }))).toEqual([]);
    const [stage] = recipeStages(version({ caseNeckTurned: true, primerPocketUniformed: true }));
    expect(valueOf(stage!.rows, 'Neck turned')).toBe('Yes');
    expect(valueOf(stage!.rows, 'Primer pocket')).toBe('Uniformed');
  });

  it('folds the anneal method into the annealed row', () => {
    const [annealed] = recipeStages(version({ caseAnnealed: true, annealMethod: 'AMP mode 62' }));
    expect(valueOf(annealed!.rows, 'Annealed')).toBe('AMP mode 62');
    const [flagOnly] = recipeStages(version({ caseAnnealed: true }));
    expect(valueOf(flagOnly!.rows, 'Annealed')).toBe('Yes');
  });

  it('combines the sizing die with how it sizes', () => {
    const [full] = recipeStages(version({ sizingDie: 'Redding Type S', sizingDieType: 'full-length' }));
    expect(valueOf(full!.rows, 'Sizing die')).toBe('Redding Type S (Full-length)');
    const [dieOnly] = recipeStages(version({ sizingDie: 'Redding Type S' }));
    expect(valueOf(dieOnly!.rows, 'Sizing die')).toBe('Redding Type S');
    const [typeOnly] = recipeStages(version({ sizingDieType: 'neck' }));
    expect(valueOf(typeOnly!.rows, 'Sizing die')).toBe('Neck');
  });

  it('spells out a negative jump as a jam', () => {
    const [jam] = recipeStages(version({ jumpToLandsIn: -0.015 }));
    expect(valueOf(jam!.rows, 'Jump to lands')).toBe('0.015" jam');
    const [jump] = recipeStages(version({ jumpToLandsIn: 0.02 }));
    expect(valueOf(jump!.rows, 'Jump to lands')).toBe('0.02"');
  });

  it('keeps zero-valued measurements (0.000" runout is a result, not a blank)', () => {
    const [qc] = recipeStages(version({ runoutIn: 0 }));
    expect(valueOf(qc!.rows, 'Runout (TIR)')).toBe('0"');
  });

  it('carries free text as note blocks, not label/value rows', () => {
    const [casePrep] = recipeStages(version({ casePrepNotes: 'Chamfered inside and out' }));
    expect(casePrep!.rows).toEqual([]);
    expect(casePrep!.notes).toEqual([
      { label: 'Prep notes', text: 'Chamfered inside and out' },
    ]);
    const [qc] = recipeStages(version({ notes: 'Shot the 1000yd match with this' }));
    expect(qc!.key).toBe('qc');
    expect(qc!.notes.map((n) => n.label)).toEqual(['Notes']);
  });

  it('ignores whitespace-only text', () => {
    expect(recipeStages(version({ lubeMethod: '   ', assemblyNotes: '\n' }))).toEqual([]);
  });
});

describe('filledStageKeys', () => {
  it('reports which stages an existing load already documents', () => {
    const keys = filledStageKeys(version({ powderLotNumber: 'Lot 8021', bushingSizeIn: 0.289 }));
    expect([...keys].sort()).toEqual(['charging', 'sizing']);
    expect(filledStageKeys(undefined).size).toBe(0);
  });
});

describe('recipeRows (version-history summary)', () => {
  it('stays a flat ingredients-plus-key-dimensions list', () => {
    const rows = recipeRows(
      version({ brass: 'Lapua', cbtoIn: 2.235, muzzleVelocityFps: 2810, runoutIn: 0.001 }),
    );
    expect(rows.map((r) => r.label)).toEqual(['Brass', 'CBTO', 'Avg MV']);
    expect(valueOf(rows, 'CBTO')).toBe('2.235"');
    expect(valueOf(rows, 'Avg MV')).toBe('2810 fps');
  });
});

describe('sizing die type mapping', () => {
  it('round-trips every choice through storage', () => {
    for (const choice of ['—', 'Full-length', 'Neck', 'Body'] as const) {
      expect(sizingDieTypeToChoice(sizingDieTypeToStored(choice))).toBe(choice);
    }
  });

  it('stores the dash choice as null', () => {
    expect(sizingDieTypeToStored('—')).toBeNull();
    expect(sizingDieTypeToStored('Full-length')).toBe('full-length');
  });

  it('falls back to the dash for unknown or missing free text', () => {
    expect(sizingDieTypeToChoice(null)).toBe('—');
    expect(sizingDieTypeToChoice(undefined)).toBe('—');
    expect(sizingDieTypeToChoice('shoulder bump only')).toBe('—');
  });

  it('labels stored text for display and passes unknown text through', () => {
    expect(sizingDieTypeLabel('BODY')).toBe('Body');
    expect(sizingDieTypeLabel('bushing neck-ish')).toBe('bushing neck-ish');
    expect(sizingDieTypeLabel(null)).toBeNull();
  });
});

describe('yes/no mapping', () => {
  it('treats null and undefined as No', () => {
    expect(toYesNo(null)).toBe('No');
    expect(toYesNo(undefined)).toBe('No');
    expect(toYesNo(false)).toBe('No');
    expect(toYesNo(true)).toBe('Yes');
  });

  it('round-trips', () => {
    expect(fromYesNo(toYesNo(true))).toBe(true);
    expect(fromYesNo(toYesNo(false))).toBe(false);
  });
});
