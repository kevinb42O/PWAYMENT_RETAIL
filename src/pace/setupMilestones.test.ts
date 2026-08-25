import { describe, expect, it } from "vitest";
import { DEFAULT_MERCHANT } from "../data/merchant";
import { DEFAULT_STORE_CONFIGURATION } from "../onboarding/storeConfiguration";
import { derivePaceSetupMilestones, hasConfiguredMerchantIdentity, hasEstablishedCatalog, isValidBelgianVatNumber, paceSetupProgress } from "./setupMilestones";

describe("Pace setup milestones", () => {
  it("does not treat the demo merchant identity as configured", () => {
    expect(hasConfiguredMerchantIdentity(DEFAULT_MERCHANT)).toBe(false);
  });

  it("accepts Belgian VAT numbers regardless of punctuation grouping", () => {
    expect(isValidBelgianVatNumber("BE07.23.456789")).toBe(true);
    expect(isValidBelgianVatNumber("BE 0723 456 789")).toBe(true);
    expect(isValidBelgianVatNumber("BE0723456789")).toBe(true);
    expect(isValidBelgianVatNumber("NL0723456789")).toBe(false);
    expect(isValidBelgianVatNumber("BE723456789")).toBe(false);
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

  it("recognizes an established legacy store without onboarding metadata", () => {
    const categories = [{ id: "boards", name: "Boards", vatRate: 21 }];
    const products = [{ id: "board-1", name: "Deck", category: "boards", priceCents: 6995, vatRate: 21, stockQty: 8 }];
    expect(hasEstablishedCatalog({ categories, products })).toBe(true);

    const milestones = derivePaceSetupMilestones({
      configuration: { ...DEFAULT_STORE_CONFIGURATION, completedAt: null },
      profile: {
        ...DEFAULT_MERCHANT,
        name: "Boardshop",
        addressLine1: "Kerkstraat 1",
        addressLine2: "2000 Antwerpen",
        vatNumber: "BE07.23.456789",
      },
      categories,
      products,
    });
    expect(paceSetupProgress(milestones)).toMatchObject({ percent: 100, ready: true, next: null });
  });

  it("does not treat orphaned or incomplete products as an established catalog", () => {
    const categories = [{ id: "boards", name: "Boards", vatRate: 21 }];
    expect(hasEstablishedCatalog({ categories, products: [] })).toBe(false);
    expect(hasEstablishedCatalog({
      categories,
      products: [{ id: "orphan", name: "Deck", category: "missing", priceCents: 6995, vatRate: 21 }],
    })).toBe(false);
  });
});
