import { describe, expect, it } from "vitest";
import {
  PLAN_CATALOG,
  PLAN_COMPARISON_GROUPS,
  formatEuroCents,
  formatPlanMonthlyPrice,
  planPriceCents,
  yearlySavingsCents,
  yearlyTotalCents,
} from "./planCatalog";

describe("billing plan catalog", () => {
  it("publishes the differentiating Professional capabilities", () => {
    expect(PLAN_CATALOG.pro.features.join(" ")).toMatch(/klantendisplay/i);
    expect(PLAN_CATALOG.pro.features.join(" ")).toMatch(/ServiceDesk/i);
  });

  it("keeps Enterprise capabilities out of Professional in the shared matrix", () => {
    const rows = PLAN_COMPARISON_GROUPS.flatMap((group) => group.rows);
    expect(rows.find((row) => row.label.startsWith("Workforce"))?.pro).toBe("—");
    expect(rows.find((row) => row.label === "AI-voorraadprognose")?.pro).toBe("—");
    expect(rows.find((row) => row.label === "Volledige auditviewer en export")?.pro).toBe("—");
  });

  it("keeps monthly, yearly and savings amounts internally consistent", () => {
    expect(planPriceCents("pro", "monthly")).toBe(6900);
    expect(planPriceCents("pro", "yearly")).toBe(5500);
    expect(yearlyTotalCents("enterprise")).toBe(142800);
    expect(yearlySavingsCents("basic")).toBe(0);
    expect(yearlySavingsCents("pro")).toBe(16800);
    expect(formatPlanMonthlyPrice("basic", "monthly")).toBe("€ 0");
    expect(formatPlanMonthlyPrice("enterprise", "yearly")).toBe("€ 119");
    expect(formatEuroCents(12345)).toBe("€ 123");
  });
});
