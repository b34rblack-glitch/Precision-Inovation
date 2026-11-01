import { describe, expect, it } from 'vitest';
import type { LandsMeasurement, LoadVersion, Rifle } from '@/db/schema';
import { benchTargets, recipeSheetHtml, rifleFacts } from '@/lib/loads/recipeSheet';

const version = (o: Partial<LoadVersion> = {}): LoadVersion =>
  ({ versionNumber: 2, createdAt: new Date('2026-10-29T12:00:00Z'), ...o }) as LoadVersion;
const rifle = (o: Partial<Rifle> = {}): Rifle =>
  ({ name: 'MPR .300 PRC', barrelLengthIn: 26, twistRate: '1:8', ...o }) as Rifle;
const lands = (o: Partial<LandsMeasurement> = {}): LandsMeasurement =>
  ({ bulletMake: 'Hornady', bulletModel: 'ELD-X', bulletWeightGr: 212, cbtoIn: 2.931, measuredAt: new Date('2026-10-29'), ...o }) as LandsMeasurement;

const full = version({
  bulletMake: 'Hornady',
  bulletModel: 'ELD-X',
  bulletWeightGr: 212,
  bcValue: 0.336,
  bcModel: 'G7',
  powderName: 'H1000',
  chargeGr: 76.5,
  primer: 'Fed 215M',
  brass: 'Hornady',
  cbtoIn: 2.911,
  coalIn: 3.61,
  shoulderBumpIn: 0.002,
  neckTensionIn: 0.002,
  caseTrimLengthIn: 2.57,
  sizingDie: 'Hornady Match Grade',
  assemblyNotes: 'Seat in two steps <carefully>',
});

describe('benchTargets', () => {
  it('lists the numbers to hit, deriving jump and sized headspace from the rifle', () => {
    const t = benchTargets({
      load: { name: 'L', cartridge: '.300 PRC' },
      version: full,
      rifle: rifle({ headspaceIn: 1.6185, headspaceInsert: 'Hornady .420' }),
      lands: [lands()],
      generatedOn: new Date(),
    });
    expect(t).toEqual([
      { label: 'Charge', value: '76.5 gr H1000' },
      { label: 'CBTO', value: '2.911"' },
      { label: 'COAL', value: '3.61"' },
      { label: 'Jump (from lands)', value: '0.02"' },
      { label: 'Sized case reads', value: '1.6165" (Hornady .420)' },
      { label: 'Neck tension', value: '0.002"' },
      { label: 'Trim to', value: '2.57"' },
    ]);
  });

  it('prefers the recorded jump, reports a jam, and falls back to the bump alone', () => {
    const t = benchTargets({
      load: { name: 'L', cartridge: null },
      version: version({ jumpToLandsIn: -0.005, shoulderBumpIn: 0.0015 }),
      rifle: null,
      lands: [],
      generatedOn: new Date(),
    });
    expect(t).toEqual([
      { label: 'Jump', value: '0.005" jam' },
      { label: 'Shoulder bump', value: '0.0015"' },
    ]);
  });

  it('offers the seating depth when only the jump and the lands reading are known', () => {
    const t = benchTargets({
      load: { name: 'L', cartridge: null },
      version: version({ bulletMake: 'Hornady', bulletModel: 'ELD-X', bulletWeightGr: 212, jumpToLandsIn: 0.02 }),
      rifle: rifle(),
      lands: [lands()],
      generatedOn: new Date(),
    });
    expect(t).toEqual([
      { label: 'Jump', value: '0.02"' },
      { label: 'Seat to (from lands)', value: '2.911"' },
    ]);
  });
});

describe('rifleFacts', () => {
  it('is empty without a rifle and lists what bears on the build with one', () => {
    expect(rifleFacts({ load: { name: 'L', cartridge: null }, version: full, rifle: null, lands: [], generatedOn: new Date() })).toEqual([]);
    const f = rifleFacts({
      load: { name: 'L', cartridge: null },
      version: full,
      rifle: rifle({ chamberSpec: 'SAAMI', magazineMaxCoalIn: 3.7 }),
      lands: [lands({ comparatorInsert: '#30', roundCount: 120 })],
      generatedOn: new Date(),
    });
    expect(f.map((x) => x.label)).toEqual(['Rifle', 'Barrel', 'Chamber', 'Touches lands at', 'Magazine max COAL']);
    expect(f.find((x) => x.label === 'Touches lands at')?.value).toMatch(/^2\.931" CBTO \(#30\), .*, 120 rds$/);
  });
});

describe('recipeSheetHtml', () => {
  const html = recipeSheetHtml({
    load: { name: 'ELD-X <212> "match"', cartridge: '.300 PRC' },
    version: full,
    rifle: rifle(),
    lands: [lands()],
    generatedOn: new Date('2026-11-01T00:00:00Z'),
  });

  it('is a complete page with the name, version, targets, every stage and a batch log', () => {
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('ELD-X &lt;212&gt; &quot;match&quot;');
    expect(html).toContain('Recipe v2 as of');
    expect(html).toContain('Bench targets');
    expect(html).toContain('2 · Sizing &amp; dies');
    expect(html).toContain('5 · Seating');
    expect(html).toContain('Batch log');
    expect((html.match(/☐/g) ?? []).length).toBeGreaterThan(3);
  });

  it('escapes free text from the recipe', () => {
    expect(html).toContain('Seat in two steps &lt;carefully&gt;');
    expect(html).not.toContain('<carefully>');
  });

  it('copes with an empty recipe', () => {
    const empty = recipeSheetHtml({ load: { name: 'Blank', cartridge: null }, version: version(), rifle: null, lands: [], generatedOn: new Date() });
    expect(empty).toContain('No seating or charge targets recorded yet.');
    expect(empty).toContain('No components recorded yet.');
    expect(empty).toContain('No process detail recorded.');
  });
});
