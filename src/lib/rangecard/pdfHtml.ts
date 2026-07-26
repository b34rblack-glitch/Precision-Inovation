import { CardRow } from './merge';
import { CardPreset } from './presets';
import { DistanceUnit, formatHold, holdToUnit, TurretUnit, ydToDistance } from '@/lib/units';

// Printable range card: monochrome, high contrast, sized for a stock pack or
// wallet. Confirmed holds print bold with a filled marker so they read at a
// glance; predictions are lighter.

export type PdfCardParams = {
  rifleName: string;
  loadLabel: string;
  preset: CardPreset;
  /** Unit the stored holds are in (the rifle's turret unit). */
  turretUnit: TurretUnit;
  /** Unit to DISPLAY holds in (MIL for mil-dot holdovers). */
  holdUnit: TurretUnit;
  distanceUnit: DistanceUnit;
  mvFps: number;
  bcValue: number | null;
  bcModel: string | null;
  zeroLabel: string;
  rows: CardRow[];
  generatedOn: Date;
  /** Active advanced effects, listed as a meta note. Omitted = all off. */
  advanced?: {
    spinDrift: boolean;
    coriolis: { latitudeDeg: number; azimuthDeg: number } | null;
    inclineDeg: number | null;
    mvTempAdjusted: boolean;
  };
};

/** DRIFT prints only when it would actually move an impact (> 0.05 in somewhere). */
const DRIFT_MIN_IN = 0.05;

export function rangeCardHtml(p: PdfCardParams): string {
  const bcText = p.bcValue != null ? p.bcValue.toFixed(3) : '—';
  const h = (v: number) => formatHold(holdToUnit(v, p.turretUnit, p.holdUnit), p.holdUnit);
  const driftActive = p.rows.some((r) => Math.abs(r.driftIn) > DRIFT_MIN_IN);
  // DRIFT prints the HOLD for spin + Coriolis: driftIn > 0 = impact drifts
  // RIGHT → hold LEFT ('L'); negative drifts left → hold RIGHT ('R').
  // driftMil/driftMoa already carry both units, so no turret-unit conversion.
  const driftCell = (r: CardRow) =>
    `${formatHold(Math.abs(p.holdUnit === 'MIL' ? r.driftMil : r.driftMoa), p.holdUnit)}&nbsp;${
      r.driftIn > 0 ? 'L' : 'R'
    }`;
  const rowsHtml = p.rows
    .map((r) => {
      const dist = Math.round(ydToDistance(r.distanceYd, p.distanceUnit));
      const cls = r.confirmed ? 'conf' : 'pred';
      const marker = r.confirmed ? '●' : '○';
      return `<tr class="${cls}">
        <td class="dist">${dist}</td>
        <td class="hold">${h(r.elevation)}</td>
        <td>${h(r.wind5Mph)}</td>
        <td>${h(r.wind10Mph)}</td>${driftActive ? `\n        <td>${driftCell(r)}</td>` : ''}
        <td>${Math.round(r.velocityFps)}</td>
        <td>${r.energyFtLb != null ? Math.round(r.energyFtLb) : '—'}</td>
        <td>${bcText}</td>
        <td class="marker">${marker}</td>
      </tr>`;
    })
    .join('\n');

  const effects: string[] = [];
  if (p.advanced?.spinDrift) effects.push('spin drift');
  if (p.advanced?.coriolis)
    effects.push(
      `coriolis lat ${p.advanced.coriolis.latitudeDeg} az ${p.advanced.coriolis.azimuthDeg}`,
    );
  if (p.advanced?.inclineDeg != null)
    effects.push(`incline ${p.advanced.inclineDeg >= 0 ? '+' : ''}${p.advanced.inclineDeg}°`);
  if (p.advanced?.mvTempAdjusted) effects.push('temp-adj MV');
  const effectsHtml =
    effects.length > 0 ? `\n    <div class="meta">${effects.join(' · ')}</div>` : '';

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  @page { size: 4in 6in; margin: 0.18in; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #000; }
  .head { border-bottom: 2px solid #000; padding-bottom: 4px; margin-bottom: 6px; }
  .rifle { font-size: 13px; font-weight: 800; letter-spacing: 0.02em; }
  .load { font-size: 10px; margin-top: 1px; }
  .meta { font-size: 8px; color: #333; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; }
  th { font-size: 8px; text-transform: uppercase; letter-spacing: 0.06em;
       border-bottom: 1.5px solid #000; padding: 2px 3px; text-align: right; }
  th:first-child { text-align: left; }
  td { font-size: 11px; padding: 2.5px 3px; text-align: right;
       border-bottom: 0.5px solid #bbb; font-variant-numeric: tabular-nums; }
  td.dist { text-align: left; font-weight: 700; }
  tr.conf td.hold { font-weight: 800; }
  tr.pred td { color: #444; }
  td.marker { font-size: 8px; }
  .legend { font-size: 7.5px; color: #333; margin-top: 5px; }
</style>
</head>
<body>
  <div class="head">
    <div class="rifle">${escapeHtml(p.rifleName)}</div>
    <div class="load">${escapeHtml(p.loadLabel)}</div>
    <div class="meta">MV ${Math.round(p.mvFps)} fps · BC ${bcText} ${escapeHtml(
      p.bcModel ?? '',
    )} · zero ${escapeHtml(p.zeroLabel)} · ${
      p.preset === 'bench' ? 'BENCH' : 'HUNTING'
    } · ${p.generatedOn.toLocaleDateString()}</div>${effectsHtml}
  </div>
  <table>
    <thead>
      <tr>
        <th>${p.distanceUnit}</th>
        <th>Elev ${p.holdUnit}</th>
        <th>W5</th>
        <th>W10</th>${driftActive ? '\n        <th>Drift</th>' : ''}
        <th>fps</th>
        <th>ft·lb</th>
        <th>BC</th>
        <th></th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>
  <div class="legend">● confirmed on target &nbsp; ○ predicted · wind holds full-value at 5 / 10 mph${
    driftActive ? ' · drift L/R = hold direction (spin + Coriolis)' : ''
  }</div>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
