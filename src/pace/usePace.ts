import { create } from "zustand";
import { persist } from "zustand/middleware";

export type PaceProactivity = "quiet" | "balanced" | "coach";
export type PaceMotion = "full" | "subtle" | "off";
export type PaceTone = "compact" | "friendly" | "explanatory";

export interface PacePreferences {
  enabled: boolean;
  proactivity: PaceProactivity;
  motion: PaceMotion;
  tone: PaceTone;
  operationalSignals: boolean;
  setupGuidance: boolean;
  insightGuidance: boolean;
}

interface PaceState {
  open: boolean;
  settingsOpen: boolean;
  preferences: PacePreferences;
  dismissedSignals: string[];
  setOpen: (open: boolean) => void;
  toggle: () => void;
  setSettingsOpen: (open: boolean) => void;
  updatePreferences: (patch: Partial<PacePreferences>) => void;
  dismissSignal: (id: string) => void;
  resetDismissedSignals: () => void;
}

export const DEFAULT_PACE_PREFERENCES: PacePreferences = {
  enabled: true,
  proactivity: "balanced",
  motion: "full",
  tone: "compact",
  operationalSignals: true,
  setupGuidance: true,
  insightGuidance: true,
};

export const usePace = create<PaceState>()(
  persist(
    (set) => ({
      open: false,
      settingsOpen: false,
      preferences: DEFAULT_PACE_PREFERENCES,
      dismissedSignals: [],
      setOpen: (open) => set({ open, ...(open ? {} : { settingsOpen: false }) }),
      toggle: () => set((state) => ({ open: !state.open, settingsOpen: false })),
      setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
      updatePreferences: (patch) =>
        set((state) => ({
          preferences: { ...state.preferences, ...patch },
          ...("enabled" in patch && patch.enabled === false
            ? { open: false, settingsOpen: false }
            : {}),
        })),
      dismissSignal: (id) =>
        set((state) => ({
          dismissedSignals: state.dismissedSignals.includes(id)
            ? state.dismissedSignals
            : [...state.dismissedSignals, id].slice(-40),
        })),
      resetDismissedSignals: () => set({ dismissedSignals: [] }),
    }),
    {
      name: "pwayment:pace:v1",
      version: 1,
      partialize: (state) => ({
        preferences: state.preferences,
        dismissedSignals: state.dismissedSignals,
      }),
    },
  ),
);
