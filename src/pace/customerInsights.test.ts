import { describe, expect, it } from "vitest";
import type { CommercialReturnPolicy, CustomerInsightSettings, PaceRecommendationRule } from "../data/merchant";
import type { Product, Transaction } from "../types";
import { buildCustomerInsights } from "./customerInsights";

const customerId = "customer-1";
const now = Date.parse("2026-08-24T10:00:00.000Z");
const policy: CommercialReturnPolicy = {
  enabled: true,
  windowDays: 14,
  reminderLeadDays: 2,
  excludedProductTypes: ["service", "gift-card"],
  excludedCategoryIds: [],
  effectiveFrom: "2026-01-01T00:00:00.000Z",
};
const settings: CustomerInsightSettings = {
  enabled: true,
  returnRemindersEnabled: true,
  brandAffinityEnabled: true,
  brandLookbackDays: 540,
  minimumBrandTransactions: 2,
};
const blazer: Product = {
  id: "blazer-m",
  name: "Blazer",
  category: "fashion",
  priceCents: 19900,
  vatRate: 21,
  brand: "Samsoe Samsoe",
  variantOptions: { Maat: "M" },
  stockQty: 4,
};
const scarf: Product = {
  id: "scarf-blue",
  name: "Wollen sjaal",
  category: "accessories",
  priceCents: 5900,
  vatRate: 21,
  brand: "Samsoe Samsoe",
  stockQty: 2,
};
const recommendationRule: PaceRecommendationRule = {
  id: "blazer-to-scarf",
  name: "Maak de blazerlook compleet",
  enabled: true,
  trigger: { kind: "product", value: blazer.id },
  recommendation: { kind: "category", value: scarf.category },
  reason: "Een sjaal combineert met deze blazer.",
  priority: 72,
  validFrom: "2026-08-01T00:00:00.000Z",
  validUntil: "2026-08-31T23:59:59.999Z",
  scope: "store",
};
const sale = (id: number, timestamp: number, product: Product = blazer): Transaction => ({
  id,
  clientRequestId: `sale-${id}`,
  tableId: 1,
  items: [{ lineId: `line-${id}`, product, quantity: 1 }],
  subtotalCents: product.priceCents,
  vat12Cents: 0,
  vat21Cents: 3453,
  totalCents: product.priceCents,
  discountCents: 0,
  paymentMethod: "PIN",
  timestamp,
  isFinalized: 1,
  customerId,
  source: "live",
  kind: "sale",
  merchantSnapshot: { name: "Winkel", addressLine1: "", addressLine2: "", vatNumber: "", commercialReturnPolicy: policy },
});

describe("Pace customer insight engine", () => {
  it("shows an exact final-day reminder from the frozen sale policy", () => {
    const original = sale(1, Date.parse("2026-08-10T15:00:00.000Z"));
    const insights = buildCustomerInsights({ customerId, transactions: [original], products: [blazer], policy, settings, now });
    expect(insights[0]).toMatchObject({ kind: "return-window", priority: 88, title: "Retourtermijn eindigt vandaag" });
    expect(insights[0].compact).toContain("maat M");
  });

  it("removes a fully returned line even before day close", () => {
    const original = sale(1, Date.parse("2026-08-10T15:00:00.000Z"));
    const refund: Transaction = {
      ...sale(2, now),
      items: original.items,
      kind: "refund",
      originalTransactionId: 1,
      isFinalized: 0,
      totalCents: -original.totalCents,
    };
    const insights = buildCustomerInsights({ customerId, transactions: [original, refund], products: [blazer], policy, settings, now });
    expect(insights.some((insight) => insight.kind === "return-window")).toBe(false);
  });

  it("requires separate net purchases and available stock for brand interest", () => {
    const rows = [
      sale(1, Date.parse("2026-05-10T12:00:00.000Z")),
      sale(2, Date.parse("2026-07-10T12:00:00.000Z")),
    ];
    const insights = buildCustomerInsights({ customerId, transactions: rows, products: [blazer], policy, settings, now });
    expect(insights.find((insight) => insight.kind === "brand-affinity")).toMatchObject({
      title: "Terugkerende interesse in Samsoe Samsoe",
      priority: 55,
    });
  });

  it("stays silent when the store has not opted in", () => {
    const insights = buildCustomerInsights({
      customerId,
      transactions: [sale(1, now)],
      products: [blazer],
      policy,
      settings: { ...settings, enabled: false },
      now,
    });
    expect(insights).toEqual([]);
  });

  it("turns an active retailer rule into a stock-backed catalog action", () => {
    const insights = buildCustomerInsights({
      customerId,
      transactions: [sale(8, Date.parse("2026-08-12T12:00:00.000Z"))],
      products: [blazer, scarf],
      policy,
      settings,
      recommendationRules: [recommendationRule],
      now,
    });
    expect(insights.find((insight) => insight.kind === "recommendation-rule")).toMatchObject({
      title: "Maak de blazerlook compleet",
      reason: "Een sjaal combineert met deze blazer.",
      action: { kind: "catalog", productIds: [scarf.id] },
      evidence: [{ transactionId: 8, productId: blazer.id, ruleId: recommendationRule.id }],
    });
  });

  it("does not emit expired rules or recommendations without available stock", () => {
    const rows = [sale(9, Date.parse("2026-08-12T12:00:00.000Z"))];
    const expired = { ...recommendationRule, validUntil: "2026-08-20T23:59:59.999Z" };
    const outOfStock = { ...scarf, stockQty: 0 };
    expect(buildCustomerInsights({ customerId, transactions: rows, products: [blazer, scarf], policy, settings, recommendationRules: [expired], now }).some((insight) => insight.kind === "recommendation-rule")).toBe(false);
    expect(buildCustomerInsights({ customerId, transactions: rows, products: [blazer, outOfStock], policy, settings, recommendationRules: [recommendationRule], now }).some((insight) => insight.kind === "recommendation-rule")).toBe(false);
  });
});
