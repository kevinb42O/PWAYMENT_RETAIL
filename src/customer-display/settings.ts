import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AcceptedPaymentMethodId } from "./protocol";

export interface CustomerDisplayConfig {
  enabled: boolean;
  idleHeadline: string;
  idleMessage: string;
  accentColor: string;
  logoUrl?: string;
  showClock: boolean;
  showVatBreakdown: boolean;
  showPaymentMethods: boolean;
  thankYouDurationSeconds: number;
  acceptedPaymentMethods: AcceptedPaymentMethodId[];
}

export const DEFAULT_CUSTOMER_DISPLAY_CONFIG: CustomerDisplayConfig = {
  enabled: false,
  idleHeadline: "Welkom",
  idleMessage: "We helpen je zo verder.",
  accentColor: "#0891b2",
  logoUrl: "",
  showClock: true,
  showVatBreakdown: false,
  showPaymentMethods: true,
  thankYouDurationSeconds: 8,
  acceptedPaymentMethods: ["cash", "card", "gift-card"],
};

const LOCAL_STORE_KEY = "__local__";

export const customerDisplayStoreKey = (storeId: string | null): string =>
  storeId?.trim() || LOCAL_STORE_KEY;

interface CustomerDisplaySettingsState {
  configsByStore: Record<string, CustomerDisplayConfig>;
  updateConfig: (
    storeId: string | null,
    patch: Partial<CustomerDisplayConfig>,
  ) => void;
  resetConfig: (storeId: string | null) => void;
}

export const useCustomerDisplaySettings =
  create<CustomerDisplaySettingsState>()(
    persist(
      (set) => ({
        configsByStore: {},
        updateConfig: (storeId, patch) =>
          set((state) => {
            const key = customerDisplayStoreKey(storeId);
            const current =
              state.configsByStore[key] ?? DEFAULT_CUSTOMER_DISPLAY_CONFIG;
            return {
              configsByStore: {
                ...state.configsByStore,
                [key]: { ...current, ...patch },
              },
            };
          }),
        resetConfig: (storeId) =>
          set((state) => {
            const key = customerDisplayStoreKey(storeId);
            const next = { ...state.configsByStore };
            delete next[key];
            return { configsByStore: next };
          }),
      }),
      {
        name: "pwayment:customer-display-settings-v1",
        version: 1,
      },
    ),
  );

export const customerDisplayConfigSnapshot = (
  storeId: string | null,
): CustomerDisplayConfig =>
  useCustomerDisplaySettings.getState().configsByStore[
    customerDisplayStoreKey(storeId)
  ] ?? DEFAULT_CUSTOMER_DISPLAY_CONFIG;
