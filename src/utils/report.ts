import Dexie from "dexie";
import { db } from "../db/db";
import { useAuth } from "../auth/useAuth";
import { supabase } from "../lib/supabase";
import { syncStoreFromSupabase } from "../services/supabaseStoreSync";
import type { Json } from "../types/database.generated";
import {
  DailyReport,
  GiftCardEvent,
  PaymentTender,
  Transaction,
} from "../types";
import {
  DEFAULT_REGISTER_ID,
  isGiftCardProduct,
  transactionCostCents,
  transactionTenders,
} from "./financial";
import { generateHash } from "./crypto";
import { allocateCents } from "./money";
import { calculateTotals } from "./vat";
import { settlementTotalCents } from "./cashRounding";
import { synchronizeFinancialLedgerBeforeReport } from "../services/outboxWorker";

export class ReportIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReportIntegrityError";
  }
}

export const getUnfinalizedTransactions = async (
  registerId = DEFAULT_REGISTER_ID,
): Promise<Transaction[]> =>
  db.transactions
    .filter(
      (transaction) =>
        transaction.isFinalized === 0 &&
        (transaction.source ?? "live") !== "demo" &&
        (transaction.registerId ?? DEFAULT_REGISTER_ID) === registerId,
    )
    .toArray();

type PaymentTotals = { Cash: number; PIN: number; Cadeaubon: number };

const emptyPaymentTotals = (): PaymentTotals => ({
  Cash: 0,
  PIN: 0,
  Cadeaubon: 0,
});

const addTenders = (totals: PaymentTotals, tenders: PaymentTender[]) => {
  for (const tender of tenders) {
    if (!Number.isSafeInteger(tender.amountCents)) {
      throw new ReportIntegrityError(
        `Ongeldig tenderbedrag: ${String(tender.amountCents)}.`,
      );
    }
    totals[tender.method] += tender.amountCents;
  }
};

const financialParts = (transaction: Transaction) => {
  const grossLines = transaction.items.map((item) => {
    const modifierCents = (item.modifiers ?? []).reduce(
      (sum, modifier) => sum + modifier.deltaCents,
      0,
    );
    return (item.product.priceCents + modifierCents) * item.quantity;
  });
  const allocatedRevenue = allocateCents(transaction.totalCents, grossLines);
  const commerceItems = transaction.items.filter(
    (item) => !isGiftCardProduct(item.product),
  );
  const direction = (transaction.kind ?? "sale") === "refund" ? -1 : 1;
  const commerceDiscount = allocateCents(
    Math.abs(transaction.discountCents),
    grossLines,
  ).reduce(
    (sum, discount, index) =>
      sum +
      (isGiftCardProduct(transaction.items[index].product) ? 0 : discount),
    0,
  );
  const commerceRevenueCents = allocatedRevenue.reduce(
    (sum, revenue, index) =>
      sum + (isGiftCardProduct(transaction.items[index].product) ? 0 : revenue),
    0,
  );
  const liabilityAddedCents = transaction.totalCents - commerceRevenueCents;
  const rawVat =
    commerceItems.length > 0
      ? calculateTotals(commerceItems, commerceDiscount)
      : { vat12: 0, vat21: 0, exclVat12: 0, exclVat21: 0 };
  const vat = {
    vat12: rawVat.vat12 * direction,
    vat21: rawVat.vat21 * direction,
    exclVat12: rawVat.exclVat12 * direction,
    exclVat21: rawVat.exclVat21 * direction,
  };
  return { commerceRevenueCents, liabilityAddedCents, vat };
};

export interface ReportData {
  totalRevenueCents: number;
  totalCostCents: number;
  grossProfitCents: number;
  totalVat12Cents: number;
  totalVat21Cents: number;
  totalExclVat12Cents: number;
  totalExclVat21Cents: number;
  totalDiscountCents: number;
  totalCashRoundingAdjustmentCents: number;
  paymentTotalsCents: PaymentTotals;
  giftCardLiabilityAddedCents: number;
  giftCardLiabilityPaymentTotalsCents: PaymentTotals;
  giftCardEventIds: string[];
  transactionIds: number[];
  timestamp: number;
}

