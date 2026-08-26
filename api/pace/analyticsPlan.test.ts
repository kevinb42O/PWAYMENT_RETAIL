import { describe, expect, it } from "vitest";
import { expandPaceAnalyticsComparisons, planPaceAnalyticsQuestion, planPaceAnalyticsQuestions } from "../../src/pace/paceAnalyticsPlan";

describe("PACE selective analytics planner", () => {
  it.each([
    ["Welke dag van de week is historisch gezien de alltime beste verkoopsdag?", "sales", "revenue", "weekday", "all_time"],
    ["Op welk uur is mijn gemiddelde ticket deze maand het hoogst?", "sales", "average_ticket", "hour", "this_month"],
    ["Welke categorie leverde vorige maand de meeste brutowinst?", "sales", "gross_profit", "category", "last_month"],
    ["Toon de top 10 producten op omzet in 2025", "sales", "revenue", "product", "custom"],
    ["Welke betaalmethode gebruikten klanten de laatste 90 dagen het meest?", "sales", "transactions", "payment_method", "last_90_days"],
    ["Welke producten liggen het langst stil?", "inventory", "days_without_sale", "product", "last_30_days"],
    ["Welke voorraad raakt het eerst op?", "inventory", "days_of_cover", "product", "last_30_days"],
    ["Welke leverancier vertegenwoordigt de hoogste vastzittende kostwaarde?", "inventory", "stock_cost_value", "supplier", "last_30_days"],
    ["Wie is onze beste klant all-time?", "customers", "customer_spend", "customer", "all_time"],
    ["Welke klanten zijn al het langst niet meer langs geweest?", "customers", "customer_recency", "customer", "last_30_days"],
    ["Welke medewerker draait de meeste omzet deze maand?", "workforce", "revenue", "employee", "this_month"],
    ["Wie verkoopt het meest per gepland uur?", "workforce", "sales_per_scheduled_hour", "employee", "last_30_days"],
    ["Hoeveel webshoporders staan nog open?", "operations", "status_count", "status", "last_30_days"],
    ["Wie heeft de meeste voids gedaan?", "operations", "void_value", "employee", "last_30_days"],
    ["Waar zat het grootste kasverschil vorige maand?", "operations", "cash_difference", "employee", "last_month"],
  ])("plans %s", (question, domain, measure, dimension, period) => {
    expect(planPaceAnalyticsQuestion(question)).toMatchObject({
      domain,
      measure,
      dimension,
      period: { preset: period },
    });
  });

  it("does not turn product how-to questions into data queries", () => {
    expect(planPaceAnalyticsQuestion("Waar voeg ik een product toe?")).toBeNull();
  });

  it("bounds requested result counts", () => {
    expect(planPaceAnalyticsQuestion("Toon top 99 producten op omzet")?.limit).toBe(25);
  });

  it("ranks longest stock inactivity descending and imminent stockouts ascending", () => {
    expect(planPaceAnalyticsQuestion("Welke producten liggen het langst stil?")?.sort).toBe("desc");
    expect(planPaceAnalyticsQuestion("Welke voorraad raakt het eerst op?")?.sort).toBe("asc");
  });

  it("builds multiple independent plans for a compound question", () => {
    expect(planPaceAnalyticsQuestions("Welke dag verkoopt het beste en waar is mijn voorraad het laagst?")).toMatchObject([
      { domain: "sales" },
      { domain: "inventory" },
    ]);
  });

  it("materializes the previous period as a second bounded query", () => {
    const plan = planPaceAnalyticsQuestion("Vergelijk de omzet van deze maand met vorige maand");
    expect(plan).toMatchObject({ period: { preset: "this_month" }, comparison: "previous_period" });
    expect(expandPaceAnalyticsComparisons([plan!], new Date("2026-08-26T12:00:00Z"))).toMatchObject([
      { period: { preset: "this_month" }, comparison: "none" },
      { period: { preset: "last_month" }, comparison: "none" },
    ]);
  });

  it.each([
    ["Toon omzet van 2026-05-01 tot 2026-05-15", "2026-05-01", "2026-05-16"],
    ["Toon omzet van 01/05/2026 tot 15/05/2026", "2026-05-01", "2026-05-16"],
    ["Toon omzet van 1 mei 2026 tot 15 juni 2026", "2026-05-01", "2026-06-16"],
  ])("parses explicit inclusive date range: %s", (question, start, end) => {
    expect(planPaceAnalyticsQuestion(question)?.period).toEqual({ preset: "custom", start, end });
  });
});
