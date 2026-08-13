import { create } from "zustand";
import { persist } from "zustand/middleware";
import { supabase } from "../lib/supabase";
import {
  DEFAULT_STORE_CONFIGURATION,
  normalizeStoreConfiguration,
  type StoreConfiguration,
} from "../onboarding/storeConfiguration";
import type { Json } from "../types/database.generated";

interface StoreConfigurationState {
  configuration: StoreConfiguration;
  storeId: string | null;
  hydrated: boolean;
  saving: boolean;
  error: string | null;
  applyRemote: (value: unknown, storeId: string) => void;
  save: (
    configuration: StoreConfiguration,
    storeId?: string | null,
  ) => Promise<{ success: boolean; message?: string }>;
  markFirstRunCompleted: (storeId?: string | null) => Promise<void>;
  reset: () => void;
}

const cloneDefault = (): StoreConfiguration => ({
  ...DEFAULT_STORE_CONFIGURATION,
  modules: { ...DEFAULT_STORE_CONFIGURATION.modules },
});

export const useStoreConfiguration = create<StoreConfigurationState>()(
  persist(
    (set, get) => ({
      configuration: cloneDefault(),
      storeId: null,
      hydrated: false,
      saving: false,
      error: null,
      applyRemote(value, storeId) {
        set({
          configuration: normalizeStoreConfiguration(value),
          storeId,
          hydrated: true,
          saving: false,
          error: null,
        });
      },
      async save(configuration, requestedStoreId) {
        const normalized = normalizeStoreConfiguration(configuration);
        const storeId = requestedStoreId ?? get().storeId;
        set({
          configuration: normalized,
          storeId: storeId ?? null,
          hydrated: true,
          saving: Boolean(storeId),
          error: null,
        });

        if (!storeId || import.meta.env.VITE_E2E_BUILD === "true") {
          set({ saving: false });
          return { success: true };
        }

        const { error } = await supabase
          .from("stores")
          .update({
            industry_code: normalized.industry,
            onboarding_config: JSON.parse(
              JSON.stringify(normalized),
            ) as Json,
            onboarding_completed_at: normalized.completedAt,
          })
          .eq("id", storeId);

        if (error) {
          const message =
            "De winkelconfiguratie kon niet worden bewaard. Probeer opnieuw.";
          set({ saving: false, error: message });
          return { success: false, message };
        }

        set({ saving: false, error: null });
        return { success: true };
      },
      async markFirstRunCompleted(requestedStoreId) {
        const current = get().configuration;
        if (current.firstRunCompleted) return;
        const next = { ...current, firstRunCompleted: true };
        await get().save(next, requestedStoreId ?? get().storeId);
      },
      reset() {
        set({
          configuration: cloneDefault(),
          storeId: null,
          hydrated: false,
          saving: false,
          error: null,
        });
      },
    }),
    {
      name: "pwayment:store-configuration-v1",
      version: 1,
      partialize: (state) => ({ configuration: state.configuration }),
      merge: (persisted, current) => {
        const saved = persisted as Partial<StoreConfigurationState>;
        return {
          ...current,
          configuration: normalizeStoreConfiguration(saved.configuration),
        };
      },
    },
  ),
);
