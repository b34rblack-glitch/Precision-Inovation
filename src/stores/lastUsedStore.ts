import { create } from 'zustand';

// Remembers the last rifle/load pairing and location so a new session at the
// same bench is two taps, not a form.

type LastUsedState = {
  rifleId: string | null;
  loadId: string | null;
  location: string | null;
  remember: (v: { rifleId?: string | null; loadId?: string | null; location?: string | null }) => void;
};

export const useLastUsed = create<LastUsedState>((set) => ({
  rifleId: null,
  loadId: null,
  location: null,
  remember: (v) => set((s) => ({ ...s, ...v })),
}));
