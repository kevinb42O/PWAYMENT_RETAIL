import { format } from "date-fns";
import { supabase } from "../lib/supabase";
import type { DailyReport, Transaction } from "../types";
import type { Json } from "../types/database.generated";
import { transactionTenders } from "../utils/financial";
import { allocateCents } from "../utils/money";

export interface DailyReportProductDetail {
  key: string;
  productName: string;
  variant?: string;
  sku?: string;
  categoryName?: string;
  productType: "merchandise" | "service" | "gift-card";
  vatRate: number;
  soldQuantity: number;
  returnedQuantity: number;
  netQuantity: number;
  grossCents: number;
  discountCents: number;
  netRevenueCents: number;
  vatCents: number;
  costCents: number;
  grossProfitCents: number;
}

export interface DailyReportTransactionDetail {
  id: string | number;
  documentNumber: string;
  timestamp: number;
  kind: "sale" | "refund";
  cashierName?: string;
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  vat12Cents: number;
  vat21Cents: number;
  paymentMethod: string;
  correctionReason?: string;
  tenders: { method: "Cash" | "PIN" | "Cadeaubon"; amountCents: number }[];
  lines: {
    productName: string;
    variant?: string;
    sku?: string;
    quantity: number;
    netRevenueCents: number;
    vatRate: number;
  }[];
}

export interface DailyReportDetail {
  report: {
    id?: string;
    reportNumber: number;
    timestamp: number;
    registerName: string;
    shiftNumber?: number;
    openedAt?: number;
    closedAt: number;
    closedByUserName?: string;
    transactionCount: number;
    totals: Partial<DailyReport>;
    openingFloatCents: number;
    countedCashCents: number;
    expectedCashCents: number;
    cashDifferenceCents: number;
    cashDifferenceReason?: string;
    hash: string;
    previousHash?: string;
    hashPayloadVersion: number;
    isDemo: boolean;
    calculationAuthority: "server" | "legacy" | "offline";
  };
  products: DailyReportProductDetail[];
  transactions: DailyReportTransactionDetail[];
}

export interface DailyReportDaySummary {
  date: string;
  reportCount: number;
  firstReportNumber: number;
  lastReportNumber: number;
  transactionCount: number;
  totalRevenueCents: number;
  totalCostCents: number;
  grossProfitCents: number;
  totalVat12Cents: number;
  totalVat21Cents: number;
  cashCents: number;
  pinCents: number;
  giftCardCents: number;
  cashDifferenceCents: number;
}

const number = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const string = (value: unknown, fallback = "") =>
  typeof value === "string" ? value : fallback;

const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const array = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const mapServerDetail = (value: Json): DailyReportDetail => {
  const root = object(value);
  const report = object(root.report);
  const totals = object(report.totals) as Partial<DailyReport>;
  return {
    report: {
      id: string(report.id) || undefined,
      reportNumber: number(report.reportNumber),
      timestamp: number(report.timestamp),
      registerName: string(report.registerName, "Kassa"),
      shiftNumber: report.shiftNumber == null ? undefined : number(report.shiftNumber),
      openedAt: report.openedAt == null ? undefined : number(report.openedAt),
      closedAt: number(report.closedAt, number(report.timestamp)),
      closedByUserName: string(report.closedByUserName) || undefined,
      transactionCount: number(report.transactionCount),
      totals,
      openingFloatCents: number(report.openingFloatCents),
      countedCashCents: number(report.countedCashCents),
      expectedCashCents: number(report.expectedCashCents),
      cashDifferenceCents: number(report.cashDifferenceCents),
      cashDifferenceReason: string(report.cashDifferenceReason) || undefined,
      hash: string(report.hash),
      previousHash: string(report.previousHash) || undefined,
      hashPayloadVersion: number(report.hashPayloadVersion, 1),
      isDemo: Boolean(report.isDemo),
      calculationAuthority:
        report.calculationAuthority === "server" ? "server" : "legacy",
    },
    products: array(root.products).map((rowValue) => {
      const row = object(rowValue);
      return {
        key: string(row.key),
        productName: string(row.productName, "Onbekend product"),
        variant: string(row.variant) || undefined,
        sku: string(row.sku) || undefined,
        categoryName: string(row.categoryName) || undefined,
        productType:
          row.productType === "service" || row.productType === "gift-card"
            ? row.productType
            : "merchandise",
        vatRate: number(row.vatRate),
        soldQuantity: number(row.soldQuantity),
        returnedQuantity: number(row.returnedQuantity),
        netQuantity: number(row.netQuantity),
        grossCents: number(row.grossCents),
        discountCents: number(row.discountCents),
        netRevenueCents: number(row.netRevenueCents),
        vatCents: number(row.vatCents),
        costCents: number(row.costCents),
        grossProfitCents: number(row.grossProfitCents),
      };
    }),
    transactions: array(root.transactions).map((rowValue) => {
      const row = object(rowValue);
      return {
        id: string(row.id),
        documentNumber: string(row.documentNumber, "—"),
        timestamp: number(row.timestamp),
        kind: row.kind === "refund" ? "refund" : "sale",
        cashierName: string(row.cashierName) || undefined,
        subtotalCents: number(row.subtotalCents),
        discountCents: number(row.discountCents),
        totalCents: number(row.totalCents),
        vat12Cents: number(row.vat12Cents),
        vat21Cents: number(row.vat21Cents),
        paymentMethod: string(row.paymentMethod),
        correctionReason: string(row.correctionReason) || undefined,
        tenders: array(row.tenders).map((tenderValue) => {
          const tender = object(tenderValue);
          const method = string(tender.method);
          return {
            method:
              method === "Cash" || method === "Cadeaubon" ? method : "PIN",
            amountCents: number(tender.amountCents),
          };
        }),
        lines: array(row.lines).map((lineValue) => {
          const line = object(lineValue);
          return {
            productName: string(line.productName, "Onbekend product"),
            variant: string(line.variant) || undefined,
            sku: string(line.sku) || undefined,
            quantity: number(line.quantity),
            netRevenueCents: number(line.netRevenueCents),
            vatRate: number(line.vatRate),
          };
        }),
      };
    }),
  };
};

