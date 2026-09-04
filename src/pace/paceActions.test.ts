import { describe, expect, it } from "vitest";
import { parsePaceReplenishmentActionResult } from "./paceActions";

describe("Pace confirmed action result", () => {
  it("accepts only a bounded, internally consistent action result", () => {
    expect(parsePaceReplenishmentActionResult({
      createdOrderIds: ["po-1"], createdOrderCount: 1, createdItemCount: 3,
      skipped: [{ reason: "supplier_missing" }], message: "Concept klaar.",
    })).toEqual({ createdOrderIds: ["po-1"], createdOrderCount: 1, createdItemCount: 3, skippedCount: 1, message: "Concept klaar." });
    expect(parsePaceReplenishmentActionResult({ createdOrderIds: ["po-1"], createdOrderCount: 2, message: "Onmogelijk" })).toBeNull();
  });
});
