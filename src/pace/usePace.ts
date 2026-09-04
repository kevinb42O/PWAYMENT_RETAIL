import { create } from "zustand";
import { supabase } from "../lib/supabase";
import type { Json } from "../types/database.generated";

export type PaceProactivity = "quiet" | "balanced" | "coach";
export type PaceMotion = "full" | "subtle" | "off";
export type PaceTone = "compact" | "friendly" | "explanatory";
export type PacePreferenceSync = "idle" | "loading" | "saved" | "local" | "error";

export interface PacePreferences {
  enabled: boolean;
  aiEnabled: boolean;
  liveStoreContext: boolean;
  proactivity: PaceProactivity;
  motion: PaceMotion;
  tone: PaceTone;
  operationalSignals: boolean;
  setupGuidance: boolean;
  insightGuidance: boolean;
  actionProposalsEnabled: boolean;
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

interface PaceStoredState {
  preferences: PacePreferences;
  dismissedSignals: string[];
  customerFeedback: PaceCustomerFeedback[];
}

interface PaceState extends PaceStoredState {
  open: boolean;
  scopeKey: string | null;
  syncState: PacePreferenceSync;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  hydrateScope: (storeId: string | null, userId: string | null) => Promise<void>;
  updatePreferences: (patch: Partial<PacePreferences>) => void;
  dismissSignal: (id: string) => void;
  resetDismissedSignals: () => void;
  recordCustomerFeedback: (insightId: string, disposition: PaceCustomerFeedbackDisposition) => void;
}

export const DEFAULT_PACE_PREFERENCES: PacePreferences = {
  enabled: true,
  aiEnabled: true,
  liveStoreContext: true,
  proactivity: "balanced",
  motion: "full",
  tone: "compact",
  operationalSignals: true,
  setupGuidance: true,
  insightGuidance: true,
  actionProposalsEnabled: false,
  customerGuidance: true,
  expressiveMorphs: true,
};

const emptyStoredState = (): PaceStoredState => ({
  preferences: { ...DEFAULT_PACE_PREFERENCES },
  dismissedSignals: [],
  customerFeedback: [],
});

const storageKey = (scopeKey: string) => `pwayment:pace:v2:${scopeKey}`;
const normalizeStored = (raw?: Partial<PaceStoredState> | null): PaceStoredState => ({
  preferences: { ...DEFAULT_PACE_PREFERENCES, ...(raw?.preferences ?? {}) },
  dismissedSignals: Array.isArray(raw?.dismissedSignals) ? raw.dismissedSignals.slice(-40) : [],
  customerFeedback: Array.isArray(raw?.customerFeedback) ? raw.customerFeedback.slice(-80) : [],
});

const readLocal = (scopeKey: string): PaceStoredState | null => {
  try {
    const raw = localStorage.getItem(storageKey(scopeKey));
    return raw ? normalizeStored(JSON.parse(raw) as Partial<PaceStoredState>) : null;
  } catch {
    return null;
  }
};

const writeLocal = (scopeKey: string, state: PaceStoredState) => {
  try { localStorage.setItem(storageKey(scopeKey), JSON.stringify(state)); } catch { /* Memory state remains usable. */ }
};

let saveTimer: number | undefined;
const queueRemoteSave = (scopeKey: string) => {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(async () => {
    const separator = scopeKey.lastIndexOf(":");
    const storeId = scopeKey.slice(0, separator);
    const userId = scopeKey.slice(separator + 1);
    const snapshot = usePace.getState();
    if (snapshot.scopeKey !== scopeKey || !storeId || !userId) return;
    const { preferences } = snapshot;
    const { error } = await supabase.from("pace_user_preferences").upsert({
      store_id: storeId,
      user_id: userId,
      enabled: preferences.enabled,
      ai_enabled: preferences.aiEnabled,
      live_store_context: preferences.liveStoreContext,
      proactivity: preferences.proactivity,
      motion: preferences.motion,
      tone: preferences.tone,
      operational_signals: preferences.operationalSignals,
      setup_guidance: preferences.setupGuidance,
      insight_guidance: preferences.insightGuidance,
      action_proposals_enabled: preferences.actionProposalsEnabled,
      customer_guidance: preferences.customerGuidance,
      expressive_morphs: preferences.expressiveMorphs,
      dismissed_signals: snapshot.dismissedSignals,
      customer_feedback: snapshot.customerFeedback as unknown as Json,
      updated_at: new Date().toISOString(),
    }, { onConflict: "store_id,user_id" });
    usePace.setState((current) => current.scopeKey === scopeKey ? { syncState: error ? "error" : "saved" } : {});
  }, 450);
};

const persistCurrent = (state: PaceState) => {
  if (!state.scopeKey) return;
  writeLocal(state.scopeKey, { preferences: state.preferences, dismissedSignals: state.dismissedSignals, customerFeedback: state.customerFeedback });
  usePace.setState({ syncState: navigator.onLine ? "idle" : "local" });
  if (navigator.onLine) queueRemoteSave(state.scopeKey);
};

export const usePace = create<PaceState>((set, get) => ({
  ...emptyStoredState(),
  open: false,
  scopeKey: null,
  syncState: "idle",
  setOpen: (open) => set({ open }),
  toggle: () => set((state) => ({ open: !state.open })),
  hydrateScope: async (storeId, userId) => {
    const scopeKey = storeId && userId ? `${storeId}:${userId}` : null;
    if (!scopeKey) {
      set({ ...emptyStoredState(), scopeKey: null, syncState: "local" });
      return;
    }
    if (get().scopeKey === scopeKey) return;
    const local = readLocal(scopeKey) ?? emptyStoredState();
    set({ ...local, scopeKey, syncState: navigator.onLine ? "loading" : "local" });
    if (!navigator.onLine) return;
    const { data, error } = await supabase.from("pace_user_preferences").select("*").eq("store_id", storeId).eq("user_id", userId).maybeSingle();
    if (get().scopeKey !== scopeKey) return;
    if (error) { set({ syncState: "local" }); return; }
    if (!data) { set({ syncState: "saved" }); queueRemoteSave(scopeKey); return; }
    const remote = normalizeStored({
      preferences: {
        enabled: data.enabled,
        aiEnabled: data.ai_enabled,
        liveStoreContext: data.live_store_context,
        proactivity: data.proactivity as PaceProactivity,
        motion: data.motion as PaceMotion,
        tone: data.tone as PaceTone,
        operationalSignals: data.operational_signals,
        setupGuidance: data.setup_guidance,
        insightGuidance: data.insight_guidance,
        actionProposalsEnabled: data.action_proposals_enabled,
        customerGuidance: data.customer_guidance,
        expressiveMorphs: data.expressive_morphs,
      },
      dismissedSignals: data.dismissed_signals,
      customerFeedback: data.customer_feedback as unknown as PaceCustomerFeedback[],
    });
    writeLocal(scopeKey, remote);
    set({ ...remote, syncState: "saved" });
  },
  updatePreferences: (patch) => {
    set((state) => ({ preferences: { ...state.preferences, ...patch }, ...("enabled" in patch && patch.enabled === false ? { open: false } : {}) }));
    persistCurrent(get());
  },
  dismissSignal: (id) => {
    set((state) => ({ dismissedSignals: state.dismissedSignals.includes(id) ? state.dismissedSignals : [...state.dismissedSignals, id].slice(-40) }));
    persistCurrent(get());
  },
  resetDismissedSignals: () => { set({ dismissedSignals: [], customerFeedback: [] }); persistCurrent(get()); },
  recordCustomerFeedback: (insightId, disposition) => {
    set((state) => {
      const recordedAt = Date.now();
      const suppressUntil = disposition === "later" ? recordedAt + 4 * 60 * 60 * 1000 : disposition === "used" ? recordedAt + 24 * 60 * 60 * 1000 : undefined;
      return { customerFeedback: [...state.customerFeedback.filter((entry) => entry.insightId !== insightId), { insightId, disposition, recordedAt, suppressUntil }].slice(-80) };
    });
    persistCurrent(get());
  },
}));
