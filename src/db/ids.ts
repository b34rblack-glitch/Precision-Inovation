// Local row identifiers. These are NOT security-sensitive (they never leave the
// device and aren't guessable-attack surface), so we generate a UUID v4 in pure
// JS rather than calling a native crypto module. That removes a native call from
// the hot create/save path — a native failure there is uncatchable by JS
// try/catch and would hard-crash the app on the very first save.

const HEX: string[] = [];
for (let i = 0; i < 256; i++) HEX.push((i + 0x100).toString(16).slice(1));

/** RFC-4122 v4 UUID, pure JS (Math.random). Collision risk is negligible for a
 * personal, on-device dataset. */
export function newId(): string {
  const r = (n: number) => (Math.random() * n) | 0;
  const b = new Array<number>(16);
  for (let i = 0; i < 16; i++) b[i] = r(256);
  b[6] = (b[6]! & 0x0f) | 0x40; // version 4
  b[8] = (b[8]! & 0x3f) | 0x80; // variant 10xx
  return (
    HEX[b[0]!]! + HEX[b[1]!]! + HEX[b[2]!]! + HEX[b[3]!]! + '-' +
    HEX[b[4]!]! + HEX[b[5]!]! + '-' +
    HEX[b[6]!]! + HEX[b[7]!]! + '-' +
    HEX[b[8]!]! + HEX[b[9]!]! + '-' +
    HEX[b[10]!]! + HEX[b[11]!]! + HEX[b[12]!]! + HEX[b[13]!]! + HEX[b[14]!]! + HEX[b[15]!]!
  );
}

export function now(): Date {
  return new Date();
}