/** Aggregate rows with exact cent reconciliation; malformed rows are rejected. */
export const calculateReportData = (
  transactions: Transaction[],
  giftCardEvents: GiftCardEvent[] = [],
): ReportData => {
  const out: ReportData = {
    totalRevenueCents: 0,
    totalCostCents: 0,
    grossProfitCents: 0,
    totalVat12Cents: 0,
    totalVat21Cents: 0,
    totalExclVat12Cents: 0,
    totalExclVat21Cents: 0,
    totalDiscountCents: 0,
    totalCashRoundingAdjustmentCents: 0,
    paymentTotalsCents: emptyPaymentTotals(),
    giftCardLiabilityAddedCents: 0,
    giftCardLiabilityPaymentTotalsCents: emptyPaymentTotals(),
    giftCardEventIds: [],
    transactionIds: [],
    timestamp: Date.now(),
  };

  for (const transaction of transactions) {
    const tenders = transactionTenders(transaction);
    const tenderTotal = tenders.reduce(
      (sum, tender) => sum + tender.amountCents,
      0,
    );
    const settlementTotal = settlementTotalCents(transaction);
    if (
      tenderTotal !== settlementTotal ||
      (tenders.length === 0 && settlementTotal !== 0)
    ) {
      throw new ReportIntegrityError(
        `Transactie ${transaction.id ?? "zonder ID"}: betaalmiddelen (${tenderTotal}c) sluiten niet aan op te vereffenen bedrag (${settlementTotal}c).`,
      );
    }
    const parts = financialParts(transaction);
    const costCents = transactionCostCents(transaction);
    out.totalRevenueCents += parts.commerceRevenueCents;
    out.giftCardLiabilityAddedCents += parts.liabilityAddedCents;
    out.totalCostCents += costCents;
    out.grossProfitCents += parts.commerceRevenueCents - costCents;
    out.totalVat12Cents += parts.vat.vat12;
    out.totalVat21Cents += parts.vat.vat21;
    out.totalExclVat12Cents += parts.vat.exclVat12;
    out.totalExclVat21Cents += parts.vat.exclVat21;
    out.totalDiscountCents += transaction.discountCents;
    out.totalCashRoundingAdjustmentCents += transaction.roundingAdjustmentCents ?? 0;
    addTenders(out.paymentTotalsCents, tenders);
    if (transaction.id != null) out.transactionIds.push(transaction.id);
  }

  for (const event of giftCardEvents) {
    if (event.type !== "issue" && event.type !== "recharge") continue;
    const tenders = event.paymentTenders ?? [];
    const tenderTotal = tenders.reduce(
      (sum, tender) => sum + tender.amountCents,
      0,
    );
    if (tenders.length === 0 || tenderTotal !== event.amountCents) {
      throw new ReportIntegrityError(
        `Cadeaubongebeurtenis ${event.id}: betaling (${tenderTotal}c) sluit niet aan op waarde (${event.amountCents}c).`,
      );
    }
    out.giftCardLiabilityAddedCents += event.amountCents;
    addTenders(out.giftCardLiabilityPaymentTotalsCents, tenders);
    out.giftCardEventIds.push(event.id);
  }

  out.transactionIds.sort((a, b) => a - b);
  out.giftCardEventIds.sort();
  return out;
};

export interface FinalizeOptions {
  closedByUserId?: string;
  closedByUserName?: string;
  registerId?: string;
  shiftId?: number;
  openingFloatCents?: number;
  countedCashCents?: number;
  cashDifferenceReason?: string;
}

const canonicalTransaction = (transaction: Transaction) => ({
  id: transaction.id,
  clientRequestId: transaction.clientRequestId,
  documentNumber: transaction.documentNumber,
  timestamp: transaction.timestamp,
  kind: transaction.kind ?? "sale",
  originalTransactionId: transaction.originalTransactionId,
  items: transaction.items,
  subtotalCents: transaction.subtotalCents,
  discountCents: transaction.discountCents,
  totalCents: transaction.totalCents,
  roundingAdjustmentCents: transaction.roundingAdjustmentCents ?? 0,
  vat12Cents: transaction.vat12Cents,
  vat21Cents: transaction.vat21Cents,
  tenders: transactionTenders(transaction),
  giftCardAllocations: transaction.giftCardAllocations ?? [],
  userId: transaction.userId,
  customerId: transaction.customerId,
  source: transaction.source ?? "live",
  registerId: transaction.registerId ?? DEFAULT_REGISTER_ID,
  shiftId: transaction.shiftId,
});

