import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ThemeMode, isThemeMode } from '../utils/theme';

interface ThemeState {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  toggleMode: () => void;
}

export const useTheme = create<ThemeState>()(
  persist(
    (set) => ({
      mode: 'light',
      setMode: (mode) => set({ mode }),
      toggleMode: () => set((state) => ({ mode: state.mode === 'dark' ? 'light' : 'dark' })),
    }),
    {
      name: 'pwayment-theme',
      partialize: (state) => ({ mode: state.mode }),
      merge: (persisted, current) => {
        const persistedMode = (persisted as { mode?: unknown } | undefined)?.mode;
        return {
          ...current,
          mode: isThemeMode(persistedMode) ? persistedMode : current.mode,
        };
      },
    },
  ),
);
