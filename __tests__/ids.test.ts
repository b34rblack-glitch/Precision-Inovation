import { describe, expect, it } from 'vitest';
import { newId } from '@/db/ids';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('newId', () => {
  it('returns a well-formed RFC-4122 v4 UUID', () => {
    for (let i = 0; i < 100; i++) expect(newId()).toMatch(UUID_V4);
  });

  it('generates unique ids', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 10000; i++) seen.add(newId());
    expect(seen.size).toBe(10000);
  });

  it('does not import a native module (pure JS, no throw)', () => {
    expect(() => newId()).not.toThrow();
  });
});
