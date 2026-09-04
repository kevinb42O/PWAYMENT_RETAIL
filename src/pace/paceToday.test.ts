import { describe, expect, it } from "vitest";
import { buildPaceReplenishmentProposal, parsePaceCustomerMarginWatch, parsePacePredictiveReplenishment, parsePaceTodayBriefing, parsePaceReplenishmentRows, parsePaceTodayOperationalQueues } from "./paceToday";

describe("Pace today briefing contracts", () => {
  it("accepts only safe, presentational briefing fields and orders by priority", () => {
    expect(parsePaceTodayBriefing({
      generatedAt: "2026-09-04T10:00:00Z",
      items: [
        { id: "later", priority: 2, title: "Later", detail: "Detail", nextQuestion: "Vraag?", unexpected: "ignored" },
        { id: "first", priority: 1, title: "Eerst" },
        { title: "Geen stabiel id" },
      ],
    })).toEqual({
      generatedAt: "2026-09-04T10:00:00Z",
      timezone: null,
      basis: null,
      items: [
        { id: "first", priority: 1, title: "Eerst", detail: "Controleer dit aandachtspunt in de winkelgegevens.", nextQuestion: "" },
        { id: "later", priority: 2, title: "Later", detail: "Detail", nextQuestion: "Vraag?" },
      ],
    });
  });

  it("calculates a review-only quantity to the existing minimum stock", () => {
    const rows = parsePaceReplenishmentRows({ rows: [
      { id: "a", name: "A", stockQty: 2, minStockQty: 5 },
      { id: "b", name: "B", stockQty: 5, minStockQty: 5 },
      { id: "c", name: "C", stockQty: 8, minStockQty: 5 },
    ] });
    expect(buildPaceReplenishmentProposal(rows)).toEqual(expect.objectContaining({ productCount: 2, quantityToMinimum: 3 }));
  });

  it("keeps operational queue cards bounded and excludes private order payloads", () => {
    expect(parsePaceTodayOperationalQueues({
      basis: "bounded queues",
      webshopOrders: [{ id: "web-1", number: "WEB-1", fulfillmentStatus: "unfulfilled", deliveryMode: "pickup", totalCents: 4999, customer: "excluded" }],
      blockedServiceOrders: [{ id: "service-1", number: "SVC-1", assetType: "Telefoon", route: "external-repair", substatus: "Wacht op leverancier", customerName: "excluded" }],
    })).toEqual({
      basis: "bounded queues",
      webshopOrders: [{ id: "web-1", number: "WEB-1", fulfillmentStatus: "unfulfilled", deliveryMode: "pickup", totalCents: 4999, createdAt: null }],
      blockedServiceOrders: [{ id: "service-1", number: "SVC-1", assetType: "Telefoon", route: "external-repair", substatus: "Wacht op leverancier", updatedAt: null }],
    });
  });

  it("keeps Customer Radar and Margin Watch presentational and drops contact data", () => {
    expect(parsePaceCustomerMarginWatch({
      basis: "finalized sales only",
      dataQuality: { customerAttributionPercent: 62.5, costCoveragePercent: 84, marginReady: true },
      customerSignals: [{ kind: "lapsed_loyal", id: "customer-1", name: "An", title: "Niet gezien", detail: "3 bezoeken", visits: 3, totalSpendCents: 32000, daysSinceVisit: 72, nextQuestion: "Wie haakt af?", priority: 1, email: "not-exposed@example.test" }],
      marginSignals: [{ kind: "low_margin_product", id: "product-1", name: "Artikel", title: "Lage marge", detail: "18%", amountCents: 12500, ratioPercent: 18, nextQuestion: "Welke marge?", priority: 1, costPriceCents: 9999 }],
    })).toEqual({
      basis: "finalized sales only",
      customerAttributionPercent: 62.5,
      costCoveragePercent: 84,
      marginReady: true,
      customerSignals: [{ kind: "lapsed_loyal", id: "customer-1", name: "An", title: "Niet gezien", detail: "3 bezoeken", visits: 3, totalSpendCents: 32000, daysSinceVisit: 72, nextQuestion: "Wie haakt af?", priority: 1 }],
      marginSignals: [{ kind: "low_margin_product", id: "product-1", name: "Artikel", title: "Lage marge", detail: "18%", amountCents: 12500, ratioPercent: 18, nextQuestion: "Welke marge?", priority: 1 }],
    });
  });

  it("accepts only bounded predictive replenishment facts", () => {
    expect(parsePacePredictiveReplenishment({ rows: [{
      id: "product-1", name: "Wielen", stockQty: 3, openOrderQty: 0, units30Days: 12,
      leadTimeDays: 10, daysOfCover: 7, targetStockQty: 8, recommendedQty: 5,
      confidence: "high", risk: "stockout_before_delivery", supplierTerms: "excluded",
    }] })).toEqual({ basis: null, rows: [{
      id: "product-1", name: "Wielen", variant: null, stockQty: 3, openOrderQty: 0, units30Days: 12,
      leadTimeDays: 10, daysOfCover: 7, targetStockQty: 8, recommendedQty: 5,
      confidence: "high", risk: "stockout_before_delivery",
    }] });
  });
});
