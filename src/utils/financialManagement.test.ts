import { describe, expect, it } from "vitest";
import type { FinancialCost, Transaction } from "../types";
import { transactionCommerceFinancials } from "./financial";
import {
  allocateFinancialCostCents,
  buildProfitabilitySnapshot,
  financialCostVatCents,
  financialManagementCostCents,
} from "./financialManagement";

const cost = (overrides: Partial<FinancialCost> = {}): FinancialCost => ({
  id: "cost-1",
  kind: "recurring",
  name: "Huur",
  category: "premises",
  amountCents: 3_000,
  amountMode: "excluding-vat",
  vatRate: 0,
  vatRecoverablePercent: 0,
  behavior: "fixed",
  frequency: "monthly",
  startDate: "2026-01-01",
  status: "active",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

const sale = (overrides: Partial<Transaction> = {}): Transaction => ({
  tableId: 1,
  items: [{
    lineId: "line",
    product: {
      id: "product",
      name: "Product",
      category: "retail",
      priceCents: 12_100,
      costPriceCents: 4_000,
      vatRate: 21,
    },
    quantity: 1,
  }],
  subtotalCents: 12_100,
  vatBreakdown: [{ rate: 21, grossCents: 12_100, exclCents: 10_000, vatCents: 2_100 }],
  vat12Cents: 0,
  vat21Cents: 2_100,
  totalCents: 12_100,
  discountCents: 0,
  paymentMethod: "PIN",
  timestamp: Date.UTC(2026, 0, 15, 12),
  isFinalized: 1,
  ...overrides,
});

describe("owner financial management calculations", () => {
  it("keeps VAT and gift-card liability out of management revenue and reverses refunds", () => {
    expect(transactionCommerceFinancials(sale())).toMatchObject({
      grossRevenueCents: 12_100,
      vatCents: 2_100,
      netRevenueExVatCents: 10_000,
      costOfGoodsCents: 4_000,
      grossProfitCents: 6_000,
    });
    expect(transactionCommerceFinancials(sale({
      kind: "refund",
      totalCents: -12_100,
      vatBreakdown: [{ rate: 21, grossCents: -12_100, exclCents: -10_000, vatCents: -2_100 }],
    }))).toMatchObject({
      netRevenueExVatCents: -10_000,
      costOfGoodsCents: -4_000,
      grossProfitCents: -6_000,
    });
    const giftCardSale = sale({
      items: [{
        lineId: "gift",
        product: { id: "gift", name: "Cadeaubon", category: "gift", priceCents: 5_000, vatRate: 0, productType: "gift-card" },
        quantity: 1,
      }],
      totalCents: 5_000,
      vatBreakdown: [{ rate: 0, grossCents: 5_000, exclCents: 5_000, vatCents: 0 }],
    });
    expect(transactionCommerceFinancials(giftCardSale)).toMatchObject({
      netRevenueExVatCents: 0,
      giftCardLiabilityCents: 5_000,
    });
  });

  it("handles inclusive/exclusive and partially recoverable VAT explicitly", () => {
    const inclusive = cost({
      amountCents: 12_100,
      amountMode: "including-vat",
      vatRate: 21,
      vatRecoverablePercent: 50,
    });
    expect(financialCostVatCents(inclusive)).toBe(2_100);
    expect(financialManagementCostCents(inclusive)).toBe(11_050);

    const exclusive = cost({
      amountCents: 10_000,
      amountMode: "excluding-vat",
      vatRate: 21,
      vatRecoverablePercent: 100,
    });
    expect(financialCostVatCents(exclusive)).toBe(2_100);
    expect(financialManagementCostCents(exclusive)).toBe(10_000);
  });

  it("allocates recurring costs over calendar intervals without moving annual cash dates into profit", () => {
    const monthly = cost({ amountCents: 3_100 });
    expect(allocateFinancialCostCents(
      monthly,
      Date.UTC(2026, 0, 1),
      Date.UTC(2026, 1, 1),
    )).toBe(3_100);
    expect(allocateFinancialCostCents(
      monthly,
      Date.UTC(2026, 0, 1),
      Date.UTC(2026, 0, 16),
    )).toBe(1_500);
  });

  it("keeps an archived recurring cost in historical periods until its end date", () => {
    const archived = cost({
      status: "archived",
      endDate: "2026-02-15",
      amountCents: 3_100,
      updatedAt: "2026-02-15T12:00:00.000Z",
    });
    expect(allocateFinancialCostCents(
      archived,
      Date.UTC(2026, 0, 1),
      Date.UTC(2026, 1, 1),
    )).toBe(3_100);
    expect(allocateFinancialCostCents(
      archived,
      Date.UTC(2026, 2, 1),
      Date.UTC(2026, 3, 1),
    )).toBe(0);
  });

  it("prorates a recurring cost when it ends during its billing interval", () => {
    const ended = cost({ amountCents: 3_100, endDate: "2026-01-15" });
    expect(allocateFinancialCostCents(
      ended,
      Date.UTC(2026, 0, 1),
      Date.UTC(2026, 1, 1),
    )).toBe(1_500);
  });

  it("does not recognize an archived one-off cost dated after its archive date", () => {
    const cancelled = cost({
      kind: "one-off",
      frequency: "once",
      startDate: "2026-03-01",
      status: "archived",
      updatedAt: "2026-02-01T12:00:00.000Z",
    });
    expect(allocateFinancialCostCents(
      cancelled,
      Date.UTC(2026, 2, 1),
      Date.UTC(2026, 3, 1),
    )).toBe(0);
  });

  it("builds a reconciled operating result and contribution-margin break-even", () => {
    const snapshot = buildProfitabilitySnapshot({
      transactions: [sale()],
      costs: [
        cost({ amountCents: 3_000, behavior: "fixed" }),
        cost({ id: "variable", name: "Payment fees", amountCents: 1_000, behavior: "variable" }),
      ],
      rangeStart: Date.UTC(2026, 0, 1),
      rangeEnd: Date.UTC(2026, 1, 1) - 1,
    });
    expect(snapshot).toMatchObject({
      netRevenueCents: 10_000,
      costOfGoodsCents: 4_000,
      grossProfitCents: 6_000,
      operatingCostsCents: 4_000,
      operatingResultCents: 2_000,
      contributionMarginPercent: 50,
      breakEvenRevenueCents: 6_000,
      breakEvenGapCents: 4_000,
    });
  });
});
