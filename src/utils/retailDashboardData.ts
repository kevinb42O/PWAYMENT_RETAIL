import { PaymentMethod, Transaction } from "../types";
import { allocateCents } from "./money";
import { isGiftCardProduct, transactionTenders } from "./financial";
import { productRootCategoryLabel } from "../catalog/categoryTaxonomy";
import {
  getZonedDateParts,
  STORE_TIME_ZONE,
  zonedDateTimeToTimestamp,
} from "./time";

export interface CategoryPerformance {
  category: string;
  revenueCents: number;
  grossProfitCents: number;
  units: number;
}

export interface PaymentMixItem {
  method: PaymentMethod | "Kaart";
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
  giftCardCents: number;
  linkedCustomerCount: number;
}

const transactionPayments = (
  transaction: Transaction,
): Array<{ method: PaymentMethod | "Kaart"; amountCents: number }> => {
  const tenders = transactionTenders(transaction);
  if (tenders.length) {
    return tenders.map((tender) => ({
      method: tender.method === "PIN" ? "Kaart" : tender.method,
      amountCents: tender.amountCents,
    }));
  }
  return [
    {
      method:
        transaction.paymentMethod === "PIN"
          ? "Kaart"
          : transaction.paymentMethod,
      amountCents: transaction.totalCents,
    },
  ];
};

/** Revenue and gross profit by sold product category, allocated from actual receipts. */
export const buildCategoryPerformance = (
  transactions: Transaction[],
): CategoryPerformance[] => {
  const categories = new Map<string, CategoryPerformance>();

  for (const transaction of transactions) {
    const commerceItems = transaction.items.filter(
      (item) => !isGiftCardProduct(item.product),
    );
    const lineTotals = commerceItems.map((item) => {
      const modifiers = (item.modifiers ?? []).reduce(
        (sum, modifier) => sum + modifier.deltaCents,
        0,
      );
      return (item.product.priceCents + modifiers) * item.quantity;
    });
    const allocated = allocateCents(transaction.totalCents, lineTotals);
    for (const [index, item] of commerceItems.entries()) {
      const allocatedRevenue = allocated[index] ?? 0;
      const category = productRootCategoryLabel(item.product);
      const current = categories.get(category) ?? {
        category,
        revenueCents: 0,
        grossProfitCents: 0,
        units: 0,
      };
      current.revenueCents += allocatedRevenue;
      current.grossProfitCents +=
        allocatedRevenue - (item.product.costPriceCents ?? 0) * item.quantity;
      current.units += item.quantity;
      categories.set(category, current);
    }
  }

  return [...categories.values()].sort(
    (a, b) => b.revenueCents - a.revenueCents,
  );
};

export const buildPaymentMix = (
  transactions: Transaction[],
): PaymentMixItem[] => {
  const methods = new Map<PaymentMethod | "Kaart", PaymentMixItem>();
  for (const transaction of transactions) {
    for (const payment of transactionPayments(transaction)) {
      const current = methods.get(payment.method) ?? {
        method: payment.method,
        amountCents: 0,
        transactionCount: 0,
      };
      current.amountCents += payment.amountCents;
      current.transactionCount += 1;
      methods.set(payment.method, current);
    }
  }
  return [...methods.values()].sort((a, b) => b.amountCents - a.amountCents);
};

export const buildSalesHistory = (
  transactions: Transaction[],
  granularity: "day" | "month",
): SalesHistoryRow[] => {
  const formatter = new Intl.DateTimeFormat(
    "nl-BE",
    granularity === "day"
      ? {
          day: "2-digit",
          month: "short",
          year: "numeric",
          timeZone: STORE_TIME_ZONE,
        }
      : { month: "long", year: "numeric", timeZone: STORE_TIME_ZONE },
  );
  const rows = new Map<string, SalesHistoryRow>();

  for (const transaction of transactions) {
    const date = getZonedDateParts(transaction.timestamp);
    const bucketTimestamp = zonedDateTimeToTimestamp(
      date.year,
      date.month,
      granularity === "day" ? date.day : 1,
    );
    const bucketDate = new Date(bucketTimestamp);
    const key =
      granularity === "day"
        ? `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`
        : `${date.year}-${String(date.month).padStart(2, "0")}`;
    const row = rows.get(key) ?? {
      key,
      label: formatter.format(bucketDate).replace(".", ""),
      timestamp: bucketDate.getTime(),
      transactionCount: 0,
      revenueCents: 0,
      discountCents: 0,
      cashCents: 0,
      pinCents: 0,
      giftCardCents: 0,
      linkedCustomerCount: 0,
    };
    row.transactionCount += 1;
    row.revenueCents += transaction.totalCents;
    row.discountCents += transaction.discountCents;
    if (transaction.customerId) row.linkedCustomerCount += 1;
    for (const payment of transactionPayments(transaction)) {
      if (payment.method === "Cash") row.cashCents += payment.amountCents;
      if (payment.method === "Kaart") row.pinCents += payment.amountCents;
      if (payment.method === "Cadeaubon")
        row.giftCardCents += payment.amountCents;
    }
    rows.set(key, row);
  }

  return [...rows.values()].sort((a, b) => b.timestamp - a.timestamp);
};
