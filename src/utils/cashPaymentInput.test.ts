import { describe, expect, it } from "vitest";
import {
  cashEntryToCents,
  cashQuickAmounts,
  formatCashEntry,
  sanitizeCashEntry,
} from "./cashPaymentInput";

describe("cash payment input", () => {
  it("formats and parses integer cents without floating point arithmetic", () => {
    expect(formatCashEntry(9_090)).toBe("90,90");
    expect(cashEntryToCents("90,90")).toBe(9_090);
    expect(cashEntryToCents("20")).toBe(2_000);
    expect(cashEntryToCents("20,5")).toBe(2_050);
  });

  it("accepts Belgian and hardware numpad decimal separators", () => {
    expect(sanitizeCashEntry("€ 1 234,56")).toBe("1234,56");
    expect(sanitizeCashEntry("20.50")).toBe("20,50");
    expect(sanitizeCashEntry("12,3456")).toBe("12,34");
    expect(sanitizeCashEntry("abc9,9xyz")).toBe("9,9");
  });

  it("only offers useful tender amounts above the amount due", () => {
    expect(cashQuickAmounts(9_090)).toEqual([10_000, 20_000, 50_000, 100_000]);
    expect(cashQuickAmounts(1_235)).toEqual([2_000, 5_000, 10_000, 20_000]);
    expect(cashQuickAmounts(299_900)).toEqual([300_000]);
  });
});
