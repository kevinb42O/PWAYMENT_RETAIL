import { PaymentTender, Product, Transaction } from '../types';
import { settlementTotalCents } from './cashRounding';
import { allocateCents } from './money';

export const DEFAULT_REGISTER_ID = 'retail-register-1';

export const isGiftCardProduct = (product: Pick<Product, 'productType' | 'name' | 'subCategory'>): boolean => {
  if (product.productType === 'gift-card') return true;
  const name = product.name.trim().toLocaleLowerCase('nl-BE');
  const subCategory = product.subCategory?.trim().toLocaleLowerCase('nl-BE') ?? '';
  return name === 'gift card' || name === 'cadeaubon' || subCategory === 'cadeaubonnen';
};

/**
 * Return a complete tender ledger for current and legacy transaction rows.
 * Malformed split rows deliberately return an empty array so callers can
 * reject/quarantine them instead of creating NaN totals.
 */
export const transactionTenders = (transaction: Transaction): PaymentTender[] => {
  const rows = transaction.tenders ?? transaction.splitTenders;
  // An explicitly empty array is malformed for a positive sale and must not
  // silently fall back to a fabricated tender; report integrity will quarantine it.
  if (rows) {
    return rows.filter((row) =>
      ['Cash', 'PIN', 'Cadeaubon'].includes(row.method)
      && Number.isSafeInteger(row.amountCents)
      && row.amountCents !== 0,
    );
  }
  if (transaction.paymentMethod === 'Split') return [];
  return [{
    method: transaction.paymentMethod,
    amountCents: settlementTotalCents(transaction),
  }];
};

export const tenderTotalCents = (transaction: Transaction): number =>
  transactionTenders(transaction).reduce((sum, tender) => sum + tender.amountCents, 0);

export const isLiveTransaction = (transaction: Transaction): boolean =>
  (transaction.source ?? 'live') !== 'demo';

export const commerceItems = (transaction: Transaction) =>
  transaction.items.filter((item) => !isGiftCardProduct(item.product));

export const commerceGrossLineTotalCents = (transaction: Transaction): number =>
  commerceItems(transaction).reduce((sum, item) => {
    const modifiers = (item.modifiers ?? []).reduce((modifierSum, modifier) => modifierSum + modifier.deltaCents, 0);
    return sum + (item.product.priceCents + modifiers) * item.quantity;
  }, 0);

export const transactionCostCents = (transaction: Transaction): number =>
  commerceItems(transaction).reduce(
    (sum, item) => sum + (item.product.costPriceCents ?? 0) * item.quantity,
    0,
  ) * ((transaction.kind ?? 'sale') === 'refund' ? -1 : 1);

export interface TransactionCommerceFinancials {
  /** Customer-facing commerce amount, VAT included. Gift-card liability excluded. */
  grossRevenueCents: number;
  /** Recoverable output VAT embedded in grossRevenueCents. */
  vatCents: number;
  /** Management revenue on a VAT-exclusive basis. */
  netRevenueExVatCents: number;
  costOfGoodsCents: number;
  grossProfitCents: number;
  giftCardLiabilityCents: number;
  completeCostPricing: boolean;
}

/**
 * Canonical management view of one sale/refund. This deliberately differs
 * from settlement totals: VAT is not revenue and issued gift-card value is a
 * liability. Refunds reverse both revenue and product cost.
 */
