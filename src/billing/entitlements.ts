import { create } from "zustand";
import { supabase } from "../lib/supabase";
import type { Json } from "../types/database.generated";

export type PlanCode = "basic" | "pro" | "enterprise";
export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "expired";

export const FEATURE_KEYS = {
  checkout: "pos.checkout",
  zReport: "reports.z",
  historyViewer: "history.viewer",
  fullHistory: "history.full",
  activeProducts: "catalog.active_products",
  categories: "catalog.categories",
  labels: "catalog.labels",
  insights: "insights.advanced",
  inventoryForecast: "inventory.forecast",
  purchaseOrdersCreate: "purchase_orders.create",
  loyalty: "loyalty.manage",
  giftCardsIssue: "gift_cards.issue",
  webshopPublish: "webshop.publish",
  integrations: "integrations.configure",
  advancedHardware: "hardware.advanced",
  multiStore: "multi_store.manage",
  advancedTeam: "team.advanced",
  workforce: "workforce.core",
  customerDisplay: "customer_display.local",
  serviceOrders: "service.orders",
  serviceActiveOrders: "service.active_orders",
  serviceAttachments: "service.attachments",
  serviceSms: "service.notifications.sms",
  serviceTechnicianAssignment: "service.technician_assignment",
  customerCrm: "customers.crm",
  auditViewer: "audit.viewer",
  auditExport: "audit.export",
  salesInsights: "insights.sales",
  apiAccess: "api.access",
  webhooksManage: "webhooks.manage",
} as const;

export type FeatureKey = (typeof FEATURE_KEYS)[keyof typeof FEATURE_KEYS];

export interface EntitlementSnapshot {
  storedPlan: PlanCode;
  effectivePlan: PlanCode;
  status: SubscriptionStatus;
  billingCycle: "monthly" | "yearly" | null;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  currentPeriodEndsAt: string | null;
  serverNow: string;
  features: Record<string, boolean>;
  limits: Record<string, number>;
  canSimulateBilling: boolean;
  version: number;
}

interface EntitlementState {
  snapshot: EntitlementSnapshot | null;
  storeId: string | null;
  loading: boolean;
  error: string | null;
  serverOffsetMs: number;
  load: (storeId: string, force?: boolean) => Promise<void>;
  changeTestPlan: (plan: PlanCode) => Promise<EntitlementSnapshot>;
  simulateTrial: (daysRemaining: number) => Promise<EntitlementSnapshot>;
  applySnapshot: (snapshot: EntitlementSnapshot) => void;
  clear: () => void;
}

type BillingRpcName =
  | "get_store_entitlements"
  | "change_test_subscription"
  | "simulate_test_trial";

type BillingRpcClient = {
  rpc: (
    fn: BillingRpcName,
    args: Record<string, string | number>,
  ) => Promise<{ data: Json | null; error: unknown }>;
};

const billingRpc = supabase as unknown as BillingRpcClient;

const allFeatures = Object.values(FEATURE_KEYS).reduce<Record<string, boolean>>(
  (features, key) => {
    features[key] = true;
    return features;
  },
  {},
);

const fixtureSnapshot = (): EntitlementSnapshot => ({
  storedPlan: "enterprise",
  effectivePlan: "enterprise",
  status: "active",
  billingCycle: "yearly",
  trialStartedAt: null,
  trialEndsAt: null,
  currentPeriodEndsAt: null,
  serverNow: new Date().toISOString(),
  features: allFeatures,
  limits: {},
  canSimulateBilling: true,
  version: 1,
});

const basicFallbackSnapshot = (): EntitlementSnapshot => ({
  storedPlan: "basic",
  effectivePlan: "basic",
  status: "active",
  billingCycle: null,
  trialStartedAt: null,
  trialEndsAt: null,
  currentPeriodEndsAt: null,
  serverNow: new Date().toISOString(),
  features: {
    [FEATURE_KEYS.checkout]: true,
    [FEATURE_KEYS.zReport]: true,
    // A limited sales-history viewer is part of Basis. `history.full` only
    // controls the longer retention window offered by paid plans.
    [FEATURE_KEYS.historyViewer]: true,
  },
  limits: {
    [FEATURE_KEYS.activeProducts]: 250,
    [FEATURE_KEYS.categories]: 5,
  },
  canSimulateBilling: false,
  version: 0,
});

const isFixtureRuntime =
  import.meta.env.DEV ||
  import.meta.env.VITE_PRESENTATION_BUILD === "true" ||
  import.meta.env.VITE_E2E_BUILD === "true";

const asSnapshot = (value: unknown): EntitlementSnapshot => {
  if (!value || typeof value !== "object") {
    throw new Error("Ongeldige entitlementresponse.");
  }
  const candidate = value as Partial<EntitlementSnapshot>;
  if (
    !["basic", "pro", "enterprise"].includes(candidate.effectivePlan ?? "") ||
    typeof candidate.serverNow !== "string" ||
    !candidate.features ||
    !candidate.limits
  ) {
    throw new Error("Onvolledige entitlementresponse.");
  }
  return candidate as EntitlementSnapshot;
};

