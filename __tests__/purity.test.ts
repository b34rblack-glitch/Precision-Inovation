import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// The desktop app vendors these files byte-for-byte and builds them without
// React Native, Expo or Metro. Nothing here may reach a native module —
// directly or transitively — or the desktop build breaks in a confusing way
// far from the cause.
//
// The desktop repo's own drift test proves the vendored copies are *current*.
// This test proves they are *portable*: it is the guard against someone adding
// `import { Platform } from 'react-native'` to solver.ts, which is a far more
// likely mistake than hand-editing the vendored copy.

const ROOT = path.resolve(__dirname, '..');

/** Directories whose every .ts file must be pure. */
const PURE_DIRS = [
  'src/lib/ballistics',
  'src/lib/rangecard',
  'src/lib/workup',
  'src/data',
  'src/sync',
];

/** Individually pure files. */
const PURE_FILES = [
  'src/lib/units.ts',
  'src/lib/parse.ts',
  'src/lib/tokens.ts',
  'src/lib/pickerOption.ts',
  'src/lib/tables.ts',
  'src/db/ids.ts',
  'src/db/schema.ts',
  'src/features/loads/recipe.ts',
];

/**
 * Bare specifiers a pure module may import. Every entry must be a pure-JS
 * package that installs and runs outside a React Native bundler.
 */
const ALLOWED_PACKAGES = new Set(['drizzle-orm', 'drizzle-orm/sqlite-core']);

function walk(dir: string): string[] {
  const abs = path.join(ROOT, dir);
  let entries: string[];
  try {
    entries = readdirSync(abs);
  } catch {
    return []; // directory not created yet
  }
  const out: string[] = [];
  for (const entry of entries) {
    const rel = path.join(dir, entry);
    if (statSync(path.join(ROOT, rel)).isDirectory()) out.push(...walk(rel));
    else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) out.push(rel);
  }
  return out;
}

function pureFileSet(): string[] {
  const fromDirs = PURE_DIRS.flatMap((d) => walk(d));
  const present = PURE_FILES.filter((f) => {
    try {
      statSync(path.join(ROOT, f));
      return true;
    } catch {
      return false;
    }
  });
  return [...new Set([...fromDirs, ...present])].map((p) => p.split(path.sep).join('/')).sort();
}

/** Every module specifier in a file: import, export-from, and require. */
function specifiersOf(source: string): string[] {
  const out: string[] = [];
  const patterns = [
    /(?:^|\n)\s*import\s[^;]*?from\s*['"]([^'"]+)['"]/g,
    /(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g,
    /(?:^|\n)\s*export\s[^;]*?from\s*['"]([^'"]+)['"]/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const re of patterns) {
    let m = re.exec(source);
    while (m !== null) {
      out.push(m[1]!);
      m = re.exec(source);
    }
  }
  return out;
}

/** Resolve a `@/x` or relative specifier to a repo-relative .ts path, if it is one. */
function resolveLocal(spec: string, fromFile: string, pure: readonly string[]): string | null {
  let base: string;
  if (spec.startsWith('@/')) base = `src/${spec.slice(2)}`;
  else if (spec.startsWith('.')) base = path.posix.join(path.posix.dirname(fromFile), spec);
  else return null;
  for (const candidate of [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`]) {
    if (pure.includes(candidate)) return candidate;
  }
  return base; // unresolved — reported as impure so the failure is visible
}

describe('pure core is portable to a non-React-Native build', () => {
  const pure = pureFileSet();

  it('finds the pure file set', () => {
    expect(pure.length).toBeGreaterThan(15);
    expect(pure).toContain('src/lib/ballistics/solver.ts');
    expect(pure).toContain('src/db/schema.ts');
  });

  it('no pure module imports react-native, expo, or any native module', () => {
    const violations: string[] = [];
    for (const file of pure) {
      const source = readFileSync(path.join(ROOT, file), 'utf8');
      for (const spec of specifiersOf(source)) {
        if (spec.startsWith('@/') || spec.startsWith('.')) continue;
        if (ALLOWED_PACKAGES.has(spec)) continue;
        violations.push(`${file} imports '${spec}'`);
      }
    }
    expect(violations, `Add the package to ALLOWED_PACKAGES only if it is pure JS.`).toEqual([]);
  });

  it('every local import of a pure module is itself pure', () => {
    const violations: string[] = [];
    for (const file of pure) {
      const source = readFileSync(path.join(ROOT, file), 'utf8');
      for (const spec of specifiersOf(source)) {
        const local = resolveLocal(spec, file, pure);
        if (local === null) continue;
        if (!pure.includes(local)) {
          violations.push(`${file} imports '${spec}' -> ${local}, which is not in the pure set`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('the vendored set covers every module the desktop app needs', () => {
    // A cheap reminder: if these move or get renamed, update scripts/pull-core.mjs
    // in the desktop repo too.
    for (const required of [
      'src/lib/ballistics/solver.ts',
      'src/lib/ballistics/atmosphere.ts',
      'src/lib/ballistics/dragTables.ts',
      'src/lib/ballistics/mvTemp.ts',
      'src/lib/rangecard/merge.ts',
      'src/lib/rangecard/pdfHtml.ts',
      'src/lib/rangecard/presets.ts',
      'src/lib/workup/stats.ts',
      'src/lib/workup/seriesGenerator.ts',
      'src/lib/units.ts',
      'src/lib/parse.ts',
      'src/lib/tables.ts',
      'src/lib/tokens.ts',
      'src/data/bulletCatalog.ts',
      'src/data/componentCatalog.ts',
      'src/db/ids.ts',
      'src/db/schema.ts',
      'src/features/loads/recipe.ts',
    ]) {
      expect(pure).toContain(required);
    }
  });
});
