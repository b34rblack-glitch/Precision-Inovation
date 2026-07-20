// Locale-safe numeric parsing. EU keyboards produce decimal commas; Number()
// silently returns NaN (or worse, parseFloat truncates), corrupting saved data.

/**
 * Parse a single decimal string. Accepts one decimal comma OR dot.
 * Returns null for empty/blank input or anything that isn't entirely a
 * finite number.
 */
export function parseDecimal(s: string): number | null {
  const trimmed = s.trim();
  if (!trimmed) return null;
  // Normalize a single decimal comma to a dot. If more than one comma is
  // present the leftover comma fails the regex below.
  const normalized = trimmed.replace(',', '.');
  if (!/^-?\d*\.?\d+$/.test(normalized)) return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

/**
 * Parse a pasted list of chronograph velocities. Decimal commas between
 * digits ('2701,5' → 2701.5) are normalized; commas, semicolons, whitespace
 * and newlines otherwise act as separators. Values under 100 fps are
 * discarded as garbage fragments.
 */
export function parseVelocityList(s: string): number[] {
  // A comma followed by a 1-2 digit run reads as a decimal fraction
  // ('2701,5'); longer runs ('2701,2698') are separators between values.
  const normalized = s.replace(/(\d),(\d{1,2})(?!\d)/g, '$1.$2');
  return normalized
    .split(/[,;\s]+/)
    .map(parseDecimal)
    .filter((n): n is number => n !== null && n >= 100);
}
