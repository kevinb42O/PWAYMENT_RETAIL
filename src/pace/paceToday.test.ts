import { describe, expect, it } from "vitest";
import { buildPaceReplenishmentProposal, parsePaceTodayBriefing, parsePaceReplenishmentRows } from "./paceToday";

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
});