const deriveOfflineDetail = (
  report: DailyReport,
  allTransactions: Transaction[],
): DailyReportDetail => {
  const reportIds = new Set(report.transactionIds);
  const transactions = allTransactions.filter(
    (transaction) => transaction.id != null && reportIds.has(transaction.id),
  );
  const products = new Map<string, DailyReportProductDetail>();

  for (const transaction of transactions) {
    const direction = (transaction.kind ?? "sale") === "refund" ? -1 : 1;
    const grossLines = transaction.items.map((item) => {
      const modifiers = (item.modifiers ?? []).reduce(
        (sum, modifier) => sum + modifier.deltaCents,
        0,
      );
      return (item.product.priceCents + modifiers) * item.quantity;
    });
    const discounts = allocateCents(Math.abs(transaction.discountCents), grossLines);
    const netLines = grossLines.map((gross, index) => gross - discounts[index]);
    const byRate = new Map<number, number[]>();
    transaction.items.forEach((item, index) => {
      const indexes = byRate.get(item.product.vatRate) ?? [];
      indexes.push(index);
      byRate.set(item.product.vatRate, indexes);
    });
    const vatByLine = Array(transaction.items.length).fill(0) as number[];
    for (const [rate, indexes] of byRate) {
      const target = Math.abs(
        rate === 12 ? transaction.vat12Cents : rate === 21 ? transaction.vat21Cents : 0,
      );
      const allocated = allocateCents(target, indexes.map((index) => netLines[index]));
      indexes.forEach((index, position) => {
        vatByLine[index] = allocated[position];
      });
    }

    transaction.items.forEach((item, index) => {
      const product = item.product;
      const key = `${product.id}:${product.variant ?? ""}:${product.vatRate}`;
      const current = products.get(key) ?? {
        key,
        productName: product.name,
        variant: product.variant,
        sku: product.sku,
        categoryName: product.category,
        productType: product.productType ?? "merchandise",
        vatRate: product.vatRate,
        soldQuantity: 0,
        returnedQuantity: 0,
        netQuantity: 0,
        grossCents: 0,
        discountCents: 0,
        netRevenueCents: 0,
        vatCents: 0,
        costCents: 0,
        grossProfitCents: 0,
      };
      const cost = (product.costPriceCents ?? 0) * item.quantity * direction;
      const net = netLines[index] * direction;
      if (direction > 0) current.soldQuantity += item.quantity;
      else current.returnedQuantity += item.quantity;
      current.netQuantity += item.quantity * direction;
      current.grossCents += grossLines[index] * direction;
      current.discountCents += discounts[index] * direction;
      current.netRevenueCents += net;
      current.vatCents += vatByLine[index] * direction;
      current.costCents += cost;
      current.grossProfitCents += net - cost;
      products.set(key, current);
    });
  }

  return {
    report: {
      reportNumber: report.reportNumber,
      timestamp: report.timestamp,
      registerName: report.registerId ?? "Kassa",
      shiftNumber: report.shiftId,
      closedAt: report.timestamp,
      closedByUserName: report.closedByUserName,
      transactionCount: transactions.length,
      totals: report,
      openingFloatCents: report.openingFloatCents ?? 0,
      countedCashCents: report.countedCashCents ?? 0,
      expectedCashCents: report.expectedCashCents ?? 0,
      cashDifferenceCents: report.cashDifferenceCents ?? 0,
      cashDifferenceReason: report.cashDifferenceReason,
      hash: report.hash,
      previousHash: report.prevHash ?? undefined,
      hashPayloadVersion: report.hashPayloadVersion ?? 1,
      isDemo: false,
      calculationAuthority:
        (report.hashPayloadVersion ?? 1) >= 3 ? "server" : "offline",
    },
    products: [...products.values()].sort(
      (left, right) => right.netRevenueCents - left.netRevenueCents,
    ),
    transactions: transactions
      .map((transaction) => ({
        id: transaction.id ?? transaction.documentNumber ?? "—",
        documentNumber: transaction.documentNumber ?? `#${transaction.id}`,
        timestamp: transaction.timestamp,
        kind: transaction.kind ?? "sale",
        cashierName: transaction.userName,
        subtotalCents: transaction.subtotalCents,
        discountCents: transaction.discountCents,
        totalCents: transaction.totalCents,
        vat12Cents: transaction.vat12Cents,
        vat21Cents: transaction.vat21Cents,
        paymentMethod: transaction.paymentMethod,
        correctionReason: transaction.correctionReason,
        tenders: transactionTenders(transaction),
        lines: transaction.items.map((item, index) => ({
          productName: item.product.name,
          variant: item.product.variant,
          sku: item.product.sku,
          quantity: item.quantity,
          netRevenueCents: netAmountForLine(transaction, index),
          vatRate: item.product.vatRate,
        })),
      }))
      .sort((left, right) => right.timestamp - left.timestamp),
  };
};

