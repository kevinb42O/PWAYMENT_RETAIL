import { OrderItem } from '../types';
import { allocateCents, type Cents } from './money';

export const STANDARD_BELGIAN_RETAIL_VAT_RATE = 21;

/**
 * Rates used by Belgian retail catalogues. They are deliberately enumerated:
 * a rate outside this set must never be silently booked at a different rate.
 */
export const SUPPORTED_VAT_RATES = [0, 6, 12, 21] as const;

export type SupportedVatRate = (typeof SUPPORTED_VAT_RATES)[number];

export const isSupportedVatRate = (rate: unknown): rate is SupportedVatRate =>
  rate === 0 || rate === 6 || rate === 12 || rate === 21;

export class UnsupportedVatRateError extends Error {
  readonly rate: unknown;
  readonly productName?: string;

  constructor(rate: unknown, productName?: string) {
    super(
      `BTW-tarief ${String(rate)}% wordt niet ondersteund${productName ? ` (${productName})` : ''}. ` +
        `Enkel ${SUPPORTED_VAT_RATES.map((supportedRate) => `${supportedRate}%`).join(", ")} zijn toegelaten.`,
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

/** Immutable tax snapshot for one rate in a transaction. All amounts are cents. */
export interface VatBreakdownLine {
  rate: SupportedVatRate;
  grossCents: Cents;
  exclCents: Cents;
  vatCents: Cents;
}

export type VatBreakdown = VatBreakdownLine[];

export interface Totals {
  subtotal: Cents;
  discount: Cents;
  total: Cents;
  vatBreakdown: VatBreakdown;
  /** Legacy compatibility projections. New UI must prefer `vatBreakdown`. */
  vat12: Cents;
  vat21: Cents;
  exclVat12: Cents;
  exclVat21: Cents;
  discounted12: Cents;
  discounted21: Cents;
}

const zeroLine = (rate: SupportedVatRate): VatBreakdownLine => ({
  rate,
  grossCents: 0,
  exclCents: 0,
  vatCents: 0,
});

const excludingVat = (grossCents: Cents, rate: SupportedVatRate): Cents =>
  rate === 0 ? grossCents : Math.round(grossCents / (1 + rate / 100));

/**
 * Produces a deterministic, complete snapshot even when a historic row only
 * had the former 12/21 fields. Consumers can therefore use this helper while
 * old synced transactions remain readable during a rolling deployment.
 */
export const vatBreakdownForTransaction = (
  transaction: {
    items: OrderItem[];
    discountCents: Cents;
    vatBreakdown?: VatBreakdown;
    kind?: "sale" | "refund";
  },
): VatBreakdown => transaction.vatBreakdown?.length
  ? transaction.vatBreakdown
  : calculateTotals(transaction.items, Math.abs(transaction.discountCents)).vatBreakdown
    .map((line) => transaction.kind === "refund"
      ? {
          ...line,
          grossCents: -line.grossCents,
          exclCents: -line.exclCents,
          vatCents: -line.vatCents,
        }
      : line);

/**
 * Pure integer-cent Belgian retail VAT calculation for gross prices. A cart
 * discount is allocated over the rate buckets first, so the sum of all gross,
 * exclusive and VAT lines reconciles exactly to the receipt total.
 */
export const calculateTotals = (
  orders: OrderItem[],
  discount: Cents = 0,
): Totals => {
  const grossByRate = new Map<SupportedVatRate, Cents>(
    SUPPORTED_VAT_RATES.map((rate) => [rate, 0]),
  );

  for (const order of orders) {
    if (!isSupportedVatRate(order.product.vatRate)) {
      throw new UnsupportedVatRateError(order.product.vatRate, order.product.name);
    }
    const modifierTotal = (order.modifiers ?? []).reduce(
      (sum, modifier) => sum + modifier.deltaCents,
      0,
    );
    const lineTotal = (order.product.priceCents + modifierTotal) * order.quantity;
    grossByRate.set(order.product.vatRate, (grossByRate.get(order.product.vatRate) ?? 0) + lineTotal);
  }

  const grossBuckets = SUPPORTED_VAT_RATES.map((rate) => grossByRate.get(rate) ?? 0);
  const subtotal = grossBuckets.reduce((sum, value) => sum + value, 0);
  const cappedDiscount = Math.max(0, Math.min(discount, subtotal));
  const discounts = allocateCents(cappedDiscount, grossBuckets);
  const vatBreakdown = SUPPORTED_VAT_RATES.map((rate, index) => {
    const grossCents = Math.max(0, grossBuckets[index] - discounts[index]);
    const exclCents = excludingVat(grossCents, rate);
    return { rate, grossCents, exclCents, vatCents: grossCents - exclCents };
  }).filter((line) => line.grossCents > 0);
  const byRate = new Map(vatBreakdown.map((line) => [line.rate, line]));
  const at = (rate: SupportedVatRate): VatBreakdownLine => byRate.get(rate) ?? zeroLine(rate);

  return {
    subtotal,
    discount: cappedDiscount,
    total: subtotal - cappedDiscount,
    vatBreakdown,
    vat12: at(12).vatCents,
    vat21: at(21).vatCents,
    exclVat12: at(12).exclCents,
    exclVat21: at(21).exclCents,
    discounted12: at(12).grossCents,
    discounted21: at(21).grossCents,
  };
};
