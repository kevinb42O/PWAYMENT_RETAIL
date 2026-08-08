import { describe, it, expect } from 'vitest';
import { calculateTotals, findUnsupportedVatItems, UnsupportedVatRateError } from './vat';
import { OrderItem } from '../types';

const item = (
  priceCents: number,
  qty: number,
  vatRate = 21,
): OrderItem => ({
  lineId: `l-${priceCents}-${vatRate}`,
  product: {
    id: `p-${priceCents}-${vatRate}`,
    name: 'Deck',
    category: 'decks',
    priceCents,
    costPriceCents: Math.round(priceCents / 2),
    vatRate,
  },
  quantity: qty,
});

describe('calculateTotals', () => {
  it('returns zeros for empty cart', () => {
    expect(calculateTotals([], 0).total).toBe(0);
  });

  it('uses Belgian 21% retail VAT by product rate', () => {
    const t = calculateTotals([item(1210, 1)]);
    expect(t.subtotal).toBe(1210);
    expect(t.discounted21).toBe(1210);
    expect(t.discounted12).toBe(0);
    expect(t.exclVat21).toBe(1000);
    expect(t.vat21).toBe(210);
  });

  it('caps a discount that exceeds the subtotal', () => {
    const t = calculateTotals([item(500, 1)], 9999);
    expect(t.total).toBe(0);
    expect(t.discount).toBe(500);
  });

  it('keeps total = subtotal - discount exactly to the cent', () => {
    const orders = [
      item(6495, 1),
      item(3995, 2),
      item(995, 1),
    ];
    const t = calculateTotals(orders, 137);
    expect(t.subtotal).toBe(6495 + 3995 * 2 + 995);
    expect(t.total).toBe(t.subtotal - 137);
    expect(t.exclVat12 + t.vat12 + t.exclVat21 + t.vat21).toBe(t.total);
  });

  it('allocates discount proportionally when multiple rates exist', () => {
    const t = calculateTotals([item(1000, 1, 12), item(1000, 1, 21)], 200);
    expect(t.discounted12).toBe(900);
    expect(t.discounted21).toBe(900);
  });

  it('rejects rates the engine cannot book instead of silently taxing at 21%', () => {
    for (const rate of [0, 6, 9, 25, Number.NaN]) {
      const order = item(1060, 1);
      order.product.vatRate = rate;
      expect(() => calculateTotals([order])).toThrow(UnsupportedVatRateError);
    }
  });

  it('reports which lines block checkout', () => {
    const bad = item(1060, 1);
    bad.product.vatRate = 6;
    expect(findUnsupportedVatItems([item(1210, 1), bad])).toEqual([bad]);
    expect(findUnsupportedVatItems([item(1210, 1), item(1120, 1, 12)])).toEqual([]);
  });
});
