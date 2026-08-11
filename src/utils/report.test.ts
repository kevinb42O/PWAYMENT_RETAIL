import { describe, expect, it } from "vitest";
import { calculateReportData, ReportIntegrityError } from "./report";
import { Transaction } from "../types";

const tx = (
  id: number,
  totalCents: number,
  method: "Cash" | "PIN",
  costPriceCents = 0,
): Transaction => ({
  id,
  tableId: 1,
  items: [
    {
      lineId: "l" + id,
      product: {
        id: "p",
        name: "Deck",
        category: "decks",
        priceCents: totalCents,
        costPriceCents,
        vatRate: 21,
      },
      quantity: 1,
    },
  ],
  subtotalCents: totalCents,
  vat12Cents: 0,
  vat21Cents: Math.round(totalCents - totalCents / 1.21),
  totalCents,
  discountCents: 0,
  paymentMethod: method,
  timestamp: Date.now(),
  isFinalized: 0,
});

describe("calculateReportData", () => {
  it("sums totals across payment methods", () => {
    const r = calculateReportData([
      tx(1, 500, "Cash"),
      tx(2, 750, "PIN"),
      tx(3, 100, "Cash"),
    ]);
    expect(r.totalRevenueCents).toBe(1350);
    expect(r.paymentTotalsCents.Cash).toBe(600);
    expect(r.paymentTotalsCents.PIN).toBe(750);
    expect(r.transactionIds).toEqual([1, 2, 3]);
  });

  it("sums Belgian retail VAT and discount columns", () => {
    const r = calculateReportData([tx(1, 1210, "Cash"), tx(2, 2420, "Cash")]);
    expect(r.totalVat21Cents).toBe(210 + 420);
    expect(r.totalVat12Cents).toBe(0);
    expect(r.totalDiscountCents).toBe(0);
  });

  it("tracks cost and gross profit", () => {
    const r = calculateReportData([
      tx(1, 10000, "PIN", 4500),
      tx(2, 5000, "PIN", 2000),
    ]);
    expect(r.totalCostCents).toBe(6500);
    expect(r.grossProfitCents).toBe(8500);
  });

  it("returns zeros for empty input", () => {
    const r = calculateReportData([]);
    expect(r.totalRevenueCents).toBe(0);
    expect(r.totalCostCents).toBe(0);
    expect(r.transactionIds).toHaveLength(0);
  });

  it("rejects a malformed legacy split instead of producing NaN", () => {
    const row = {
      ...tx(1, 500, "Cash"),
      paymentMethod: "Split" as const,
      splitTenders: undefined,
      tenders: undefined,
    };
    expect(() => calculateReportData([row])).toThrow(ReportIntegrityError);
  });

  it("books gift-card catalog value as liability rather than product revenue", () => {
    const row = tx(1, 2500, "PIN");
    row.items[0].product = {
      ...row.items[0].product,
      name: "Gift Card",
      subCategory: "Cadeaubonnen",
      productType: "gift-card",
    };
    const report = calculateReportData([row]);
    expect(report.totalRevenueCents).toBe(0);
    expect(report.grossProfitCents).toBe(0);
    expect(report.giftCardLiabilityAddedCents).toBe(2500);
    expect(report.paymentTotalsCents.PIN).toBe(2500);
  });
});
