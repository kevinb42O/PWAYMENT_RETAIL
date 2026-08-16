import { afterEach, describe, expect, it, vi } from "vitest";
import { supabase } from "../lib/supabase";
import {
  canUseFeature,
  entitlementNow,
  featureLimit,
  FEATURE_KEYS,
  isFeatureEnabledForSnapshot,
  planLabel,
  trialDaysRemaining,
  trialMillisecondsRemaining,
  type EntitlementSnapshot,
  useEntitlements,
} from "./entitlements";

const expiredTrial = (): EntitlementSnapshot => ({
  storedPlan: "pro",
  effectivePlan: "pro",
  status: "trialing",
  billingCycle: null,
  trialStartedAt: "2026-07-01T00:00:00.000Z",
  trialEndsAt: "2026-07-31T00:00:00.000Z",
  currentPeriodEndsAt: null,
  serverNow: "2026-07-31T00:00:01.000Z",
  features: Object.fromEntries(Object.values(FEATURE_KEYS).map((key) => [key, true])),
  limits: {},
  canSimulateBilling: true,
  version: 1,
});

describe("temporal entitlement enforcement", () => {
  afterEach(() => {
    vi.useRealTimers();
    useEntitlements.getState().clear();
  });

  it("falls back to Basic features and limits before the refresh RPC returns", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-31T00:00:01.000Z"));
    useEntitlements.setState({ snapshot: expiredTrial(), serverOffsetMs: 0 });

    expect(canUseFeature(FEATURE_KEYS.workforce)).toBe(false);
    expect(canUseFeature(FEATURE_KEYS.checkout)).toBe(true);
    expect(featureLimit(FEATURE_KEYS.activeProducts)).toBe(250);
    expect(featureLimit(FEATURE_KEYS.categories)).toBe(5);
  });

  it("loads server entitlements, applies time offset, and exposes plan labels", async () => {
    const snapshot = {
      ...expiredTrial(),
      status: "active" as const,
      serverNow: new Date(Date.now() + 5000).toISOString(),
      limits: { [FEATURE_KEYS.activeProducts]: 500 },
    };
    const rpc = vi.spyOn(supabase, "rpc").mockResolvedValue({ data: snapshot, error: null } as never);
    await useEntitlements.getState().load("store-1", true);

    expect(rpc).toHaveBeenCalledWith("get_store_entitlements", { target_store_id: "store-1" });
    expect(useEntitlements.getState().snapshot).toEqual(snapshot);
    expect(entitlementNow()).toBeGreaterThan(Date.now());
    expect(featureLimit(FEATURE_KEYS.activeProducts)).toBe(500);
    expect(planLabel("basic")).toBe("Pwayment Basis");
    expect(planLabel("pro")).toBe("Retail Professional");
    expect(planLabel("enterprise")).toBe("Enterprise & Ketens");
  });

  it("fails closed when the subscription RPC is unavailable or malformed", async () => {
    const rpc = vi.spyOn(supabase, "rpc");
    rpc.mockResolvedValueOnce({ data: null, error: new Error("offline") } as never);
    await expect(useEntitlements.getState().load("store-1", true)).rejects.toThrow("offline");
    expect(useEntitlements.getState()).toMatchObject({
      error: "Abonnementsstatus kon niet worden gecontroleerd.",
      snapshot: { effectivePlan: "basic" },
    });

    rpc.mockResolvedValueOnce({ data: { effectivePlan: "invalid" }, error: null } as never);
    await expect(useEntitlements.getState().load("store-1", true)).rejects.toThrow("Onvolledige");
  });

  it("keeps the 30-day history viewer available in the Basic fallback", async () => {
    vi.spyOn(supabase, "rpc").mockResolvedValue({ data: null, error: new Error("offline") } as never);
    await expect(useEntitlements.getState().load("store-1", true)).rejects.toThrow("offline");

    expect(canUseFeature(FEATURE_KEYS.historyViewer)).toBe(true);
    expect(canUseFeature(FEATURE_KEYS.fullHistory)).toBe(false);
    expect(canUseFeature(FEATURE_KEYS.auditViewer)).toBe(false);
  });

  it("does not hide Basic history while the entitlement migration is rolling out", () => {
    const preMigrationBasic = {
      ...expiredTrial(),
      storedPlan: "basic" as const,
      effectivePlan: "basic" as const,
      status: "active" as const,
      features: {
        [FEATURE_KEYS.checkout]: true,
        [FEATURE_KEYS.zReport]: true,
      },
    };

    expect(isFeatureEnabledForSnapshot(preMigrationBasic, FEATURE_KEYS.historyViewer)).toBe(true);
    expect(isFeatureEnabledForSnapshot(preMigrationBasic, FEATURE_KEYS.fullHistory)).toBe(false);
  });

  it("keeps Historiek available even if a plan response marks its legacy flag false", () => {
    const incompletePlanResponse = {
      ...expiredTrial(),
      status: "active" as const,
      effectivePlan: "pro" as const,
      features: {
        [FEATURE_KEYS.checkout]: true,
        [FEATURE_KEYS.zReport]: true,
        [FEATURE_KEYS.historyViewer]: false,
      },
    };

    expect(isFeatureEnabledForSnapshot(incompletePlanResponse, FEATURE_KEYS.historyViewer)).toBe(true);
  });

  it("requires an active store for billing mutations and computes trial time deterministically", async () => {
    useEntitlements.getState().clear();
    await expect(useEntitlements.getState().changeTestPlan("pro")).rejects.toThrow("Geen actieve winkel");
    await expect(useEntitlements.getState().simulateTrial(2)).rejects.toThrow("Geen actieve winkel");

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-30T00:00:00.000Z"));
    const snapshot = expiredTrial();
    snapshot.trialEndsAt = "2026-08-01T00:00:00.000Z";
    expect(trialMillisecondsRemaining(snapshot)).toBe(172_800_000);
    expect(trialDaysRemaining(snapshot)).toBe(2);
    expect(isFeatureEnabledForSnapshot(null, FEATURE_KEYS.checkout)).toBe(true);
    expect(isFeatureEnabledForSnapshot(null, FEATURE_KEYS.workforce)).toBe(false);
  });
});
