import { OrderItem } from '../types';
import { allocateCents, type Cents } from './money';

export const STANDARD_BELGIAN_RETAIL_VAT_RATE = 21;

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

const getVatRate = (order: OrderItem): number =>
  Number.isFinite(order.product.vatRate) && order.product.vatRate > 0
    ? order.product.vatRate
    : STANDARD_BELGIAN_RETAIL_VAT_RATE;

/** Pure integer-cent Belgian VAT calculation for gross retail prices. */
export const calculateTotals = (
  orders: OrderItem[],
  discount: Cents = 0,
): Totals => {
  let subtotal12: Cents = 0;
  let subtotal21: Cents = 0;

  for (const order of orders) {
    const modifierTotal = (order.modifiers ?? []).reduce(
      (sum, m) => sum + m.deltaCents,
      0,
    );
    const lineTotal = (order.product.priceCents + modifierTotal) * order.quantity;
    if (getVatRate(order) === 12) subtotal12 += lineTotal;
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
