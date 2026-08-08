import { describe, expect, it } from 'vitest';
import { Transaction } from '../types';
import { buildSalesChart } from './retailCharts';

const transaction = (timestamp: number, totalCents: number, costPriceCents: number): Transaction => ({
  tableId: 1,
  items: [{
    lineId: `line-${timestamp}`,
    product: { id: 'product', name: 'Product', category: 'retail', priceCents: totalCents, costPriceCents, vatRate: 21 },
    quantity: 1,
  }],
  subtotalCents: totalCents,
  vat12Cents: 0,
  vat21Cents: 0,
  totalCents,
  discountCents: 0,
  paymentMethod: 'PIN',
  timestamp,
  isFinalized: 0,
});

describe('buildSalesChart', () => {
  it('uses only stored transactions and leaves empty days at zero', () => {
    const now = new Date(2026, 7, 5, 12);
    const result = buildSalesChart([
      transaction(new Date(2026, 7, 5, 10).getTime(), 5000, 2000),
      transaction(new Date(2026, 7, 3, 10).getTime(), 3000, 1000),
    ], '7d', now);

    expect(result).toHaveLength(7);
    expect(result.at(-1)).toMatchObject({ revenueCents: 5000, grossProfitCents: 3000, transactionCount: 1 });
    expect(result.at(-3)).toMatchObject({ revenueCents: 3000, grossProfitCents: 2000, transactionCount: 1 });
    expect(result.at(-2)).toMatchObject({ revenueCents: 0, transactionCount: 0 });
  });
});
