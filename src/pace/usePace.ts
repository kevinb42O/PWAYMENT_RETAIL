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
  customerGuidance: boolean;
  expressiveMorphs: boolean;
}

export type PaceCustomerFeedbackDisposition = "used" | "later" | "not-relevant";
export interface PaceCustomerFeedback {
  insightId: string;
  disposition: PaceCustomerFeedbackDisposition;
  recordedAt: number;
  suppressUntil?: number;
}

interface PaceState {
  open: boolean;
  settingsOpen: boolean;
  preferences: PacePreferences;
  dismissedSignals: string[];
  customerFeedback: PaceCustomerFeedback[];
  setOpen: (open: boolean) => void;
  toggle: () => void;
  setSettingsOpen: (open: boolean) => void;
  updatePreferences: (patch: Partial<PacePreferences>) => void;
  dismissSignal: (id: string) => void;
  resetDismissedSignals: () => void;
  recordCustomerFeedback: (insightId: string, disposition: PaceCustomerFeedbackDisposition) => void;
}

export const DEFAULT_PACE_PREFERENCES: PacePreferences = {
  enabled: true,
  proactivity: "balanced",
  motion: "full",
  tone: "compact",
  operationalSignals: true,
  setupGuidance: true,
  insightGuidance: true,
  customerGuidance: true,
  expressiveMorphs: true,
};

export const usePace = create<PaceState>()(
  persist(
    (set) => ({
      open: false,
      settingsOpen: false,
      preferences: DEFAULT_PACE_PREFERENCES,
      dismissedSignals: [],
      customerFeedback: [],
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
      resetDismissedSignals: () => set({ dismissedSignals: [], customerFeedback: [] }),
      recordCustomerFeedback: (insightId, disposition) => set((state) => {
        const recordedAt = Date.now();
        const suppressUntil = disposition === "later"
          ? recordedAt + 4 * 60 * 60 * 1000
          : disposition === "used"
            ? recordedAt + 24 * 60 * 60 * 1000
            : undefined;
        return {
          customerFeedback: [
            ...state.customerFeedback.filter((entry) => entry.insightId !== insightId),
            { insightId, disposition, recordedAt, suppressUntil },
          ].slice(-80),
        };
      }),
    }),
    {
      name: "pwayment:pace:v1",
      version: 4,
      migrate: (persisted) => {
        const state = persisted as Partial<PaceState>;
        if (state.preferences) {
          state.preferences = {
            ...DEFAULT_PACE_PREFERENCES,
            ...state.preferences,
          };
        }
        state.customerFeedback ??= [];
        return state as PaceState;
      },
      partialize: (state) => ({
        preferences: state.preferences,
        dismissedSignals: state.dismissedSignals,
        customerFeedback: state.customerFeedback,
      }),
    },
  ),
);
