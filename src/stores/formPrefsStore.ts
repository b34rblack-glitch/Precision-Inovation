import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { FormGroupKey, FormMode } from '@/features/loads/formGroups';

// How much of the load form to show. A device preference, not user data:
// it says what this loader tracks, so it does not travel in backups or sync.

type FormPrefsState = {
  mode: FormMode;
  notUsed: FormGroupKey[];
  setMode: (mode: FormMode) => void;
  setNotUsed: (key: FormGroupKey, notUsed: boolean) => void;
  reset: () => void;
};

export const useFormPrefs = create<FormPrefsState>()(
  persist(
    (set) => ({
      mode: 'simple',
      notUsed: [],
      setMode: (mode) => set({ mode }),
      setNotUsed: (key, notUsed) =>
        set((s) => ({ notUsed: notUsed ? [...new Set([...s.notUsed, key])] : s.notUsed.filter((k) => k !== key) })),
      reset: () => set({ mode: 'simple', notUsed: [] }),
    }),
    { name: 'load-form-prefs', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
