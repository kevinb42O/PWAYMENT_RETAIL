import { describe, expect, it } from "vitest";
import { DEFAULT_MERCHANT } from "../data/merchant";
import { DEFAULT_STORE_CONFIGURATION } from "../onboarding/storeConfiguration";
import { derivePaceSetupMilestones, hasConfiguredMerchantIdentity, paceSetupProgress } from "./setupMilestones";

describe("Pace setup milestones", () => {
  it("does not treat the demo merchant identity as configured", () => {
    expect(hasConfiguredMerchantIdentity(DEFAULT_MERCHANT)).toBe(false);
  });

  it("derives progress from real catalog and merchant data", () => {
    const milestones = derivePaceSetupMilestones({
      configuration: { ...DEFAULT_STORE_CONFIGURATION, completedAt: "2026-08-23T00:00:00.000Z" },
      profile: {
        ...DEFAULT_MERCHANT,
        name: "Boekhandel De Brug",
        addressLine1: "Korenmarkt 12",
        addressLine2: "9000 Gent",
        vatNumber: "BE0123.456.789",
      },
      categories: [{ id: "books", name: "Boeken", vatRate: 6 }],
      products: [{ id: "book-1", name: "Roman", category: "books", priceCents: 1999, vatRate: 6, barcode: "9780000000001" }],
    });
    expect(milestones.every((milestone) => milestone.complete)).toBe(true);
    expect(paceSetupProgress(milestones)).toMatchObject({ percent: 100, ready: true, next: null });
  });

  it("selects the first real missing required step", () => {
    const milestones = derivePaceSetupMilestones({
      configuration: DEFAULT_STORE_CONFIGURATION,
      profile: DEFAULT_MERCHANT,
      categories: [],
      products: [],
    });
    expect(paceSetupProgress(milestones).next?.id).toBe("profile");
  });
});
