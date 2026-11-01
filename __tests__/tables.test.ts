import { describe, expect, it } from 'vitest';
import {
  chunkSizeFor,
  COLUMN_COUNT,
  FK_EDGES,
  MAX_BIND_BUDGET,
  onMissingParent,
  OWNER_COLUMNS,
  TABLE_ORDER,
  TABLES,
  UNIQUE_KEYS,
} from '@/lib/tables';

// SQLite's default SQLITE_MAX_VARIABLE_NUMBER.
const SQLITE_BIND_LIMIT = 32766;

describe('table metadata', () => {
  it('TABLE_ORDER covers every table exactly once', () => {
    expect([...TABLE_ORDER].sort()).toEqual(Object.keys(TABLES).sort());
    expect(new Set(TABLE_ORDER).size).toBe(TABLE_ORDER.length);
  });

  it('places every FK parent before its child', () => {
    for (const edge of FK_EDGES) {
      expect(
        TABLE_ORDER.indexOf(edge.parent),
        `${edge.parent} must precede ${edge.tbl} (${edge.col})`,
      ).toBeLessThan(TABLE_ORDER.indexOf(edge.tbl));
    }
  });

  it('names only real columns in FK_EDGES', () => {
    // onMissingParent throws on an unknown column, so this also proves the
    // edge list has not drifted from the schema.
    for (const edge of FK_EDGES) {
      expect(['drop', 'null']).toContain(onMissingParent(edge));
    }
  });

  it('derives drop for NOT NULL parents and null for nullable ones', () => {
    const policy = (tbl: string, col: string) =>
      onMissingParent(FK_EDGES.find((e) => e.tbl === tbl && e.col === col)!);

    // Nullable: the row survives with the link blanked.
    expect(policy('loads', 'rifleId')).toBe('null');
    expect(policy('workups', 'baseVersionId')).toBe('null');
    expect(policy('rangeSessions', 'loadVersionId')).toBe('null');
    expect(policy('shotStrings', 'sessionId')).toBe('null');
    expect(policy('targetPhotos', 'workupId')).toBe('null');
    expect(policy('targetPhotos', 'workupStepId')).toBe('null');
    expect(policy('targetPhotos', 'sessionId')).toBe('null');

    // NOT NULL: no choice but to drop the orphan.
    expect(policy('loadVersions', 'loadId')).toBe('drop');
    expect(policy('shots', 'stringId')).toBe('drop');
    expect(policy('dopeEntries', 'sessionId')).toBe('drop');
    expect(policy('rangeCards', 'loadVersionId')).toBe('drop');
  });

  it('OWNER_COLUMNS lists every nullable FK of an owned table, and nothing else', () => {
    // The merge engine drops a row once every owner column is null; that is
    // only sound if the listed columns are exactly the table's foreign keys and
    // every one of them is nullable (a NOT NULL FK would have dropped the row
    // already).
    expect(Object.keys(OWNER_COLUMNS).sort()).toEqual(['shotStrings', 'targetPhotos']);
    for (const [tbl, cols] of Object.entries(OWNER_COLUMNS)) {
      const edges = FK_EDGES.filter((e) => e.tbl === tbl);
      expect([...cols!].sort()).toEqual(edges.map((e) => e.col).sort());
      for (const e of edges) expect(onMissingParent(e)).toBe('null');
    }
  });

  it('knows the range_cards unique key — the schema’s only one', () => {
    expect(Object.keys(UNIQUE_KEYS)).toEqual(['rangeCards']);
    const key = UNIQUE_KEYS.rangeCards!;
    expect(key({ rifleId: 'r1', loadVersionId: 'v1' })).toBe(
      key({ rifleId: 'r1', loadVersionId: 'v1', preset: 'bench' }),
    );
    expect(key({ rifleId: 'r1', loadVersionId: 'v1' })).not.toBe(
      key({ rifleId: 'r1', loadVersionId: 'v2' }),
    );
  });
});

describe('insert chunking stays under SQLite’s bind limit', () => {
  it('loadVersions is still the widest table', () => {
    const widest = TABLE_ORDER.reduce((a, b) => (COLUMN_COUNT[a] >= COLUMN_COUNT[b] ? a : b));
    expect(widest).toBe('loadVersions');
  });

  it('never exceeds the bind limit for any table', () => {
    for (const t of TABLE_ORDER) {
      const binds = chunkSizeFor(t) * COLUMN_COUNT[t];
      expect(binds, `${t} would bind ${binds} variables`).toBeLessThanOrEqual(MAX_BIND_BUDGET);
      expect(binds).toBeLessThan(SQLITE_BIND_LIMIT);
    }
  });

  it('leaves real headroom on the widest table', () => {
    // The old flat chunk of 500 bound 500 x 60 = 30,000 against a 32,766
    // ceiling: 9% headroom, so adding one column to load_versions would have
    // broken restore. Assert we now sit comfortably below it.
    const binds = chunkSizeFor('loadVersions') * COLUMN_COUNT.loadVersions;
    expect(binds).toBeLessThan(SQLITE_BIND_LIMIT * 0.7);
    expect(500 * COLUMN_COUNT.loadVersions).toBeGreaterThan(SQLITE_BIND_LIMIT * 0.9);
  });

  it('still chunks narrow tables generously', () => {
    expect(chunkSizeFor('shots')).toBe(500);
  });
});