/** The report linkage is written only after hashing and must not invalidate it. */
const canonicalGiftCardEvent = (event: GiftCardEvent) => {
  const { dailyReportId: _dailyReportId, ...immutableEvent } = event;
  return immutableEvent;
};

export const verifyZReport = async (
  report: DailyReport,
  transactions: Transaction[],
  events: GiftCardEvent[] = [],
): Promise<boolean> => {
  if (report.hashPayloadVersion === 3 && report.serverHashPayload) {
    return (await generateHash(report.serverHashPayload)) === report.hash;
  }
  const payload = JSON.stringify({
    version: report.hashPayloadVersion ?? 2,
    report: { ...report, id: undefined, hash: undefined },
    transactions: [...transactions]
      .sort((a, b) => (a.id ?? 0) - (b.id ?? 0))
      .map(canonicalTransaction),
    giftCardEvents: [...events]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((event) =>
        (report.hashPayloadVersion ?? 2) >= 3
          ? canonicalGiftCardEvent(event)
          : event,
      ),
  });
  return (await generateHash(payload)) === report.hash;
};

/** Select, number, hash and finalise inside one serialized IndexedDB write transaction. */
export const generateZReport = async (
  opts: FinalizeOptions = {},
): Promise<DailyReport | null> => {
  const registerId = opts.registerId ?? DEFAULT_REGISTER_ID;
  const storeId = useAuth.getState().currentStoreId;
  if (storeId) return generateSupabaseZReport(storeId, registerId, opts);
  return db.transaction(
    "rw",
    [
      db.transactions,
      db.daily_reports,
      db.gift_card_events,
      db.shifts,
      db.outbox,
    ],
    async () => {
      const transactions = await getUnfinalizedTransactions(registerId);
      const events = await db.gift_card_events
        .filter(
          (event) =>
            event.dailyReportId == null &&
            event.source !== "demo" &&
            (event.type === "issue" || event.type === "recharge"),
        )
        .toArray();
      if (transactions.length === 0 && events.length === 0) return null;

      const reportData = calculateReportData(transactions, events);
      const lastReport = await db.daily_reports.orderBy("reportNumber").last();
      const reportNumber = (lastReport?.reportNumber ?? 0) + 1;
      const prevHash = lastReport?.hash ?? null;
      const timestamp = Date.now();
      const openingFloatCents = opts.openingFloatCents ?? 0;
      const cashReceivedCents =
        reportData.paymentTotalsCents.Cash +
        reportData.giftCardLiabilityPaymentTotalsCents.Cash;
      const expectedCashCents = openingFloatCents + cashReceivedCents;
      const countedCashCents = opts.countedCashCents;
      const cashDifferenceCents =
        countedCashCents == null
          ? undefined
          : countedCashCents - expectedCashCents;

      const reportWithoutHash: Omit<DailyReport, "hash"> = {
        reportNumber,
        timestamp,
        totalRevenueCents: reportData.totalRevenueCents,
        totalCostCents: reportData.totalCostCents,
        grossProfitCents: reportData.grossProfitCents,
        totalVat12Cents: reportData.totalVat12Cents,
        totalVat21Cents: reportData.totalVat21Cents,
        totalExclVat12Cents: reportData.totalExclVat12Cents,
        totalExclVat21Cents: reportData.totalExclVat21Cents,
        totalDiscountCents: reportData.totalDiscountCents,
        totalCashRoundingAdjustmentCents:
          reportData.totalCashRoundingAdjustmentCents,
        paymentTotalsCents: reportData.paymentTotalsCents,
        giftCardLiabilityAddedCents: reportData.giftCardLiabilityAddedCents,
        giftCardLiabilityPaymentTotalsCents:
          reportData.giftCardLiabilityPaymentTotalsCents,
        giftCardEventIds: reportData.giftCardEventIds,
        transactionIds: reportData.transactionIds,
        prevHash,
        closedByUserId: opts.closedByUserId,
        closedByUserName: opts.closedByUserName,
        registerId,
        shiftId: opts.shiftId,
        openingFloatCents,
        countedCashCents,
        expectedCashCents,
        cashDifferenceCents,
        cashDifferenceReason: opts.cashDifferenceReason,
        hashPayloadVersion: 3,
      };
      const payload = JSON.stringify({
        version: 3,
        report: { ...reportWithoutHash, hash: undefined },
        transactions: transactions
          .sort((a, b) => (a.id ?? 0) - (b.id ?? 0))
          .map(canonicalTransaction),
        giftCardEvents: events
          .sort((a, b) => a.id.localeCompare(b.id))
          .map(canonicalGiftCardEvent),
      });
      const hash = await Dexie.waitFor(generateHash(payload));
      const report: DailyReport = { ...reportWithoutHash, hash };
      const reportId = await db.daily_reports.add(report);

      if (reportData.transactionIds.length > 0) {
        await db.transactions
          .where("id")
          .anyOf(reportData.transactionIds)
          .modify({ isFinalized: 1 });
      }
      if (reportData.giftCardEventIds.length > 0) {
        await db.gift_card_events
          .where("id")
          .anyOf(reportData.giftCardEventIds)
          .modify({ dailyReportId: reportId });
      }
      if (opts.shiftId != null) {
        await db.shifts.update(opts.shiftId, {
          openingFloatCents,
          status: "closed",
          closedAt: timestamp,
          closedByUserId: opts.closedByUserId,
          closedByUserName: opts.closedByUserName,
          countedCashCents,
          expectedCashCents,
          cashDifferenceCents,
          cashDifferenceReason: opts.cashDifferenceReason,
        });
      }
      await db.outbox.add({
        timestamp,
        kind: "daily_report",
        payload: { ...report, id: reportId },
        attempts: 0,
      });
      return { ...report, id: reportId };
    },
  );
};

