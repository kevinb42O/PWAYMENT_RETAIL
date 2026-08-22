import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../services/outboxWorker", () => ({
  synchronizeFinancialLedgerBeforeReport: vi.fn(),
}));
vi.mock("../services/supabaseStoreSync", () => ({
  syncStoreFromSupabase: vi.fn(),
}));
import {
  calculateReportData,
  generateZReport,
  getUnfinalizedTransactions,
  ReportIntegrityError,
  verifyZReport,
} from "./report";
import { Transaction } from "../types";
import { generateHash } from "./crypto";
import { db } from "../db/db";
import { useAuth } from "../auth/useAuth";
import { supabase } from "../lib/supabase";
import { synchronizeFinancialLedgerBeforeReport } from "../services/outboxWorker";
import { syncStoreFromSupabase } from "../services/supabaseStoreSync";

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

  it("attributes each part of a cash and card split without double counting revenue", () => {
    const split = {
      ...tx(1, 1000, "Cash"),
      paymentMethod: "Split" as const,
      tenders: [
        { method: "PIN" as const, amountCents: 200 },
        { method: "Cash" as const, amountCents: 800 },
      ],
    };
    const report = calculateReportData([split]);
    expect(report.totalRevenueCents).toBe(1000);
    expect(report.paymentTotalsCents).toEqual({ Cash: 800, PIN: 200, Cadeaubon: 0 });
  });

  it("keeps a statutory cash rounding difference outside VAT revenue while balancing tenders", () => {
    const roundedCash = {
      ...tx(1, 1002, "Cash"),
      roundingAdjustmentCents: -2,
      tenders: [{ method: "Cash" as const, amountCents: 1000 }],
    };

    const report = calculateReportData([roundedCash]);

    expect(report.totalRevenueCents).toBe(1002);
    expect(report.totalCashRoundingAdjustmentCents).toBe(-2);
    expect(report.paymentTotalsCents.Cash).toBe(1000);
  });


  it("sums Belgian retail VAT and discount columns", () => {
    const r = calculateReportData([tx(1, 1210, "Cash"), tx(2, 2420, "Cash")]);
    expect(r.totalVat21Cents).toBe(210 + 420);
    expect(r.totalVat12Cents).toBe(0);
    expect(r.totalDiscountCents).toBe(0);
  });

  it("preserves 0%, 6%, 12% and 21% tax buckets in a retail report", () => {
    const rates = [0, 6, 12, 21] as const;
    const transactions = rates.map((vatRate, index) => {
      const totalCents = 1_000 + vatRate;
      const vatCents = vatRate === 0
        ? 0
        : totalCents - Math.round(totalCents / (1 + vatRate / 100));
      return {
        ...tx(index + 1, totalCents, "PIN"),
        items: [{
          lineId: `vat-${vatRate}`,
          product: {
            id: `product-${vatRate}`,
            name: `Artikel ${vatRate}%`,
            category: "retail",
            priceCents: totalCents,
            vatRate,
          },
          quantity: 1,
        }],
        vatBreakdown: [{
          rate: vatRate,
          grossCents: totalCents,
          exclCents: totalCents - vatCents,
          vatCents,
        }],
        vat12Cents: vatRate === 12 ? vatCents : 0,
        vat21Cents: vatRate === 21 ? vatCents : 0,
      };
    });

    const report = calculateReportData(transactions);

    expect(report.totalVatBreakdown.map((line) => line.rate)).toEqual([0, 6, 12, 21]);
    expect(report.totalVatBreakdown.reduce((sum, line) => sum + line.grossCents, 0))
      .toBe(report.totalRevenueCents);
    expect(report.totalVatBreakdown.find((line) => line.rate === 6)?.vatCents).toBeGreaterThan(0);
  });

  it("subtracts an immutable signed refund VAT snapshot exactly once", () => {
    const sale = {
      ...tx(1, 1_060, "PIN"),
      items: [{
        lineId: "six-percent-sale",
        product: { ...tx(1, 1_060, "PIN").items[0].product, vatRate: 6 },
        quantity: 1,
      }],
      vatBreakdown: [{ rate: 6 as const, grossCents: 1_060, exclCents: 1_000, vatCents: 60 }],
      vat12Cents: 0,
      vat21Cents: 0,
    };
    const refund = {
      ...sale,
      id: 2,
      clientRequestId: "refund-2",
      kind: "refund" as const,
      subtotalCents: -1_060,
      totalCents: -1_060,
      discountCents: 0,
      vatBreakdown: [{ rate: 6 as const, grossCents: -1_060, exclCents: -1_000, vatCents: -60 }],
      tenders: [{ method: "PIN" as const, amountCents: -1_060 }],
    };

    const report = calculateReportData([sale, refund]);

    expect(report.totalRevenueCents).toBe(0);
    expect(report.totalVatBreakdown.find((line) => line.rate === 6)).toMatchObject({
      grossCents: 0,
      exclCents: 0,
      vatCents: 0,
    });
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

  it("verifies the exact canonical payload of a server-authoritative report", async () => {
    const serverHashPayload = JSON.stringify({
      version: 3,
      reportNumber: 42,
      totalRevenueCents: 1210,
      previousHash: "previous-server-hash",
    });
    const report = {
      ...calculateReportData([tx(1, 1210, "PIN")]),
      reportNumber: 42,
      transactionIds: [1],
      prevHash: "previous-server-hash",
      hashPayloadVersion: 3,
      serverHashPayload,
      hash: await generateHash(serverHashPayload),
    };

    await expect(verifyZReport(report, [])).resolves.toBe(true);
    await expect(
      verifyZReport({ ...report, serverHashPayload: `${serverHashPayload}tampered` }, []),
    ).resolves.toBe(false);
  });

  it("verifies a generic-retail VAT server hash at version 4", async () => {
    const serverHashPayload = JSON.stringify({
      version: 4,
      report: {
        totalVatBreakdown: [
          { rate: 0, grossCents: 100, exclCents: 100, vatCents: 0 },
          { rate: 6, grossCents: 106, exclCents: 100, vatCents: 6 },
        ],
      },
    });
    const report = {
      ...calculateReportData([tx(1, 1210, "PIN")]),
      reportNumber: 43,
      transactionIds: [1],
      prevHash: null,
      hashPayloadVersion: 4,
      serverHashPayload,
      hash: await generateHash(serverHashPayload),
    };

    await expect(verifyZReport(report, [])).resolves.toBe(true);
  });
});

