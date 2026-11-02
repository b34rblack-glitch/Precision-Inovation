import type { LandsMeasurement, Load, LoadBatch, LoadVersion, Rifle } from '@/db/schema';
import { batchSummary } from '@/lib/batches/model';
import { ingredientRows, recipeStages, type RecipeStage } from '@/features/loads/recipe';
import { cbtoForJump, jumpFromTouch, latestLandsForBullet, sizedHeadspace } from '@/lib/rifle/profile';

// Printable recipe sheet for one load version: everything needed to build the
// load at the bench without the phone. Monochrome, Letter/A4, one or two
// pages. Pure: the screen hands in rows and shares the PDF expo-print makes.

export type RecipeSheetParams = {
  load: Pick<Load, 'name' | 'cartridge'>;
  version: LoadVersion;
  rifle: Rifle | null;
  /** The rifle's lands log; the newest reading for this bullet is used. */
  lands: readonly LandsMeasurement[];
  /** Batches already loaded from this recipe, printed before the blank rows. */
  batches?: readonly LoadBatch[];
  generatedOn: Date;
};

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const e = escapeHtml;
const inches = (n: number | null | undefined) => (n == null ? null : `${n}"`);

/** The numbers to hit at the bench, in one box at the top of the sheet. */
export function benchTargets(p: RecipeSheetParams): { label: string; value: string }[] {
  const v = p.version;
  const out: { label: string; value: string | null }[] = [];
  out.push({ label: 'Charge', value: v.chargeGr != null ? `${v.chargeGr} gr${v.powderName ? ` ${v.powderName}` : ''}` : null });
  out.push({ label: 'CBTO', value: inches(v.cbtoIn) });
  out.push({ label: 'COAL', value: inches(v.coalIn) });
  const touch = p.rifle
    ? latestLandsForBullet(p.lands, { make: v.bulletMake, model: v.bulletModel, weightGr: v.bulletWeightGr })
    : null;
  if (v.jumpToLandsIn != null) {
    out.push({ label: 'Jump', value: v.jumpToLandsIn < 0 ? `${Math.abs(v.jumpToLandsIn)}" jam` : `${v.jumpToLandsIn}"` });
  } else if (touch && v.cbtoIn != null) {
    const j = jumpFromTouch(touch.cbtoIn, v.cbtoIn);
    out.push({ label: 'Jump (from lands)', value: j < 0 ? `${Math.abs(j)}" jam` : `${j}"` });
  }
  if (touch && v.cbtoIn == null && v.jumpToLandsIn != null) {
    out.push({ label: 'Seat to (from lands)', value: `${cbtoForJump(touch.cbtoIn, v.jumpToLandsIn)}"` });
  }
  if (p.rifle?.headspaceIn != null && v.shoulderBumpIn != null) {
    out.push({
      label: 'Sized case reads',
      value: `${sizedHeadspace(p.rifle.headspaceIn, v.shoulderBumpIn)}"${p.rifle.headspaceInsert ? ` (${p.rifle.headspaceInsert})` : ''}`,
    });
  } else if (v.shoulderBumpIn != null) {
    out.push({ label: 'Shoulder bump', value: `${v.shoulderBumpIn}"` });
  }
  out.push({ label: 'Neck tension', value: inches(v.neckTensionIn) });
  out.push({ label: 'Trim to', value: inches(v.caseTrimLengthIn) });
  return out.filter((t): t is { label: string; value: string } => t.value != null);
}

/** Facts about the rifle that bear on building the load. */
export function rifleFacts(p: RecipeSheetParams): { label: string; value: string }[] {
  const r = p.rifle;
  if (!r) return [];
  const v = p.version;
  const touch = latestLandsForBullet(p.lands, { make: v.bulletMake, model: v.bulletModel, weightGr: v.bulletWeightGr });
  const rows: { label: string; value: string | null }[] = [
    { label: 'Rifle', value: r.name },
    { label: 'Barrel', value: [r.barrelLengthIn ? `${r.barrelLengthIn}"` : null, r.twistRate].filter(Boolean).join(' · ') || null },
    { label: 'Chamber', value: r.chamberSpec },
    {
      label: 'Headspace (fired)',
      value: r.headspaceIn != null ? `${r.headspaceIn}"${r.headspaceInsert ? ` (${r.headspaceInsert})` : ''}` : null,
    },
    {
      label: 'Touches lands at',
      value: touch
        ? `${touch.cbtoIn.toFixed(3)}" CBTO${touch.comparatorInsert ? ` (${touch.comparatorInsert})` : ''}, ${new Date(touch.measuredAt).toLocaleDateString()}${touch.roundCount != null ? `, ${touch.roundCount} rds` : ''}`
        : null,
    },
    { label: 'Magazine max COAL', value: inches(r.magazineMaxCoalIn) },
  ];
  return rows.filter((t): t is { label: string; value: string } => t.value != null);
}

function stageHtml(s: RecipeStage): string {
  const rows = s.rows.map((r) => `<tr><td class="k">${e(r.label)}</td><td class="v">${e(r.value)}</td><td class="box">☐</td></tr>`).join('\n');
  const notes = s.notes.map((n) => `<p class="note"><b>${e(n.label)}:</b> ${e(n.text)}</p>`).join('\n');
  return `<section class="stage">
  <h2>${e(s.title)}</h2>
  ${rows ? `<table>${rows}</table>` : ''}
  ${notes}
</section>`;
}