const generateSupabaseZReport = async (
  storeId: string,
  registerId: string,
  opts: FinalizeOptions,
): Promise<DailyReport | null> => {
  const transactions = await getUnfinalizedTransactions(registerId);
  const events = await db.gift_card_events
    .filter(
      (event) =>
        event.dailyReportId == null &&
        event.source !== "demo" &&
        (event.type === "issue" || event.type === "recharge"),
    )
    .toArray();
  if (transactions.length === 0 && events.length === 0) return null;
  const transactionRequestIds = transactions.map(
    (transaction) => transaction.clientRequestId,
  );
  if (transactionRequestIds.some((id) => !id)) {
    throw new ReportIntegrityError(
      "Een verkoop mist een serverreferentie. Vernieuw de gegevens.",
    );
  }
  try {
    await synchronizeFinancialLedgerBeforeReport(storeId, transactions, events);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new ReportIntegrityError(
      `De openstaande verkopen konden nog niet veilig met de server worden gesynchroniseerd. ${detail}`,
    );
  }
  const { data, error } = await supabase.rpc("finalize_daily_report", {
    target_store_id: storeId,
    payload: {
      register_id: registerId,
      report: {
        openingFloatCents: opts.openingFloatCents ?? 0,
        countedCashCents: opts.countedCashCents,
        cashDifferenceReason: opts.cashDifferenceReason,
      },
      transaction_request_ids: transactionRequestIds as string[],
      gift_card_event_ids: events.map((event) => event.id),
    } as unknown as Json,
  });
  if (error) {
    const match = error.message.match(/report:[a-z-]+:(.+)/s);
    throw new ReportIntegrityError(
      match?.[1]?.trim() || "Het Z-rapport kon niet veilig worden gesloten.",
    );
  }
  if (!data) return null;
  const reportNumber = Number(
    (data as { report_number?: number }).report_number,
  );
  if (!Number.isSafeInteger(reportNumber) || reportNumber <= 0) {
    throw new ReportIntegrityError(
      "De server gaf geen geldig Z-rapportnummer terug.",
    );
  }
  await syncStoreFromSupabase(storeId);
  return (
    (await db.daily_reports
      .where("reportNumber")
      .equals(reportNumber)
      .first()) ?? null
  );
};
