import { describe, expect, it } from "vitest";
import { inheritConversationPlan } from "./conversationMemory";

describe("PACE conversation query-frame inheritance", () => {
  it("keeps the previous metric and replaces only an explicit follow-up period", () => {
    const previous = { version: 1, lastQueryFrame: { analytics: [{
      version: 1, domain: "sales", measure: "revenue", dimension: "product", period: { preset: "this_month" },
      filters: { search: "Sneaker" }, sort: "desc", limit: 5, comparison: "none", rationale: "eerste vraag",
    }], record: null, tools: [] } };
    const result = inheritConversationPlan("En vorige maand?", previous, { analytics: [], record: null, tools: [] });
    expect(result.analytics[0]).toMatchObject({ measure: "revenue", dimension: "product", period: { preset: "last_month" }, filters: { search: "Sneaker" } });
  });

  it("does not inherit for an unrelated new question", () => {
    const result = inheritConversationPlan("Hoe werkt een retour?", { lastQueryFrame: { analytics: [{ measure: "revenue" }] } }, { analytics: [], record: null, tools: [] });
    expect(result.analytics).toEqual([]);
  });
});
