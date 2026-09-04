import { describe, expect, it } from "vitest";
import { parsePaceQuestionPlan, planPaceReadTools } from "./paceQuestionPlan";

describe("PACE Gemini question plan validation", () => {
  it("accepts a compound, bounded read-only plan", () => {
    expect(parsePaceQuestionPlan({
      version: 1,
      intent: "mixed",
      analytics: [{
        domain: "sales",
        measure: "revenue",
        dimension: "category",
        period: { preset: "this_month" },
        filters: { category: "Schoenen" },
        sort: "desc",
        limit: 500,
        comparison: "previous_period",
        rationale: "Vergelijk categorieomzet",
      }],
      record: { entity: "product", search: "SKU-42", limit: 99 },
      inventoryAction: false,
      broadContext: false,
      needsComposition: true,
      clarification: null,
      confidence: 0.94,
    })).toMatchObject({
      intent: "mixed",
      analytics: [{ domain: "sales", measure: "revenue", dimension: "category", limit: 25 }],
      record: { entity: "product", search: "SKU-42", limit: 20 },
      needsComposition: true,
      confidence: 0.94,
    });
  });

  it("rejects invented tools, metrics and incomplete custom periods", () => {
    expect(parsePaceQuestionPlan({
      version: 1,
      intent: "analytics",
      analytics: [{ domain: "finance", measure: "ebitda", dimension: "store", period: { preset: "custom", start: "2026-01-01" } }],
      record: null,
      inventoryAction: false,
      broadContext: false,
    })).toBeNull();
  });

  it("keeps search limited to the extracted entity term", () => {
    const plan = parsePaceQuestionPlan({
      version: 1,
      intent: "record",
      analytics: [],
      record: { entity: "webshop_order", search: "WEB-88", limit: 15 },
      inventoryAction: false,
      broadContext: false,
      confidence: 2,
    });
    expect(plan?.record?.search).toBe("WEB-88");
    expect(plan?.confidence).toBe(1);
  });

  it("accepts only bounded specialized read tools", () => {
    const plan = parsePaceQuestionPlan({
      version: 1,
      intent: "mixed",
      analytics: [],
      record: null,
      tools: [
        { name: "sales.vat_breakdown", period: { preset: "this_month" }, search: "", status: "", limit: 500 },
        { name: "database.run_sql", period: { preset: "all_time" }, search: "drop table", limit: 1 },
      ],
      inventoryAction: false,
      broadContext: false,
      confidence: 0.9,
    });
    expect(plan?.tools).toEqual([{
      name: "sales.vat_breakdown",
      period: { preset: "this_month" },
      search: "",
      status: "",
      limit: 25,
    }]);
    expect(plan?.needsComposition).toBe(true);
  });

  it.each([
    ["Hoeveel btw heb ik deze maand per tarief?", "sales.vat_breakdown", ""],
    ["Geef de echte splitbetalingen van vandaag", "sales.tender_breakdown", ""],
    ["Welke cadeaubonnen vervallen deze maand?", "gift_cards.summary", "expiring"],
    ["Wat is het verlofsaldo van Robin?", "workforce.leave_summary", ""],
    ["Hoeveel voorraad staat per locatie?", "inventory.location_stock", ""],
    ["Welke vaste klanten zijn afgehaakt?", "customer.margin_watch", ""],
    ["Waar geven we te veel korting weg?", "customer.margin_watch", ""],
  ])("has a safe read-tool fallback for %s", (question, name, status) => {
    expect(planPaceReadTools(question)).toMatchObject([{ name, status }]);
  });
});
