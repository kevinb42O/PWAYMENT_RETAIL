import { PaymentMethod, Transaction } from '../types';

export interface CategoryPerformance {
  category: string;
  revenueCents: number;
  grossProfitCents: number;
  units: number;
}

export interface PaymentMixItem {
  method: PaymentMethod | 'Kaart';
  amountCents: number;
  transactionCount: number;
}

export interface SalesHistoryRow {
  key: string;
  label: string;
  timestamp: number;
  transactionCount: number;
  revenueCents: number;
  discountCents: number;
  cashCents: number;
  pinCents: number;
  linkedCustomerCount: number;
}

const lineTotal = (transaction: Transaction) => transaction.items.reduce((total, item) => {
  const modifierCents = (item.modifiers ?? []).reduce((sum, modifier) => sum + modifier.deltaCents, 0);
  return total + (item.product.priceCents + modifierCents) * item.quantity;
}, 0);

const transactionPayments = (transaction: Transaction): Array<{ method: PaymentMethod | 'Kaart'; amountCents: number }> => {
  if (transaction.paymentMethod === 'Split' && transaction.splitTenders?.length) {
    return transaction.splitTenders.map((tender) => ({
      method: tender.method === 'PIN' ? 'Kaart' : tender.method,
      amountCents: tender.amountCents,
    }));
  }
  return [{ method: transaction.paymentMethod === 'PIN' ? 'Kaart' : transaction.paymentMethod, amountCents: transaction.totalCents }];
};

/** Revenue and gross profit by sold product category, allocated from actual receipts. */
export const buildCategoryPerformance = (transactions: Transaction[]): CategoryPerformance[] => {
  const categories = new Map<string, CategoryPerformance>();

  for (const transaction of transactions) {
    const totalLines = lineTotal(transaction);
    for (const item of transaction.items) {
      const modifierCents = (item.modifiers ?? []).reduce((sum, modifier) => sum + modifier.deltaCents, 0);
      const grossLineCents = (item.product.priceCents + modifierCents) * item.quantity;
      const allocatedRevenue = totalLines > 0 ? Math.round(transaction.totalCents * (grossLineCents / totalLines)) : 0;
      const category = item.product.category || 'Ongecategoriseerd';
      const current = categories.get(category) ?? { category, revenueCents: 0, grossProfitCents: 0, units: 0 };
      current.revenueCents += allocatedRevenue;
      current.grossProfitCents += allocatedRevenue - (item.product.costPriceCents ?? 0) * item.quantity;
      current.units += item.quantity;
      categories.set(category, current);
    }
  }

  return [...categories.values()].sort((a, b) => b.revenueCents - a.revenueCents);
};

export const buildPaymentMix = (transactions: Transaction[]): PaymentMixItem[] => {
  const methods = new Map<PaymentMethod | 'Kaart', PaymentMixItem>();
  for (const transaction of transactions) {
    for (const payment of transactionPayments(transaction)) {
      const current = methods.get(payment.method) ?? { method: payment.method, amountCents: 0, transactionCount: 0 };
      current.amountCents += payment.amountCents;
      current.transactionCount += 1;
      methods.set(payment.method, current);
    }
  }
  return [...methods.values()].sort((a, b) => b.amountCents - a.amountCents);
};

export const buildSalesHistory = (transactions: Transaction[], granularity: 'day' | 'month'): SalesHistoryRow[] => {
  const formatter = new Intl.DateTimeFormat('nl-BE', granularity === 'day'
    ? { day: '2-digit', month: 'short', year: 'numeric' }
    : { month: 'long', year: 'numeric' });
  const rows = new Map<string, SalesHistoryRow>();

  for (const transaction of transactions) {
    const date = new Date(transaction.timestamp);
    const bucketDate = granularity === 'day'
      ? new Date(date.getFullYear(), date.getMonth(), date.getDate())
      : new Date(date.getFullYear(), date.getMonth(), 1);
    const key = granularity === 'day'
      ? `${bucketDate.getFullYear()}-${String(bucketDate.getMonth() + 1).padStart(2, '0')}-${String(bucketDate.getDate()).padStart(2, '0')}`
      : `${bucketDate.getFullYear()}-${String(bucketDate.getMonth() + 1).padStart(2, '0')}`;
    const row = rows.get(key) ?? {
      key,
      label: formatter.format(bucketDate).replace('.', ''),
      timestamp: bucketDate.getTime(),
      transactionCount: 0,
      revenueCents: 0,
      discountCents: 0,
      cashCents: 0,
      pinCents: 0,
      linkedCustomerCount: 0,
    };
    row.transactionCount += 1;
    row.revenueCents += transaction.totalCents;
    row.discountCents += transaction.discountCents;
    if (transaction.customerId) row.linkedCustomerCount += 1;
    for (const payment of transactionPayments(transaction)) {
      if (payment.method === 'Cash') row.cashCents += payment.amountCents;
      if (payment.method === 'Kaart') row.pinCents += payment.amountCents;
    }
    rows.set(key, row);
  }

  return [...rows.values()].sort((a, b) => b.timestamp - a.timestamp);
};