const offsetFor = (snapshot: EntitlementSnapshot): number => {
  const serverTime = Date.parse(snapshot.serverNow);
  return Number.isFinite(serverTime) ? serverTime - Date.now() : 0;
};

export const useEntitlements = create<EntitlementState>((set, get) => ({
  snapshot: isFixtureRuntime ? fixtureSnapshot() : null,
  storeId: null,
  loading: false,
  error: null,
  serverOffsetMs: 0,
  async load(storeId, force = false) {
    if (!force && get().storeId === storeId && get().snapshot) return;
    if (isFixtureRuntime && !import.meta.env.VITE_SUPABASE_URL) {
      const snapshot = fixtureSnapshot();
      set({ snapshot, storeId, loading: false, error: null, serverOffsetMs: 0 });
      return;
    }
    set({ loading: true, error: null, storeId });
    const { data, error } = await billingRpc.rpc("get_store_entitlements", {
      target_store_id: storeId,
    });
    if (error) {
      set({
        snapshot: basicFallbackSnapshot(),
        loading: false,
        error: "Abonnementsstatus kon niet worden gecontroleerd.",
        serverOffsetMs: 0,
      });
      throw error;
    }
    const snapshot = asSnapshot(data);
    set({
      snapshot,
      loading: false,
      error: null,
      serverOffsetMs: offsetFor(snapshot),
    });
  },
  async changeTestPlan(plan) {
    const { storeId } = get();
    if (!storeId) throw new Error("Geen actieve winkel.");
    const { data, error } = await billingRpc.rpc("change_test_subscription", {
      target_store_id: storeId,
      target_plan: plan,
    });
    if (error) throw error;
    const snapshot = asSnapshot(data);
    get().applySnapshot(snapshot);
    return snapshot;
  },
  async simulateTrial(daysRemaining) {
    const { storeId } = get();
    if (!storeId) throw new Error("Geen actieve winkel.");
    const { data, error } = await billingRpc.rpc("simulate_test_trial", {
      target_store_id: storeId,
      days_remaining: daysRemaining,
    });
    if (error) throw error;
    const snapshot = asSnapshot(data);
    get().applySnapshot(snapshot);
    return snapshot;
  },
  applySnapshot(snapshot) {
    set({
      snapshot,
      loading: false,
      error: null,
      serverOffsetMs: offsetFor(snapshot),
    });
  },
  clear() {
    set({
      snapshot: isFixtureRuntime ? fixtureSnapshot() : null,
      storeId: null,
      loading: false,
      error: null,
      serverOffsetMs: 0,
    });
  },
}));

export const canUseFeature = (feature: FeatureKey): boolean =>
  isFeatureEnabledForSnapshot(useEntitlements.getState().snapshot, feature);

export const featureLimit = (feature: FeatureKey): number | null => {
  const snapshot = useEntitlements.getState().snapshot;
  if (!snapshot || isTrialExpiredLocally(snapshot)) {
    if (feature === FEATURE_KEYS.activeProducts) return 250;
    if (feature === FEATURE_KEYS.categories) return 5;
    return null;
  }
  return snapshot.limits[feature] ?? null;
};

export const entitlementNow = (): number =>
  Date.now() + useEntitlements.getState().serverOffsetMs;

export const isTrialExpiredLocally = (
  snapshot: EntitlementSnapshot | null,
  now = entitlementNow(),
): boolean =>
  snapshot?.status === "trialing" &&
  Boolean(snapshot.trialEndsAt) &&
  Date.parse(snapshot.trialEndsAt as string) <= now;

export const isFeatureEnabledForSnapshot = (
  snapshot: EntitlementSnapshot | null,
  feature: FeatureKey,
  now = entitlementNow(),
): boolean => {
  if (!snapshot || isTrialExpiredLocally(snapshot, now)) {
    return feature === FEATURE_KEYS.checkout ||
      feature === FEATURE_KEYS.zReport ||
      feature === FEATURE_KEYS.historyViewer;
  }
  // Older API deployments do not yet return this newly separated capability.
  // Basis still contractually includes the 30-day viewer, so never hide it
  // while the database migration is rolling out.
  if (feature === FEATURE_KEYS.historyViewer && snapshot.effectivePlan === "basic") {
    return true;
  }
  return snapshot.features[feature] === true;
};

export const trialMillisecondsRemaining = (
  snapshot: EntitlementSnapshot | null,
): number | null => {
  if (!snapshot?.trialEndsAt || snapshot.status !== "trialing") return null;
  return Math.max(0, Date.parse(snapshot.trialEndsAt) - entitlementNow());
};

export const trialDaysRemaining = (
  snapshot: EntitlementSnapshot | null,
): number | null => {
  const remaining = trialMillisecondsRemaining(snapshot);
  return remaining == null ? null : Math.max(0, Math.ceil(remaining / 86_400_000));
};

export const planLabel = (plan: PlanCode): string =>
  plan === "basic"
    ? "Pwayment Basis"
    : plan === "pro"
      ? "Retail Professional"
      : "Enterprise & Ketens";
