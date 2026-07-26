import { describe, expect, it } from 'vitest';
import { rangeCardHtml } from '@/lib/rangecard/pdfHtml';
import { CardRow } from '@/lib/rangecard/merge';

const row = (over: Partial<CardRow>): CardRow => ({
  distanceYd: 100,
  elevation: 0,
  confirmed: false,
  predictedElevation: 0,
  wind10Mph: 0.1,
  wind5Mph: 0.05,
  velocityFps: 2600,
  energyFtLb: 2100,
  dropIn: 0,
  tofS: 0.1,
  mach: 2.3,
  driftIn: 0,
  driftMil: 0,
  driftMoa: 0,
  aeroJumpIn: 0,
  ...over,
});

describe('rangeCardHtml', () => {
  const base = {
    rifleName: 'Test',
    loadLabel: '140 ELD-M',
    preset: 'bench' as const,
    turretUnit: 'MIL' as const,
    holdUnit: 'MIL' as const,
    distanceUnit: 'yd' as const,
    mvFps: 2710,
    bcValue: 0.326,
    bcModel: 'G7',
    zeroLabel: '100 yd',
    generatedOn: new Date('2026-01-01T00:00:00Z'),
  };

  it('renders velocity and BC on every row', () => {
    const html = rangeCardHtml({
      ...base,
      rows: [row({ distanceYd: 100, velocityFps: 2600 }), row({ distanceYd: 600, velocityFps: 1930 })],
    });
    // velocity present per row
    expect(html).toContain('>2600<');
    expect(html).toContain('>1930<');
    // BC present per row (0.326 -> 0.326) at least twice + once in the meta line
    const bcCount = (html.match(/0\.326/g) ?? []).length;
    expect(bcCount).toBeGreaterThanOrEqual(3);
    // header columns
    expect(html).toContain('>fps<');
    expect(html).toContain('>BC<');
  });

  it('shows BC in the meta header with its model', () => {
    const html = rangeCardHtml({ ...base, rows: [row({})] });
    expect(html).toMatch(/BC 0\.326 G7/);
  });

  it('converts holds to the chosen mil-dot display unit', () => {
    // MOA-turret rifle, hold of 10 MOA at 600; displayed in MIL should be ~2.9.
    const html = rangeCardHtml({
      ...base,
      turretUnit: 'MOA',
      holdUnit: 'MIL',
      rows: [row({ distanceYd: 600, elevation: 10 })],
    });
    expect(html).toContain('>Elev MIL<');
    expect(html).toContain('>2.9<'); // 10 MOA -> 2.909 MIL, formatted to 1 dp
  });

  it('handles a null BC gracefully', () => {
    const html = rangeCardHtml({ ...base, bcValue: null, bcModel: null, rows: [row({})] });
    expect(html).toContain('—');
    expect(() => rangeCardHtml({ ...base, bcValue: null, bcModel: null, rows: [row({})] })).not.toThrow();
  });

  it('omits the drift column when no row has meaningful drift', () => {
    const html = rangeCardHtml({
      ...base,
      rows: [row({}), row({ distanceYd: 200, driftIn: 0.04, driftMil: 0.006, driftMoa: 0.02 })],
    });
    expect(html).not.toContain('>Drift<');
    expect(html).not.toContain('&nbsp;L');
    expect(html).not.toContain('&nbsp;R');
  });

  it('adds a drift column with the hold direction when drift is meaningful', () => {
    // driftIn > 0 = impact drifts RIGHT → hold LEFT ('L'); negative → 'R'.
    const html = rangeCardHtml({
      ...base,
      rows: [
        row({ distanceYd: 600, driftIn: 2.1, driftMil: 0.1, driftMoa: 0.34 }),
        row({ distanceYd: 700, driftIn: -3.0, driftMil: -0.12, driftMoa: -0.41 }),
      ],
    });
    expect(html).toContain('>Drift<');
    expect(html).toContain('0.1&nbsp;L');
    expect(html).toContain('0.1&nbsp;R'); // |−0.12| MIL formatted to 1 dp
    expect(html).toContain('drift L/R = hold direction');
  });

  it('drift column uses MOA values when displaying in MOA', () => {
    const html = rangeCardHtml({
      ...base,
      turretUnit: 'MOA',
      holdUnit: 'MOA',
      rows: [row({ distanceYd: 600, driftIn: 2.1, driftMil: 0.1, driftMoa: 0.34 })],
    });
    expect(html).toContain('0.34&nbsp;L');
  });

  it('lists active advanced effects in the meta block', () => {
    const html = rangeCardHtml({
      ...base,
      rows: [row({})],
      advanced: {
        spinDrift: true,
        coriolis: { latitudeDeg: 33, azimuthDeg: 270 },
        inclineDeg: 5,
        mvTempAdjusted: true,
      },
    });
    expect(html).toContain('spin drift · coriolis lat 33 az 270 · incline +5° · temp-adj MV');
  });

  it('omits the effects note when nothing advanced is active', () => {
    const html = rangeCardHtml({
      ...base,
      rows: [row({})],
      advanced: { spinDrift: false, coriolis: null, inclineDeg: null, mvTempAdjusted: false },
    });
    expect(html).not.toContain('spin drift');
    expect(html).not.toContain('temp-adj MV');
  });
});
