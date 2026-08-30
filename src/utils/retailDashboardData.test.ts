import { describe, expect, it } from 'vitest';
import { Transaction } from '../types';
import { buildCategoryPerformance, buildPaymentMix, buildSalesHistory } from './retailDashboardData';

const transaction = (overrides: Partial<Transaction> = {}): Transaction => ({
  tableId: 1,
  items: [{
    lineId: 'line',
    product: { id: 'shirt', name: 'T-shirt', category: 'Kleding', priceCents: 1000, costPriceCents: 400, vatRate: 21 },
    quantity: 1,
  }],
  subtotalCents: 1000,
  vat12Cents: 0,
  vat21Cents: 174,
  totalCents: 1000,
  discountCents: 0,
  paymentMethod: 'PIN',
  timestamp: new Date(2026, 7, 5, 11).getTime(),
  isFinalized: 1,
  ...overrides,
});

describe('retail dashboard data', () => {
  it('groups actual sales by category, payment method and period', () => {
    const rows = [
      transaction(),
      transaction({
        totalCents: 2000,
        paymentMethod: 'Cash',
        timestamp: new Date(2026, 6, 24, 11).getTime(),
        customerId: 'customer-1',
      }),
    ];

    expect(buildCategoryPerformance(rows)).toMatchObject([{ category: 'Kleding', revenueCents: 2479, grossProfitCents: 1679, units: 2 }]);
    expect(buildPaymentMix(rows)).toEqual([
      { method: 'Cash', amountCents: 2000, transactionCount: 1 },
      { method: 'Kaart', amountCents: 1000, transactionCount: 1 },
    ]);
    expect(buildSalesHistory(rows, 'month')).toHaveLength(2);
    expect(buildSalesHistory(rows, 'month')[0]).toMatchObject({ transactionCount: 1, revenueCents: 1000 });
  });
});
