import { create } from "zustand";
import { useAuth } from "../auth/useAuth";
import { db } from "../db/db";
import { isSupabaseConfigured } from "../lib/supabase";
import { fetchOwnerFinancialWorkspace } from "../services/financialWorkspace";
import { seedDemoFinancialData } from "../utils/demoRetailData";
import type {
  FinancialCost,
  FinancialSettings,
  FinancialWorkspaceMutation,
} from "../types";

const defaultSettings = (): FinancialSettings => ({
  id: "store",
  safetyBufferCents: 0,
  updatedAt: new Date(0).toISOString(),
});

const financialDate = (value: string): boolean => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const timestamp = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const date = new Date(timestamp);
  return date.getUTCFullYear() === Number(match[1]) &&
    date.getUTCMonth() === Number(match[2]) - 1 &&
    date.getUTCDate() === Number(match[3]);
};

const validCost = (cost: FinancialCost): boolean =>
  Boolean(cost.id && cost.id.length <= 100) &&
  Boolean(cost.name.trim() && cost.name.trim().length <= 160) &&
  /^[a-z0-9-]{1,60}$/.test(cost.category) &&
  (!cost.customCategory || cost.customCategory.trim().length <= 80) &&
  (!cost.supplier || cost.supplier.trim().length <= 160) &&
  (!cost.documentNumber || cost.documentNumber.trim().length <= 100) &&
  Number.isSafeInteger(cost.amountCents) &&
  cost.amountCents >= 0 &&
  [0, 6, 12, 21].includes(cost.vatRate) &&
  Number.isInteger(cost.vatRecoverablePercent) &&
  cost.vatRecoverablePercent >= 0 &&
  cost.vatRecoverablePercent <= 100 &&
  ["excluding-vat", "including-vat"].includes(cost.amountMode) &&
  ["fixed", "variable"].includes(cost.behavior) &&
  (cost.kind === "one-off"
    ? cost.frequency === "once"
    : ["monthly", "quarterly", "yearly"].includes(cost.frequency)) &&
  financialDate(cost.startDate) &&
  (!cost.endDate || (financialDate(cost.endDate) && cost.endDate >= cost.startDate)) &&
  ["active", "archived"].includes(cost.status) &&
  Number.isFinite(Date.parse(cost.createdAt)) &&
  Number.isFinite(Date.parse(cost.updatedAt));

interface FinancialWorkspaceState {
  costs: FinancialCost[];
  settings: FinancialSettings;
  storeId: string | null;
  hydrated: boolean;
  loading: boolean;
  error: string | null;
  hydrate: (storeId: string, force?: boolean) => Promise<void>;
  saveCost: (cost: FinancialCost) => Promise<void>;
  archiveCost: (id: string) => Promise<void>;
  saveSettings: (settings: FinancialSettings) => Promise<void>;
  clearError: () => void;
  reset: () => void;
}

const ownerStoreId = (): string => {
  const auth = useAuth.getState();
  if (auth.currentRole !== "owner") {
    throw new Error("Alleen de eigenaar kan financiële gegevens beheren.");
  }
  if (!auth.currentStoreId) throw new Error("Er is geen actieve winkel geselecteerd.");
  return auth.currentStoreId;
};

const queuedMutation = (payload: unknown): FinancialWorkspaceMutation | null => {
  if (!payload || typeof payload !== "object") return null;
  const candidate = payload as Partial<FinancialWorkspaceMutation>;
  return typeof candidate.mutationId === "string" &&
    (candidate.entity === "cost" || candidate.entity === "settings")
    ? (candidate as FinancialWorkspaceMutation)
    : null;
};

const enqueueMutation = async (mutation: FinancialWorkspaceMutation) => {
  const timestamp = Date.now();
  await db.outbox.add({
    timestamp,
    kind: "financial_workspace_mutation",
    payload: mutation,
    attempts: 0,
    deliveryStatus: "pending",
    nextAttemptAt: timestamp,
  });
};