const netAmountForLine = (transaction: Transaction, index: number) => {
  const gross = transaction.items.map((item) =>
    (item.product.priceCents +
      (item.modifiers ?? []).reduce((sum, modifier) => sum + modifier.deltaCents, 0)) *
    item.quantity,
  );
  const discounts = allocateCents(Math.abs(transaction.discountCents), gross);
  const direction = (transaction.kind ?? "sale") === "refund" ? -1 : 1;
  return (gross[index] - discounts[index]) * direction;
};

export const loadDailyReportDetail = async (
  report: DailyReport,
  allTransactions: Transaction[],
  storeId?: string | null,
): Promise<DailyReportDetail> => {
  if (storeId && report.serverId) {
    const { data, error } = await supabase.rpc("get_daily_report_detail", {
      target_store_id: storeId,
      target_daily_report_id: report.serverId,
    });
    if (!error && data) return mapServerDetail(data);
    if (error) throw error;
  }
  return deriveOfflineDetail(report, allTransactions);
};

const mapDaySummary = (value: unknown): DailyReportDaySummary => {
  const row = object(value);
  return {
    date: string(row.date),
    reportCount: number(row.reportCount),
    firstReportNumber: number(row.firstReportNumber),
    lastReportNumber: number(row.lastReportNumber),
    transactionCount: number(row.transactionCount),
    totalRevenueCents: number(row.totalRevenueCents),
    totalCostCents: number(row.totalCostCents),
    grossProfitCents: number(row.grossProfitCents),
    totalVat12Cents: number(row.totalVat12Cents),
    totalVat21Cents: number(row.totalVat21Cents),
    cashCents: number(row.cashCents),
    pinCents: number(row.pinCents),
    giftCardCents: number(row.giftCardCents),
    cashDifferenceCents: number(row.cashDifferenceCents),
  };
};

export const loadDailyReportDaySummaries = async (
  reports: DailyReport[],
  storeId?: string | null,
): Promise<DailyReportDaySummary[]> => {
  if (storeId) {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Brussels";
    const { data, error } = await supabase.rpc("get_daily_report_day_summaries", {
      target_store_id: storeId,
      business_timezone: timezone,
    });
    if (!error && data) return array(data).map(mapDaySummary);
  }
  const grouped = new Map<string, DailyReportDaySummary>();
  for (const report of reports) {
    const date = format(report.timestamp, "yyyy-MM-dd");
    const current = grouped.get(date) ?? {
      date,
      reportCount: 0,
      firstReportNumber: report.reportNumber,
      lastReportNumber: report.reportNumber,
      transactionCount: 0,
      totalRevenueCents: 0,
      totalCostCents: 0,
      grossProfitCents: 0,
      totalVat12Cents: 0,
      totalVat21Cents: 0,
      cashCents: 0,
      pinCents: 0,
      giftCardCents: 0,
      cashDifferenceCents: 0,
    };
    current.reportCount += 1;
    current.firstReportNumber = Math.min(current.firstReportNumber, report.reportNumber);
    current.lastReportNumber = Math.max(current.lastReportNumber, report.reportNumber);
    current.transactionCount += report.transactionIds.length;
    current.totalRevenueCents += report.totalRevenueCents;
    current.totalCostCents += report.totalCostCents;
    current.grossProfitCents += report.grossProfitCents;
    current.totalVat12Cents += report.totalVat12Cents;
    current.totalVat21Cents += report.totalVat21Cents;
    current.cashCents += report.paymentTotalsCents.Cash;
    current.pinCents += report.paymentTotalsCents.PIN;
    current.giftCardCents += report.paymentTotalsCents.Cadeaubon;
    current.cashDifferenceCents += report.cashDifferenceCents ?? 0;
    grouped.set(date, current);
  }
  return [...grouped.values()].sort((left, right) => right.date.localeCompare(left.date));
};