export const transactionCommerceFinancials = (
  transaction: Transaction,
): TransactionCommerceFinancials => {
  const direction = (transaction.kind ?? 'sale') === 'refund' ? -1 : 1;
  const grossLines = transaction.items.map((item) => {
    const modifiers = (item.modifiers ?? []).reduce(
      (sum, modifier) => sum + modifier.deltaCents,
      0,
    );
    return Math.abs((item.product.priceCents + modifiers) * item.quantity);
  });
  const allocatedRevenue = allocateCents(Math.abs(transaction.totalCents), grossLines);
  const commerce = commerceItems(transaction);
  const grossRevenueCents = allocatedRevenue.reduce(
    (sum, revenue, index) =>
      sum + (isGiftCardProduct(transaction.items[index].product) ? 0 : revenue),
    0,
  ) * direction;
  const giftCardLiabilityCents =
    (Math.abs(transaction.totalCents) - Math.abs(grossRevenueCents)) * direction;
  const storedVat = transaction.vatBreakdown?.map((line) => ({
    ...line,
    grossCents: Math.abs(line.grossCents),
    exclCents: Math.abs(line.exclCents),
    vatCents: Math.abs(line.vatCents),
  }));
  const storedVatReconciles = Boolean(
    storedVat?.length &&
    storedVat.every(
      (line) =>
        Number.isSafeInteger(line.grossCents) &&
        Number.isSafeInteger(line.exclCents) &&
        Number.isSafeInteger(line.vatCents) &&
        line.grossCents === line.exclCents + line.vatCents,
    ) &&
    storedVat.reduce((sum, line) => sum + line.grossCents, 0) ===
      Math.abs(grossRevenueCents),
  );
  const rawVat = storedVatReconciles
    ? storedVat!
    : [...transaction.items.reduce((byRate, item, index) => {
        if (isGiftCardProduct(item.product)) return byRate;
        const rate = item.product.vatRate;
        byRate.set(rate, (byRate.get(rate) ?? 0) + (allocatedRevenue[index] ?? 0));
        return byRate;
      }, new Map<number, number>())].map(([rate, grossCents]) => {
        const exclCents = rate === 0
          ? grossCents
          : Math.round(grossCents / (1 + rate / 100));
        return { rate, grossCents, exclCents, vatCents: grossCents - exclCents };
      });
  const vatCents = rawVat.reduce((sum, line) => sum + line.vatCents, 0) * direction;
  const netRevenueExVatCents = rawVat.reduce(
    (sum, line) => sum + line.exclCents,
    0,
  ) * direction;
  const costOfGoodsCents = transactionCostCents(transaction);
  const completeCostPricing = commerce.every(
    (item) =>
      Number.isSafeInteger(item.product.costPriceCents) &&
      item.product.costPriceCents! >= 0,
  );

  return {
    grossRevenueCents,
    vatCents,
    netRevenueExVatCents,
    costOfGoodsCents,
    grossProfitCents: netRevenueExVatCents - costOfGoodsCents,
    giftCardLiabilityCents,
    completeCostPricing,
  };
};

export interface TransactionCommerceLineFinancials {
  item: Transaction["items"][number];
  netRevenueExVatCents: number;
  costOfGoodsCents: number;
  grossProfitCents: number;
}

/** Exact line allocation that reconciles to transactionCommerceFinancials. */
export const transactionCommerceLineFinancials = (
  transaction: Transaction,
): TransactionCommerceLineFinancials[] => {
  const summary = transactionCommerceFinancials(transaction);
  const direction = (transaction.kind ?? "sale") === "refund" ? -1 : 1;
  const items = commerceItems(transaction);
  const weights = items.map((item) => {
    const modifiers = (item.modifiers ?? []).reduce(
      (sum, modifier) => sum + modifier.deltaCents,
      0,
    );
    const gross = Math.abs((item.product.priceCents + modifiers) * item.quantity);
    return item.product.vatRate === 0
      ? gross
      : Math.round(gross / (1 + item.product.vatRate / 100));
  });
  const netRevenue = allocateCents(
    Math.abs(summary.netRevenueExVatCents),
    weights,
  );
  return items.map((item, index) => {
    const netRevenueExVatCents = (netRevenue[index] ?? 0) * direction;
    const costOfGoodsCents =
      (item.product.costPriceCents ?? 0) * item.quantity * direction;
    return {
      item,
      netRevenueExVatCents,
      costOfGoodsCents,
      grossProfitCents: netRevenueExVatCents - costOfGoodsCents,
    };
  });
};
