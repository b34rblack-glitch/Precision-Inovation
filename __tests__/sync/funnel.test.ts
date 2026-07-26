import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Sync is only correct if *every* write is stamped with a logical timestamp and
// every delete leaves a tombstone. That guarantee lives in src/db/mutate.ts, and
// it is exactly one careless `db.insert(...)` away from being quietly false —
// with no test failure, no crash, and no symptom until two devices disagree
// about a row and the wrong one wins.
//
// So: scan the source. A write outside the funnel fails the build.

const ROOT = path.resolve(__dirname, '../..');
const SCAN_DIRS = ['src', 'app'];

/**
 * Files permitted to issue writes directly, each for a stated reason.
 * Adding an entry here is a deliberate act; adding one without a reason is a bug.
 */
const ALLOWED: Record<string, string> = {
  'src/db/mutate.ts': 'the funnel itself',
  'src/db/syncBootstrap.ts':
    'backfills sync_row_meta before the funnel can run; writes only bookkeeping tables',
  'src/lib/backup.ts':
    'restore replaces the whole database inside one transaction, then re-stamps every row',
  'src/db/repositories/rangeCards.ts':
    'getOrCreateCard needs onConflictDoNothing against the range_cards unique index; the row is stamped via stampRow when our insert is the one that lands',
  'src/sync/platform/expoDriver.ts': 'applies already-stamped merge operations verbatim',
};

const WRITE_CALL = /\b(?:db|tx)\s*\.\s*(insert|update|delete)\s*\(/g;

function walk(dir: string): string[] {
  const abs = path.join(ROOT, dir);
  let entries: string[];
  try {
    entries = readdirSync(abs);
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const entry of entries) {
    const rel = path.join(dir, entry);
    if (statSync(path.join(ROOT, rel)).isDirectory()) out.push(...walk(rel));
    else if (/\.tsx?$/.test(entry)) out.push(rel.split(path.sep).join('/'));
  }
  return out;
}

describe('every database write goes through the sync funnel', () => {
  const files = SCAN_DIRS.flatMap((d) => walk(d));

  it('scans a meaningful number of files', () => {
    expect(files.length).toBeGreaterThan(40);
  });

  it('finds no insert, update or delete outside src/db/mutate.ts', () => {
    const violations: string[] = [];

    for (const file of files) {
      if (file in ALLOWED) continue;
      const source = readFileSync(path.join(ROOT, file), 'utf8');
      const lines = source.split('\n');
      lines.forEach((line, i) => {
        // Ignore comment lines so prose about writes does not trip the scan.
        const code = line.replace(/^\s*(\/\/|\*|\/\*).*$/, '');
        WRITE_CALL.lastIndex = 0;
        const match = WRITE_CALL.exec(code);
        if (match) violations.push(`${file}:${i + 1}  ${line.trim()}`);
      });
    }

    expect(
      violations,
      'Route the write through mutate() + insertRow/updateRow/deleteRow, ' +
        'or add the file to ALLOWED with a reason.',
    ).toEqual([]);
  });

  it('the allowlist names only files that exist', () => {
    for (const file of Object.keys(ALLOWED)) {
      // expoDriver is added in a later commit; tolerate its absence but nothing else.
      if (file === 'src/sync/platform/expoDriver.ts' && !files.includes(file)) continue;
      expect(files, `${file} is allowlisted but missing`).toContain(file);
    }
  });
});

describe('deletes leave tombstones', () => {
  it('the two hard deletes route through deleteRow', () => {
    const sessions = readFileSync(path.join(ROOT, 'src/db/repositories/sessions.ts'), 'utf8');

    // deleteDopeEntry and deleteShotString were plain deletes before sync; a row
    // removed on one device would simply reappear from the other.
    expect(sessions).toMatch(/deleteRow\(tx, 'dopeEntries', id\)/);
    expect(sessions).toMatch(/deleteRow\(tx, 'shotStrings', id\)/);

    // Shots must be deleted one at a time: a bulk DELETE WHERE stringId = ?
    // leaves no per-row tombstone, so every shot would resurrect while the
    // string that owned them stayed deleted.
    expect(sessions).toMatch(/for \(const child of children\) deleteRow\(tx, 'shots', child\.id\)/);
    expect(sessions).not.toMatch(/delete\(shots\)\.where\(eq\(shots\.stringId/);
  });
});

describe('multi-row writes are atomic', () => {
  const readRepo = (name: string) =>
    readFileSync(path.join(ROOT, `src/db/repositories/${name}.ts`), 'utf8');

  it('createLoad, createWorkup and promoteChargeToVersion each use one transaction', () => {
    // Each of these used to issue several unwrapped writes, so a crash between
    // them left a load pointing at a nonexistent version, a workup with no
    // steps, or a promoted version nothing pointed at. A sync snapshot could
    // capture any of those partial states and replicate it.
    const loads = readRepo('loads');
    const workups = readRepo('workups');

    for (const [source, fn] of [
      [loads, 'createLoad'],
      [loads, 'updateLoad'],
      [workups, 'createWorkup'],
      [workups, 'promoteChargeToVersion'],
    ] as const) {
      const start = source.indexOf(`function ${fn}(`);
      expect(start, `${fn} not found`).toBeGreaterThan(-1);
      const body = source.slice(start, start + 3000);
      expect(body, `${fn} must wrap its writes in mutate()`).toMatch(/mutate\(\(tx\)/);
    }
  });
});
