import { db } from '../db/db';
import { DailyReport, Transaction } from '../types';
import { generateHash } from './crypto';
import { calculateTotals } from './vat';

export const getUnfinalizedTransactions = async (): Promise<Transaction[]> => {
  return await db.transactions.filter((t) => t.isFinalized === 0).toArray();
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
  paymentTotalsCents: { Cash: number; PIN: number; Cadeaubon: number; };
  transactionIds: number[];
  timestamp: number;
}

/** Aggregate a list of transactions — pure, integer-cent math. */
export const calculateReportData = (transactions: Transaction[]): ReportData => {
  const out: ReportData = {
    totalRevenueCents: 0,
    totalCostCents: 0,
    grossProfitCents: 0,
    totalVat12Cents: 0,
    totalVat21Cents: 0,
    totalExclVat12Cents: 0,
    totalExclVat21Cents: 0,
    totalDiscountCents: 0,
    paymentTotalsCents: { Cash: 0, PIN: 0, Cadeaubon: 0 },
    transactionIds: [],
    timestamp: Date.now(),
  };

  for (const t of transactions) {
    out.totalRevenueCents += t.totalCents;
    const transactionCostCents = t.items.reduce(
      (sum, item) => sum + (item.product.costPriceCents ?? 0) * item.quantity,
      0,
    );
    out.totalCostCents += transactionCostCents;
    out.grossProfitCents += t.totalCents - transactionCostCents;
    out.totalVat12Cents += t.vat12Cents;
    out.totalVat21Cents += t.vat21Cents;
    out.totalDiscountCents += t.discountCents;

    if (t.paymentMethod === 'Split' && t.splitTenders) {
      for (const tender of t.splitTenders) {
        out.paymentTotalsCents[tender.method] += tender.amountCents;
      }
    } else {
      out.paymentTotalsCents[t.paymentMethod as 'Cash' | 'PIN' | 'Cadeaubon'] += t.totalCents;
    }

    // Recompute exclVat from items so the report ties cleanly back to the source.
    const totals = calculateTotals(t.items, t.discountCents);
    out.totalExclVat12Cents += totals.exclVat12;
    out.totalExclVat21Cents += totals.exclVat21;

    if (t.id != null) out.transactionIds.push(t.id);
  }

  return out;
};

export interface FinalizeOptions {
  closedByUserId?: string;
  closedByUserName?: string;
}

/**
 * Generate a Z-report covering all currently open transactions, mark them as
 * finalised, and chain it to the previous Z-report via SHA-256.
 */
export const generateZReport = async (
  opts: FinalizeOptions = {},
): Promise<DailyReport | null> => {
  const transactions = await getUnfinalizedTransactions();
  if (transactions.length === 0) return null;

  const reportData = calculateReportData(transactions);
  const lastReport = await db.daily_reports.orderBy('reportNumber').last();
  const reportNumber = lastReport ? lastReport.reportNumber + 1 : 1;
  const prevHash = lastReport?.hash ?? null;
  const timestamp = Date.now();

  const dataToHash = JSON.stringify({
    reportNumber,
    timestamp,
    prevHash,
    totalRevenueCents: reportData.totalRevenueCents,
    totalCostCents: reportData.totalCostCents,
    grossProfitCents: reportData.grossProfitCents,
    totalVat12Cents: reportData.totalVat12Cents,
    totalVat21Cents: reportData.totalVat21Cents,
    totalExclVat12Cents: reportData.totalExclVat12Cents,
    totalExclVat21Cents: reportData.totalExclVat21Cents,
    totalDiscountCents: reportData.totalDiscountCents,

    paymentTotalsCents: reportData.paymentTotalsCents,
    transactionIds: reportData.transactionIds,
    closedByUserId: opts.closedByUserId ?? null,
  });
  const hash = await generateHash(dataToHash);

  const report: DailyReport = {
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
    paymentTotalsCents: reportData.paymentTotalsCents,
    transactionIds: reportData.transactionIds,
    hash,
    prevHash,
    closedByUserId: opts.closedByUserId,
    closedByUserName: opts.closedByUserName,
  };

  await db.transaction('rw', db.transactions, db.daily_reports, async () => {
    await db.daily_reports.add(report);
    const updates = transactions.map((t) => ({ ...t, isFinalized: 1 as const }));
    await db.transactions.bulkPut(updates);
  });

  return report;
};
