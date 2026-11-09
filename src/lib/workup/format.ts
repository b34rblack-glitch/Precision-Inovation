// Display formatting shared by the workup screens. PURE.

/**
 * A charge weight as the step cards print it: two decimals with a single
 * trailing zero dropped, so 42.2 reads "42.2 gr" and 42.25 reads "42.25 gr".
 */
export function formatChargeGr(chargeGr: number): string {
  return `${chargeGr.toFixed(2).replace(/0$/, '')} gr`;
}
