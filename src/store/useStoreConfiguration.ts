import { create } from "zustand";
import { persist } from "zustand/middleware";
import { supabase } from "../lib/supabase";
import {
  DEFAULT_STORE_CONFIGURATION,
  normalizeStoreConfiguration,
  withConfiguredModule,
  type ConfigurableModule,
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
  setModuleEnabled: (
    module: ConfigurableModule,
    enabled: boolean,
    storeId?: string | null,
  ) => Promise<{ success: boolean; message?: string }>;
  markFirstRunCompleted: (storeId?: string | null) => Promise<void>;
  reset: () => void;
}

const cloneDefault = (): StoreConfiguration => ({
  ...DEFAULT_STORE_CONFIGURATION,
  modules: { ...DEFAULT_STORE_CONFIGURATION.modules },
  capabilities: { ...DEFAULT_STORE_CONFIGURATION.capabilities },
});

let moduleSaveQueue: Promise<void> = Promise.resolve();
let moduleSaveRevision = 0;

const persistenceError =
  "De winkelinstellingen konden niet worden bewaard. Controleer uw verbinding en probeer opnieuw.";

const serializeConfiguration = (configuration: StoreConfiguration): Json =>
  JSON.parse(JSON.stringify(configuration)) as Json;

const saveRetailProfile = (
  storeId: string,
  configuration: StoreConfiguration,
) =>
  supabase.rpc("save_store_retail_profile", {
    target_store_id: storeId,
    profile_payload: serializeConfiguration(configuration),
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

        const { error } = await saveRetailProfile(storeId, normalized);

        if (error) {
          const message =
            "De winkelconfiguratie kon niet worden bewaard. Probeer opnieuw.";
          set({ saving: false, error: message });
          return { success: false, message };
        }

        set({ saving: false, error: null });
        return { success: true };
      },
      async setModuleEnabled(module, enabled, requestedStoreId) {
        const storeId = requestedStoreId ?? get().storeId;
        const next = withConfiguredModule(get().configuration, module, enabled);
        const revision = ++moduleSaveRevision;

        set({
          configuration: next,
          storeId: storeId ?? null,
          hydrated: true,
          saving: Boolean(storeId),
          error: null,
        });

        if (!storeId || import.meta.env.VITE_E2E_BUILD === "true") {
          if (revision === moduleSaveRevision) {
            set({
              configuration: next,
              storeId: storeId ?? null,
              hydrated: true,
              saving: false,
              error: null,
            });
          }
          return { success: true };
        }

        let result: { success: boolean; message?: string } = { success: true };
        const persist = async () => {
          const { error } = await saveRetailProfile(storeId, next);

          if (error) {
            result = { success: false, message: persistenceError };
            if (revision === moduleSaveRevision) {
              set({ saving: false, error: persistenceError });
            }
            return;
          }

          if (revision === moduleSaveRevision) {
            set({ saving: false, error: null });
          }
        };

        const operation = moduleSaveQueue.then(persist, persist);
        moduleSaveQueue = operation.then(
          () => undefined,
          () => undefined,
        );
        await operation;
        return result;
      },
      async markFirstRunCompleted(requestedStoreId) {
        const current = get().configuration;
        if (current.firstRunCompleted) return;
        const next = { ...current, firstRunCompleted: true };
        await get().save(next, requestedStoreId ?? get().storeId);
      },
      reset() {
        moduleSaveRevision += 1;
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
