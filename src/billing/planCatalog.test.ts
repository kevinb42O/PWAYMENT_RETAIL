import { describe, expect, it } from "vitest";
import { PLAN_CATALOG, PLAN_COMPARISON_GROUPS } from "./planCatalog";

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
});
