import { afterEach, describe, expect, it, vi } from "vitest";
import {
  canUseFeature,
  featureLimit,
  FEATURE_KEYS,
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
});
