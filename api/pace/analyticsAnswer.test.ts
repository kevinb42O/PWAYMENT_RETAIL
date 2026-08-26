import { describe, expect, it } from "vitest";
import { renderPaceAnalyticsAnswer } from "../../src/pace/paceAnalyticsAnswer";

describe("PACE deterministic analytics answer", () => {
  it("renders ranked facts as visible nested bullets", () => {
    const answer = renderPaceAnalyticsAnswer([{
      query: { version: 1, domain: "sales", measure: "revenue", dimension: "weekday", period: { preset: "all_time" }, filters: {}, sort: "desc", limit: 5, comparison: "none", rationale: "test" },
      period: { preset: "all_time" },
      basis: "finalized sales by active trading day",
      dataQuality: { costCoveragePercent: 91.2 },
      rows: [
        { label: "zaterdag", metricValue: 125000, revenueCents: 500000, transactionCount: 80, tradingDays: 4, averageTicketCents: 6250 },
        { label: "vrijdag", metricValue: 98000, revenueCents: 490000, transactionCount: 70, tradingDays: 5, averageTicketCents: 7000 },
      ],
    }]);

    expect(answer).toContain("## Antwoord");
    expect(answer).toContain("zaterdag heeft de hoogste gemiddelde dagomzet: € 1.250,00");
    expect(answer).toContain("- zaterdag\n  - Gemiddelde dagomzet: € 1.250,00");
    expect(answer).toContain("## Onderbouwing");
    expect(answer).toContain("Periode: volledige historiek");
  });

  it("states an exact empty-result boundary", () => {
    expect(renderPaceAnalyticsAnswer([{
      query: { version: 1, domain: "customers", measure: "customer_spend", dimension: "customer", period: { preset: "last_month" }, filters: {}, sort: "desc", limit: 5, comparison: "none", rationale: "test" },
      period: { preset: "last_month" },
      rows: [],
    }])).toContain("Geen resultaten voor vorige maand binnen de gekozen filters.");
  });

  it("falls back to AI when analytics are unavailable", () => {
    expect(renderPaceAnalyticsAnswer([{ unavailable: true }])).toBeNull();
  });
});
