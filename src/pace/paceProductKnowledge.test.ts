import { describe, expect, it } from "vitest";
import { PACE_PRODUCT_KNOWLEDGE, retrievePaceKnowledge } from "./paceProductKnowledge";

describe("Pace product knowledge retrieval", () => {
  it("covers the complete merchant product surface", () => {
    expect(PACE_PRODUCT_KNOWLEDGE.map((chunk) => chunk.id)).toEqual(expect.arrayContaining([
      "pos-cart-checkout", "history-returns-invoices", "daily-close-reporting",
      "catalog-variants-inventory", "insights-forecast-purchasing", "customers-loyalty-giftcards",
      "webshop-orders", "service-desk", "workforce", "integration-migration", "offline-sync",
      "setup-subscriptions-modules", "payments-hardware-boundary",
    ]));
  });

  it("retrieves relevant knowledge and always keeps safety/data interpretation", () => {
    const result = retrievePaceKnowledge("Waarom kan ik één artikel niet retourneren naar verkoopbare voorraad?");
    expect(result.map((chunk) => chunk.id)).toContain("history-returns-invoices");
    expect(result.map((chunk) => chunk.id)).toContain("platform-boundaries");
    expect(result.map((chunk) => chunk.id)).toContain("data-interpretation");
  });

  it("retrieves workforce knowledge without loading the whole corpus", () => {
    const result = retrievePaceKnowledge("Hoe keur ik een verlofaanvraag goed met coverage?");
    expect(result[0].id).toBe("workforce");
    expect(result.length).toBeLessThan(PACE_PRODUCT_KNOWLEDGE.length);
  });
});
