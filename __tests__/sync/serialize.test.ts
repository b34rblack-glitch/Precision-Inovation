import { describe, expect, it } from 'vitest';
import { COLUMNS, TABLE_ORDER } from '@/lib/tables';
import { decodeRow, decodeSnapshot, encodeRow, encodeSnapshot, stripMeta } from '@/sync/serialize';
import { at, DEV_A, row, snapshot, T0 } from './helpers';

describe('the reserved key cannot collide with a real column', () => {
  it('no schema column starts with an underscore', () => {
    // `_h` carries the logical timestamp inline. If a column were ever named
    // with a leading underscore it would be silently overwritten on the wire.
    for (const table of TABLE_ORDER) {
      for (const column of COLUMNS[table]) {
        expect(column.startsWith('_'), `${table}.${column}`).toBe(false);
      }
    }
  });
});

describe('row encoding', () => {
  it('drops nulls and writes dates as ISO strings', () => {
    const encoded = encodeRow(
      'rifles',
      row('rifles', 'r1', at(1, DEV_A), { make: null, model: 'T3x', notes: null }),
    );
    expect(encoded.make).toBeUndefined();
    expect(encoded.notes).toBeUndefined();
    expect(encoded.model).toBe('T3x');
    expect(encoded.createdAt).toBe(new Date(T0).toISOString());
    expect(encoded._h).toBe(at(1, DEV_A));
  });

  it('restores omitted columns as null, so a cleared field stays cleared', () => {
    // This is why decode fills every known column: an upsert has to clear a
    // field the other device cleared, not silently keep the local value.
    const decoded = decodeRow('rifles', { id: 'r1', name: 'T3x', _h: at(1, DEV_A) });
    expect(decoded.make).toBeNull();
    expect(decoded.notes).toBeNull();
    expect(decoded.photoSha256).toBeNull();
  });

  it('revives date columns and leaves other values alone', () => {
    const decoded = decodeRow('rangeSessions', {
      id: 's1',
      date: new Date(T0).toISOString(),
      createdAt: new Date(T0).toISOString(),
      tempF: 47,
      _h: at(1, DEV_A),
    });
    expect(decoded.date).toBeInstanceOf(Date);
    expect((decoded.date as Date).getTime()).toBe(T0);
    expect(decoded.tempF).toBe(47);
  });

  it('ignores columns this build does not know about', () => {
    // A peer on a newer migration may carry columns with no place to go here;
    // passing them to an INSERT would throw.
    const decoded = decodeRow('rifles', {
      id: 'r1',
      name: 'T3x',
      somethingFromTheFuture: 'boom',
      _h: at(1, DEV_A),
    });
    expect(decoded).not.toHaveProperty('somethingFromTheFuture');
  });

  it('preserves JSON columns as structured values', () => {
    const segments = [
      { minVelocityFps: 2600, bc: 0.32 },
      { minVelocityFps: 1800, bc: 0.3 },
    ];
    const encoded = encodeRow(
      'loadVersions',
      row('loadVersions', 'v1', at(1, DEV_A), { bcSegments: segments }),
    );
    expect(encoded.bcSegments).toEqual(segments);
    const back = decodeRow('loadVersions', JSON.parse(JSON.stringify(encoded)));
    expect(back.bcSegments).toEqual(segments);
  });

  it('stripMeta removes the timestamp so the row can be inserted', () => {
    const stripped = stripMeta(row('rifles', 'r1', at(1, DEV_A)));
    expect(stripped).not.toHaveProperty('_h');
    expect(stripped.id).toBe('r1');
  });
});

describe('snapshot round trip', () => {
  const original = snapshot({
    device: DEV_A,
    rows: {
      rifles: [row('rifles', 'r1', at(1, DEV_A), { name: 'Tikka', make: null })],
      loadVersions: [
        row('loadVersions', 'v1', at(2, DEV_A), { loadId: 'l1', chargeGr: 41.6, primer: null }),
      ],
    },
    tombstones: [{ t: 'dopeEntries', id: 'd1', _h: at(3, DEV_A) }],
  });

  it('survives encode then decode intact', () => {
    const back = decodeSnapshot(encodeSnapshot(original));

    expect(back.device).toEqual(original.device);
    expect(back.protocol).toBe(original.protocol);
    expect(back.tombstones).toEqual(original.tombstones);
    expect(back.rows.rifles).toHaveLength(1);
    expect(back.rows.rifles![0]).toMatchObject({ id: 'r1', name: 'Tikka', make: null });
    expect(back.rows.loadVersions![0]).toMatchObject({ chargeGr: 41.6, primer: null });
    expect(back.rows.rifles![0]!._h).toBe(at(1, DEV_A));
  });

  it('is stable — encoding a decoded snapshot gives the same bytes', () => {
    const once = encodeSnapshot(original);
    const twice = encodeSnapshot(decodeSnapshot(once));
    expect(twice).toBe(once);
  });

  it('omits empty tables entirely', () => {
    const json = JSON.parse(encodeSnapshot(original)) as { rows: Record<string, unknown> };
    expect(Object.keys(json.rows).sort()).toEqual(['loadVersions', 'rifles']);
  });

  it('null-stripping meaningfully shrinks a wide load_versions row', () => {
    // load_versions has 60 columns and a typical row fills a handful, so this
    // is roughly a halving of the payload for free.
    const wide = row('loadVersions', 'v1', at(1, DEV_A), { loadId: 'l1', chargeGr: 41.6 });

    const stripped = JSON.stringify(encodeRow('loadVersions', wide)).length;
    const withNulls = JSON.stringify({
      ...Object.fromEntries(COLUMNS.loadVersions.map((c) => [c, null])),
      ...encodeRow('loadVersions', wide),
    }).length;

    expect(stripped).toBeLessThan(withNulls * 0.6);
  });

  it('tolerates a snapshot with no rows or tombstones at all', () => {
    const empty = decodeSnapshot(JSON.stringify({ app: 'precision-innovation', protocol: 1 }));
    expect(empty.rows).toEqual({});
    expect(empty.tombstones).toEqual([]);
  });
});