export function recipeSheetHtml(p: RecipeSheetParams): string {
  const v = p.version;
  const bullet = [v.bulletMake, v.bulletModel, v.bulletWeightGr ? `${v.bulletWeightGr} gr` : null].filter(Boolean).join(' ');
  const ingredients = ingredientRows(v);
  const stages = recipeStages(v);
  const targets = benchTargets(p);
  const facts = rifleFacts(p);
  const ballistics = [
    v.bcValue != null ? `BC ${v.bcValue} ${v.bcModel ?? ''}`.trim() : null,
    v.muzzleVelocityFps != null ? `${v.muzzleVelocityFps} fps${v.mvTempRefF != null ? ` at ${v.mvTempRefF} °F` : ''}` : null,
    v.bulletLengthIn != null ? `bullet ${v.bulletLengthIn}" long` : null,
  ].filter(Boolean);
  const subtitle = [p.load.cartridge, p.rifle?.name].filter(Boolean).map((s) => e(String(s))).join(' · ');
  const asOf = new Date(v.createdAt).toLocaleDateString();

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>${e(p.load.name)} — recipe</title>
<style>
  @page { size: auto; margin: 0.6in; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #000; font-size: 11px; }
  .head { border-bottom: 2.5px solid #000; padding-bottom: 6px; margin-bottom: 10px; }
  h1 { font-size: 20px; font-weight: 800; letter-spacing: 0.01em; }
  .sub { font-size: 12px; margin-top: 2px; }
  .meta { font-size: 9px; color: #333; margin-top: 3px; }
  .grid { display: flex; gap: 12px; margin-bottom: 10px; }
  .grid > div { flex: 1; border: 1.5px solid #000; padding: 6px 8px; }
  .grid h2 { font-size: 9px; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 4px; }
  .targets td.v { font-size: 15px; font-weight: 800; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 2.5px 3px; border-bottom: 0.5px solid #bbb; vertical-align: top; font-variant-numeric: tabular-nums; }
  td.k { color: #333; width: 38%; }
  td.v { font-weight: 600; }
  td.box { width: 16px; text-align: right; font-size: 12px; }
  section.stage { margin-top: 8px; break-inside: avoid; }
  section.stage h2 { font-size: 11px; font-weight: 800; border-bottom: 1.5px solid #000; padding-bottom: 2px; margin-bottom: 3px; }
  p.note { font-size: 10px; margin-top: 3px; white-space: pre-wrap; }
  .log { margin-top: 12px; break-inside: avoid; }
  .log h2 { font-size: 11px; font-weight: 800; border-bottom: 1.5px solid #000; padding-bottom: 2px; margin-bottom: 3px; }
  .log th { font-size: 8px; text-transform: uppercase; letter-spacing: 0.06em; text-align: left; padding: 2px 3px; border-bottom: 1px solid #000; }
  .log td { height: 22px; border-bottom: 0.5px solid #888; }
  .foot { margin-top: 12px; font-size: 8px; color: #333; border-top: 0.5px solid #888; padding-top: 4px; }
</style>
</head>
<body>
  <div class="head">
    <h1>${e(p.load.name)}</h1>
    ${subtitle ? `<div class="sub">${subtitle}</div>` : ''}
    <div class="meta">Recipe v${v.versionNumber} as of ${e(asOf)}${bullet ? ` · ${e(bullet)}` : ''}${ballistics.length ? ` · ${e(ballistics.join(' · '))}` : ''} · printed ${e(p.generatedOn.toLocaleDateString())}</div>
  </div>

  <div class="grid">
    <div class="targets">
      <h2>Bench targets</h2>
      ${targets.length ? `<table>${targets.map((t) => `<tr><td class="k">${e(t.label)}</td><td class="v">${e(t.value)}</td></tr>`).join('')}</table>` : '<p class="note">No seating or charge targets recorded yet.</p>'}
    </div>
    <div>
      <h2>Ingredients</h2>
      ${ingredients.length ? `<table>${ingredients.map((r) => `<tr><td class="k">${e(r.label)}</td><td class="v">${e(r.value)}</td></tr>`).join('')}</table>` : '<p class="note">No components recorded yet.</p>'}
      ${facts.length ? `<h2 style="margin-top:8px">Rifle</h2><table>${facts.map((r) => `<tr><td class="k">${e(r.label)}</td><td class="v">${e(r.value)}</td></tr>`).join('')}</table>` : ''}
    </div>
  </div>

  ${stages.map(stageHtml).join('\n')}
  ${stages.length === 0 ? '<p class="note">No process detail recorded. Tick the boxes as you go once the stages are filled in.</p>' : ''}

  <div class="log">
    <h2>Batch log</h2>
    <table>
      <tr><th style="width:14%">Date</th><th style="width:8%">Qty</th><th>Brass lot / firings</th><th>Powder lot</th><th>Primer lot</th><th>Bullet lot</th><th style="width:16%">Runout</th><th style="width:20%">Notes</th></tr>
      ${(p.batches ?? [])
        .map(
          (b) =>
            `<tr><td>${e(new Date(b.date).toLocaleDateString())}</td><td>${b.quantity ?? ''}</td><td>${e(b.brassLot ?? '')}</td><td>${e(b.powderLot ?? '')}</td><td>${e(b.primerLot ?? '')}</td><td>${e(b.bulletLot ?? '')}</td><td>${e(batchSummary({ ...b, quantity: null }).replace(/^runout /, ''))}</td><td>${e(b.notes ?? '')}</td></tr>`,
        )
        .join('\n      ')}
      ${Array.from({ length: Math.max(2, 6 - (p.batches?.length ?? 0)) }, () => '<tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>').join('\n      ')}
    </table>
  </div>

  <div class="foot">Precision Innovation recipe sheet. This records your own load; it is not published load data. Start from a current manual, work up, and watch for pressure signs.</div>
</body>
</html>`;
}
