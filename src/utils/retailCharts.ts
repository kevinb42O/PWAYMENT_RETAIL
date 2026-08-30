import { Transaction } from '../types';
import { transactionCommerceFinancials } from './financial';

export type InsightPeriod = '7d' | '30d' | '12m';

export interface SalesChartPoint {
  key: string;
  label: string;
  revenueCents: number;
  grossProfitCents: number;
  transactionCount: number;
}

const startOfDay = (date: Date): Date => {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
};

const startOfMonth = (date: Date): Date => new Date(date.getFullYear(), date.getMonth(), 1);

const dayKey = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const monthKey = (date: Date): string => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

/** Builds an actual sales series from stored transactions; empty intervals stay zero. */
export const buildSalesChart = (
  transactions: Transaction[],
  period: InsightPeriod,
  now = new Date(),
): SalesChartPoint[] => {
  const formatter = new Intl.DateTimeFormat('nl-BE', period === '12m'
    ? { month: 'short' }
    : { day: '2-digit', month: 'short' });

  const buckets = new Map<string, SalesChartPoint>();
  const current = period === '12m' ? startOfMonth(now) : startOfDay(now);
  const intervalCount = period === '7d' ? 7 : period === '30d' ? 30 : 12;

  for (let index = intervalCount - 1; index >= 0; index -= 1) {
    const bucketDate = new Date(current);
    if (period === '12m') bucketDate.setMonth(bucketDate.getMonth() - index);
    else bucketDate.setDate(bucketDate.getDate() - index);

    const key = period === '12m' ? monthKey(bucketDate) : dayKey(bucketDate);
    buckets.set(key, {
      key,
      label: formatter.format(bucketDate).replace('.', ''),
      revenueCents: 0,
      grossProfitCents: 0,
      transactionCount: 0,
    });
  }

  for (const transaction of transactions) {
    const timestamp = new Date(transaction.timestamp);
    const key = period === '12m' ? monthKey(timestamp) : dayKey(timestamp);
    const bucket = buckets.get(key);
    if (!bucket) continue;
    const financials = transactionCommerceFinancials(transaction);
    bucket.revenueCents += financials.netRevenueExVatCents;
    bucket.grossProfitCents += financials.grossProfitCents;
    bucket.transactionCount += 1;
  }

  return [...buckets.values()];
};
