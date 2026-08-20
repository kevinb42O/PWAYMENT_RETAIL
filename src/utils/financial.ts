import { PaymentTender, Product, Transaction } from '../types';
import { settlementTotalCents } from './cashRounding';

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
