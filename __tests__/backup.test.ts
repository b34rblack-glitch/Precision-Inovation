import { describe, expect, it, vi } from 'vitest';

// backup.ts (via @/db/client) pulls in Expo native modules that don't exist in
// node; stub them so the pure helpers under test can be imported. The db
// client is lazy, so nothing tries to open a database at import time.
vi.mock('expo-sqlite', () => ({ openDatabaseSync: vi.fn() }));
// drizzle-orm/expo-sqlite's useLiveQuery entry imports expo-sqlite natively
// (outside vitest's mock interception), so stub the whole entry point.
vi.mock('drizzle-orm/expo-sqlite', () => ({ drizzle: vi.fn(() => ({})) }));
vi.mock('expo-file-system', () => ({ File: class {}, Paths: { cache: '/tmp' } }));
vi.mock('expo-sharing', () => ({
  isAvailableAsync: vi.fn(async () => false),
  shareAsync: vi.fn(),
}));

import { chunkRows, INSERT_CHUNK_SIZE, TABLE_ORDER } from '@/lib/backup';

// Child table -> parent tables it references via FK (mirrors src/db/schema.ts).
const FK_PARENTS: Record<string, string[]> = {
  rifles: [],
  loads: ['rifles'],
  loadVersions: ['loads'],
  workups: ['rifles', 'loads', 'loadVersions'],
  workupSteps: ['workups'],
  rangeSessions: ['rifles', 'loadVersions'],
  shotStrings: ['workupSteps', 'rangeSessions'],
  shots: ['shotStrings'],
  dopeEntries: ['rangeSessions'],
  rangeCards: ['rifles', 'loadVersions'],
};

describe('TABLE_ORDER', () => {
  it('covers every table exactly once', () => {
    expect([...TABLE_ORDER].sort()).toEqual(Object.keys(FK_PARENTS).sort());
    expect(new Set(TABLE_ORDER).size).toBe(TABLE_ORDER.length);
  });

  it('lists every parent before its children (safe insert order)', () => {
    for (const [child, parents] of Object.entries(FK_PARENTS)) {
      for (const parent of parents) {
        expect(
          TABLE_ORDER.indexOf(parent as (typeof TABLE_ORDER)[number]),
          `${parent} must come before ${child}`,
        ).toBeLessThan(TABLE_ORDER.indexOf(child as (typeof TABLE_ORDER)[number]));
      }
    }
  });

  it('reversed, lists every child before its parents (safe delete order)', () => {
    const reversed = [...TABLE_ORDER].reverse();
    for (const [child, parents] of Object.entries(FK_PARENTS)) {
      for (const parent of parents) {
        expect(
          reversed.indexOf(child as (typeof TABLE_ORDER)[number]),
          `${child} must be deleted before ${parent}`,
        ).toBeLessThan(reversed.indexOf(parent as (typeof TABLE_ORDER)[number]));
      }
    }
  });
});

describe('chunkRows', () => {
  it('returns no chunks for an empty input', () => {
    expect(chunkRows([], 500)).toEqual([]);
  });

  it('returns one chunk when rows fit', () => {
    expect(chunkRows([1, 2, 3], 3)).toEqual([[1, 2, 3]]);
    expect(chunkRows([1, 2], 3)).toEqual([[1, 2]]);
  });

  it('splits into max-size chunks with a short tail, preserving order', () => {
    const rows = Array.from({ length: 1201 }, (_, i) => i);
    const chunks = chunkRows(rows, 500);
    expect(chunks.map((c) => c.length)).toEqual([500, 500, 201]);
    expect(chunks.flat()).toEqual(rows);
  });

  it('handles size 1', () => {
    expect(chunkRows(['a', 'b'], 1)).toEqual([['a'], ['b']]);
  });

  it('rejects a non-positive size', () => {
    expect(() => chunkRows([1], 0)).toThrow();
  });

  it('keeps the default chunk size at or under the 500-row bind limit', () => {
    expect(INSERT_CHUNK_SIZE).toBeLessThanOrEqual(500);
  });
});