export const useFinancialWorkspace = create<FinancialWorkspaceState>((set, get) => ({
  costs: [],
  settings: defaultSettings(),
  storeId: null,
  hydrated: false,
  loading: false,
  error: null,

  async hydrate(storeId, force = false) {
    if (!force && get().hydrated && get().storeId === storeId) return;
    if (useAuth.getState().currentRole !== "owner") {
      set({
        costs: [],
        settings: defaultSettings(),
        storeId,
        hydrated: true,
        loading: false,
        error: null,
      });
      return;
    }
    if (useAuth.getState().currentStoreId !== storeId) {
      throw new Error("De financiële werkruimte hoort niet bij de actieve winkel.");
    }
    const tenantChanged = get().storeId !== storeId;
    set({
      loading: true,
      error: null,
      storeId,
      ...(tenantChanged
        ? { costs: [], settings: defaultSettings(), hydrated: false }
        : {}),
    });
    const demoStore = useAuth.getState().currentStoreIsDemo;
    if (demoStore) await seedDemoFinancialData();
    const [localCosts, localSettings] = await Promise.all([
      db.financial_costs.toArray(),
      db.financial_settings.get("store"),
    ]);
    if (get().storeId !== storeId) return;
    set({
      costs: localCosts.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      settings: localSettings ?? defaultSettings(),
      hydrated: true,
      loading: true,
    });

    if (demoStore || !isSupabaseConfigured || navigator.onLine === false || import.meta.env.VITE_E2E_BUILD === "true") {
      set({ loading: false });
      return;
    }

    try {
      const remote = await fetchOwnerFinancialWorkspace(storeId);
      if (get().storeId !== storeId || useAuth.getState().currentStoreId !== storeId) return;
      const pendingRows = (await db.outbox.toArray())
        .filter((entry) => entry.kind === "financial_workspace_mutation")
        .map((entry) => queuedMutation(entry.payload))
        .filter((entry): entry is FinancialWorkspaceMutation => entry != null);
      const pendingCosts = new Map(
        pendingRows
          .filter((row): row is Extract<FinancialWorkspaceMutation, { entity: "cost" }> => row.entity === "cost")
          .map((row) => [row.cost.id, row.cost]),
      );
      const pendingSettings = [...pendingRows]
        .reverse()
        .find((row): row is Extract<FinancialWorkspaceMutation, { entity: "settings" }> => row.entity === "settings")
        ?.settings;
      const mergedCosts = new Map(remote.costs.map((cost) => [cost.id, cost]));
      for (const [id, cost] of pendingCosts) mergedCosts.set(id, cost);
      const costs = [...mergedCosts.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      const settings = pendingSettings ?? remote.settings;
      await db.transaction("rw", db.financial_costs, db.financial_settings, async () => {
        await db.financial_costs.clear();
        if (costs.length > 0) await db.financial_costs.bulkPut(costs);
        await db.financial_settings.put(settings);
      });
      set({ costs, settings, loading: false, error: null });
    } catch (error) {
      set({
        loading: false,
        error:
          error instanceof Error
            ? `${error.message} Lokale financiële gegevens blijven beschikbaar.`
            : "Financiële gegevens konden niet worden gesynchroniseerd.",
      });
    }
  },

  async saveCost(cost) {
    const storeId = ownerStoreId();
    if (get().storeId && get().storeId !== storeId) {
      throw new Error("De financiële werkruimte hoort niet bij de actieve winkel.");
    }
    if (!validCost(cost)) throw new Error("De kost bevat ongeldige of onvolledige gegevens.");
    const mutation: FinancialWorkspaceMutation = {
      mutationId: crypto.randomUUID(),
      entity: "cost",
      operation: "upsert",
      cost,
    };
    if (useAuth.getState().currentStoreIsDemo) {
      await db.financial_costs.put(cost);
    } else {
      await db.transaction("rw", db.financial_costs, db.outbox, async () => {
        await db.financial_costs.put(cost);
        await enqueueMutation(mutation);
      });
    }
    set((state) => ({
      costs: [cost, ...state.costs.filter((candidate) => candidate.id !== cost.id)]
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      error: null,
    }));
  },

  async archiveCost(id) {
    ownerStoreId();
    const current = await db.financial_costs.get(id);
    if (!current) throw new Error("Deze kost bestaat niet meer.");
    const archiveDate = new Date().toISOString().slice(0, 10);
    const cost: FinancialCost = {
      ...current,
      status: "archived",
      endDate:
        current.kind === "recurring" &&
        current.startDate <= archiveDate &&
        (!current.endDate || current.endDate > archiveDate)
          ? archiveDate
          : current.endDate,
      updatedAt: new Date().toISOString(),
    };
    await get().saveCost(cost);
  },

  async saveSettings(settings) {
    const storeId = ownerStoreId();
    if (get().storeId && get().storeId !== storeId) {
      throw new Error("De financiële werkruimte hoort niet bij de actieve winkel.");
    }
    if (!Number.isSafeInteger(settings.safetyBufferCents) || settings.safetyBufferCents < 0) {
      throw new Error("Vul een geldige veiligheidsbuffer in.");
    }
    const mutation: FinancialWorkspaceMutation = {
      mutationId: crypto.randomUUID(),
      entity: "settings",
      operation: "upsert",
      settings,
    };
    if (useAuth.getState().currentStoreIsDemo) {
      await db.financial_settings.put(settings);
    } else {
      await db.transaction("rw", db.financial_settings, db.outbox, async () => {
        await db.financial_settings.put(settings);
        await enqueueMutation(mutation);
      });
    }
    set({ settings, error: null });
  },

  clearError: () => set({ error: null }),
  reset: () => set({
    costs: [],
    settings: defaultSettings(),
    storeId: null,
    hydrated: false,
    loading: false,
    error: null,
  }),
}));
