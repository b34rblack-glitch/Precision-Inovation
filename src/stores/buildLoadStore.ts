import { create } from 'zustand';
import { BuildDraft, emptyDraft } from '@/features/loads/buildLoad';

// The Build-a-Load draft lives here rather than in the screen so it survives
// the "go add a rifle, come back" detour across tabs, and so a remount never
// loses what was typed.
//
// Deliberately NOT persisted: a half-finished draft reappearing days later with
// the charge acknowledgement still ticked would defeat the point of the tick.
// `start()` always begins from a clean draft with the acknowledgement off.

type BuildLoadState = {
  draft: BuildDraft | null;
  stepIndex: number;
  start: (seed?: { rifleId?: string | null; cartridge?: string | null }) => void;
  /** Merge a change. Touching the charge clears the acknowledgement. */
  patch: (p: Partial<BuildDraft>) => void;
  setStep: (i: number) => void;
  reset: () => void;
};

export const useBuildLoad = create<BuildLoadState>()((set) => ({
  draft: null,
  stepIndex: 0,
  start: (seed) => set({ draft: emptyDraft(seed), stepIndex: 0 }),
  patch: (p) =>
    set((s) => {
      if (!s.draft) return s;
      const next = { ...s.draft, ...p };
      if (p.chargeGr !== undefined && p.chargeGr !== s.draft.chargeGr) {
        next.chargeAcknowledged = false;
      }
      return { draft: next };
    }),
  setStep: (stepIndex) => set({ stepIndex }),
  reset: () => set({ draft: null, stepIndex: 0 }),
}));
