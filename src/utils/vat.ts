import { OrderItem } from '../types';
import { allocateCents, type Cents } from './money';

export const STANDARD_BELGIAN_RETAIL_VAT_RATE = 21;

/**
 * The only rates this engine can book. Anything else must be rejected at the
 * write boundary — the extraction divisors and the `vat12Cents`/`vat21Cents`
 * columns cannot represent other rates.
 */
export const SUPPORTED_VAT_RATES = [12, 21] as const;

export type SupportedVatRate = (typeof SUPPORTED_VAT_RATES)[number];

export const isSupportedVatRate = (rate: unknown): rate is SupportedVatRate =>
  rate === 12 || rate === 21;

export class UnsupportedVatRateError extends Error {
  readonly rate: unknown;
  readonly productName?: string;

  constructor(rate: unknown, productName?: string) {
    super(
      `BTW-tarief ${String(rate)}% wordt niet ondersteund${productName ? ` (${productName})` : ''}. ` +
        `Enkel ${SUPPORTED_VAT_RATES.join('% en ')}% zijn toegelaten.`,
    );
    this.name = 'UnsupportedVatRateError';
    this.rate = rate;
    this.productName = productName;
  }
}

/** Lines whose VAT rate the engine cannot book. Empty means safe to check out. */
export const findUnsupportedVatItems = (orders: OrderItem[]): OrderItem[] =>
  orders.filter((o) => !isSupportedVatRate(o.product.vatRate));

export const assertSupportedVatRates = (orders: OrderItem[]): void => {
  const bad = findUnsupportedVatItems(orders)[0];
  if (bad) throw new UnsupportedVatRateError(bad.product.vatRate, bad.product.name);
};

export interface Totals {
  subtotal: Cents;
  discount: Cents;
  total: Cents;
  vat12: Cents;
  vat21: Cents;
  exclVat12: Cents;
  exclVat21: Cents;
  discounted12: Cents;
  discounted21: Cents;
}

/**
 * Pure integer-cent Belgian VAT calculation for gross retail prices.
 * Throws `UnsupportedVatRateError` instead of silently booking unknown rates at 21%.
 */
export const calculateTotals = (
  orders: OrderItem[],
  discount: Cents = 0,
): Totals => {
  let subtotal12: Cents = 0;
  let subtotal21: Cents = 0;

  for (const order of orders) {
    if (!isSupportedVatRate(order.product.vatRate)) {
      throw new UnsupportedVatRateError(order.product.vatRate, order.product.name);
    }
    const modifierTotal = (order.modifiers ?? []).reduce(
      (sum, m) => sum + m.deltaCents,
      0,
    );
    const lineTotal = (order.product.priceCents + modifierTotal) * order.quantity;
    if (order.product.vatRate === 12) subtotal12 += lineTotal;
    else subtotal21 += lineTotal;
  }

  const subtotal = subtotal12 + subtotal21;
  const cappedDiscount = Math.max(0, Math.min(discount, subtotal));
  const [d12, d21] = allocateCents(cappedDiscount, [subtotal12, subtotal21]);
  const discounted12 = Math.max(0, subtotal12 - d12);
  const discounted21 = Math.max(0, subtotal21 - d21);

  const exclVat12 = Math.round(discounted12 / 1.12);
  const exclVat21 = Math.round(discounted21 / 1.21);
  const vat12 = discounted12 - exclVat12;
  const vat21 = discounted21 - exclVat21;

  return {
    subtotal,
    discount: cappedDiscount,
    total: discounted12 + discounted21,
    vat12,
    vat21,
    exclVat12,
    exclVat21,
    discounted12,
    discounted21,
  };
};
