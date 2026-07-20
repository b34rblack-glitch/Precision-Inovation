import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

// Remembers the last rifle/load pairing and location so a new session at the
// same bench is two taps, not a form. Persisted so it survives app restarts.

type LastUsedState = {
  rifleId: string | null;
  loadId: string | null;
  location: string | null;
  remember: (v: { rifleId?: string | null; loadId?: string | null; location?: string | null }) => void;
};

export const useLastUsed = create<LastUsedState>()(
  persist(
    (set) => ({
      rifleId: null,
      loadId: null,
      location: null,
      remember: (v) => set((s) => ({ ...s, ...v })),
    }),
    {
      name: 'last-used',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
