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
  ...over,
});

describe('rangeCardHtml', () => {
  const base = {
    rifleName: 'Test',
    loadLabel: '140 ELD-M',
    preset: 'bench' as const,
    turretUnit: 'MIL' as const,
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

  it('handles a null BC gracefully', () => {
    const html = rangeCardHtml({ ...base, bcValue: null, bcModel: null, rows: [row({})] });
    expect(html).toContain('—');
    expect(() => rangeCardHtml({ ...base, bcValue: null, bcModel: null, rows: [row({})] })).not.toThrow();
  });
});
