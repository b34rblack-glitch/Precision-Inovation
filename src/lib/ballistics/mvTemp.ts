// Muzzle-velocity temperature sensitivity: powders shoot faster when warm.
// Kept as a pure helper outside the solver — callers adjust mvFps before
// building a BallisticInput, so the solver never needs to know about it.

/**
 * Adjust muzzle velocity linearly for powder temperature.
 * Returns mvFps unchanged unless all three of refTempF, sensFpsPerDegF and
 * actualTempF are present.
 */
export function adjustMvForTemp(
  mvFps: number,
  refTempF: number | null,
  sensFpsPerDegF: number | null,
  actualTempF: number | null,
): number {
  if (refTempF == null || sensFpsPerDegF == null || actualTempF == null) return mvFps;
  return mvFps + (actualTempF - refTempF) * sensFpsPerDegF;
}
