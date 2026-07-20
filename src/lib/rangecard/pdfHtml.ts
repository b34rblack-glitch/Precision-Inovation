import { CardRow } from './merge';
import { CardPreset } from './presets';
import { DistanceUnit, formatHold, TurretUnit, ydToDistance } from '@/lib/units';

// Printable range card: monochrome, high contrast, sized for a stock pack or
// wallet. Confirmed holds print bold with a filled marker so they read at a
// glance; predictions are lighter.

export type PdfCardParams = {
  rifleName: string;
  loadLabel: string;
  preset: CardPreset;
  turretUnit: TurretUnit;
  distanceUnit: DistanceUnit;
  mvFps: number;
  zeroLabel: string;
  rows: CardRow[];
  generatedOn: Date;
};

export function rangeCardHtml(p: PdfCardParams): string {
  const showVelocity = p.preset === 'bench';
  const rowsHtml = p.rows
    .map((r) => {
      const dist = Math.round(ydToDistance(r.distanceYd, p.distanceUnit));
      const cls = r.confirmed ? 'conf' : 'pred';
      const marker = r.confirmed ? '●' : '○';
      return `<tr class="${cls}">
        <td class="dist">${dist}</td>
        <td class="hold">${formatHold(r.elevation, p.turretUnit)}</td>
        <td>${formatHold(r.wind5Mph, p.turretUnit)}</td>
        <td>${formatHold(r.wind10Mph, p.turretUnit)}</td>
        ${showVelocity ? `<td>${Math.round(r.velocityFps)}</td>` : ''}
        ${!showVelocity ? `<td>${r.energyFtLb != null ? Math.round(r.energyFtLb) : '—'}</td>` : ''}
        <td class="marker">${marker}</td>
      </tr>`;
    })
    .join('\n');

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
    <div class="meta">MV ${Math.round(p.mvFps)} fps · zero ${escapeHtml(p.zeroLabel)} · ${
      p.preset === 'bench' ? 'BENCH' : 'HUNTING'
    } · ${p.generatedOn.toLocaleDateString()}</div>
  </div>
  <table>
    <thead>
      <tr>
        <th>${p.distanceUnit}</th>
        <th>Elev ${p.turretUnit}</th>
        <th>W5</th>
        <th>W10</th>
        ${showVelocity ? '<th>fps</th>' : '<th>ft·lb</th>'}
        <th></th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>
  <div class="legend">● confirmed on target &nbsp; ○ predicted · wind holds full-value at 5 / 10 mph</div>
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
