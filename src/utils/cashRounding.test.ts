import { describe, expect, it } from "vitest";
import {
  cashRoundingAdjustmentCents,
  roundCashSettlementCents,
  settlementTotalCents,
} from "./cashRounding";

describe("Belgian cash rounding", () => {
  it.each([
    [1, 1, 0],
    [2, 2, 0],
    [3, 3, 0],
    [4, 4, 0],
    [5, 5, 0],
    [6, 5, -1],
    [7, 5, -2],
    [8, 10, 2],
    [9, 10, 1],
    [1000, 1000, 0],
    [1001, 1000, -1],
    [1002, 1000, -2],
    [1003, 1005, 2],
    [1004, 1005, 1],
    [1005, 1005, 0],
  ])("rounds %ic to %ic with an adjustment of %ic", (commercial, settled, adjustment) => {
    expect(roundCashSettlementCents(commercial)).toBe(settled);
    expect(cashRoundingAdjustmentCents(commercial)).toBe(adjustment);
  });

  it("keeps commercial and settlement totals distinct", () => {
    expect(settlementTotalCents({ totalCents: 1002, roundingAdjustmentCents: -2 })).toBe(1000);
    expect(settlementTotalCents({ totalCents: 1002 })).toBe(1002);
  });

  it("refuses fractions and negative cash amounts", () => {
    expect(() => roundCashSettlementCents(-1)).toThrow(RangeError);
    expect(() => roundCashSettlementCents(1.5)).toThrow(RangeError);
  });
});