describe("local Z report finalization", () => {
  beforeEach(async () => {
    if (!db.isOpen()) await db.open();
    await Promise.all([
      db.transactions.clear(),
      db.gift_card_events.clear(),
      db.daily_reports.clear(),
      db.shifts.clear(),
      db.outbox.clear(),
    ]);
    useAuth.setState({ currentStoreId: null });
  });

  it("creates a verifiable report, reconciles cash, and finalizes only the selected register", async () => {
    const first = { ...tx(1, 1210, "Cash"), registerId: "register-a", clientRequestId: "sale-a" };
    const second = { ...tx(2, 2420, "PIN"), registerId: "register-b", clientRequestId: "sale-b" };
    await db.transactions.bulkAdd([first, second]);
    await db.gift_card_events.add({
      id: "gift-issue-1",
      giftCardId: "gift-1",
      giftCardCode: "PW-001",
      type: "issue",
      amountCents: 5000,
      balanceBeforeCents: 0,
      balanceAfterCents: 5000,
      timestamp: Date.now(),
      source: "live",
      paymentTenders: [{ method: "Cash", amountCents: 5000 }],
    });

    const report = await generateZReport({
      registerId: "register-a",
      openingFloatCents: 1000,
      countedCashCents: 7210,
      cashDifferenceReason: "Geteld met tweede medewerker",
      closedByUserId: "u-owner",
      closedByUserName: "Eigenaar",
    });

    expect(report).toMatchObject({
      reportNumber: 1,
      registerId: "register-a",
      transactionIds: [1],
      expectedCashCents: 7210,
      cashDifferenceCents: 0,
      giftCardEventIds: ["gift-issue-1"],
    });
    expect(await verifyZReport(report!, [await db.transactions.get(1) as Transaction], await db.gift_card_events.toArray())).toBe(true);
    expect((await db.transactions.get(1))?.isFinalized).toBe(1);
    expect((await db.transactions.get(2))?.isFinalized).toBe(0);
    expect((await db.gift_card_events.get("gift-issue-1"))?.dailyReportId).toBe(report?.id);
    expect((await db.outbox.toArray())[0]).toMatchObject({ kind: "daily_report" });
    expect(await getUnfinalizedTransactions("register-a")).toEqual([]);
    expect(await getUnfinalizedTransactions("register-b")).toHaveLength(1);
  });

  it("returns no report when a register has neither sales nor gift-card liability events", async () => {
    await expect(generateZReport({ registerId: "empty-register" })).resolves.toBeNull();
  });

  it("uses the server-authoritative close when a tenant is active", async () => {
    const transaction = { ...tx(1, 1210, "PIN"), registerId: "register-a", clientRequestId: "server-sale-1" };
    await db.transactions.add(transaction);
    useAuth.setState({ currentStoreId: "store-1" });
    const report = {
      reportNumber: 9,
      timestamp: Date.now(),
      totalRevenueCents: 1210,
      totalCostCents: 0,
      grossProfitCents: 1210,
      totalVat12Cents: 0,
      totalVat21Cents: 210,
      totalExclVat12Cents: 0,
      totalExclVat21Cents: 1000,
      totalDiscountCents: 0,
      paymentTotalsCents: { Cash: 0, PIN: 1210, Cadeaubon: 0 },
      giftCardLiabilityAddedCents: 0,
      giftCardLiabilityPaymentTotalsCents: { Cash: 0, PIN: 0, Cadeaubon: 0 },
      giftCardEventIds: [],
      transactionIds: [1],
      prevHash: null,
      hash: "server-hash",
      hashPayloadVersion: 3,
    };
    vi.mocked(synchronizeFinancialLedgerBeforeReport).mockResolvedValue();
    vi.mocked(syncStoreFromSupabase).mockImplementation(async () => {
      await db.daily_reports.add(report);
    });
    vi.spyOn(supabase, "rpc").mockResolvedValue({ data: { report_number: 9 }, error: null } as never);

    await expect(generateZReport({ registerId: "register-a", countedCashCents: 0 })).resolves.toMatchObject({ reportNumber: 9 });
    expect(synchronizeFinancialLedgerBeforeReport).toHaveBeenCalledWith("store-1", [expect.objectContaining({ clientRequestId: "server-sale-1" })], []);
    expect(supabase.rpc).toHaveBeenCalledWith("finalize_daily_report", expect.objectContaining({ target_store_id: "store-1" }));
  });

  it("rejects server close errors and malformed report numbers before trusting local state", async () => {
    await db.transactions.add({ ...tx(1, 1210, "PIN"), registerId: "register-a", clientRequestId: "server-sale-2" });
    useAuth.setState({ currentStoreId: "store-1" });
    vi.mocked(synchronizeFinancialLedgerBeforeReport).mockRejectedValueOnce(new Error("verbinding weg"));
    await expect(generateZReport({ registerId: "register-a" })).rejects.toThrow("openstaande verkopen");

    vi.mocked(synchronizeFinancialLedgerBeforeReport).mockResolvedValue();
    vi.spyOn(supabase, "rpc").mockResolvedValueOnce({ data: null, error: { message: "report:locked:Dag is gesloten" } } as never);
    await expect(generateZReport({ registerId: "register-a" })).rejects.toThrow("Dag is gesloten");

    vi.spyOn(supabase, "rpc").mockResolvedValueOnce({ data: { report_number: 0 }, error: null } as never);
    await expect(generateZReport({ registerId: "register-a" })).rejects.toThrow("geldig Z-rapportnummer");
  });
});
