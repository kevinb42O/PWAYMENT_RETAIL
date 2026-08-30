import { describe, expect, it } from "vitest";
import { matchesInventorySignal } from "./signalFilters";

describe("inventory signal filters", () => {
  it("keeps sold-out products out of the low-stock result", () => {
    const product = { stockQty: 0, minStockQty: 3 };

    expect(matchesInventorySignal(product, "out")).toBe(true);
    expect(matchesInventorySignal(product, "low")).toBe(false);
  });

  it("matches positive stock at or below the configured minimum", () => {
    expect(matchesInventorySignal({ stockQty: 1, minStockQty: 3 }, "low")).toBe(true);
    expect(matchesInventorySignal({ stockQty: 3, minStockQty: 3 }, "low")).toBe(true);
    expect(matchesInventorySignal({ stockQty: 4, minStockQty: 3 }, "low")).toBe(false);
  });

  it("does not flag products without a stock level or minimum", () => {
    expect(matchesInventorySignal({ stockQty: null, minStockQty: 3 }, "out")).toBe(false);
    expect(matchesInventorySignal({ stockQty: 2, minStockQty: null }, "low")).toBe(false);
  });
});
