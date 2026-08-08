import { describe, expect, it } from 'vitest';
import { Customer, Product, Transaction } from '../types';
import { buildRetailIntelligence } from './retailIntelligence';

const product: Product = {
  id: 'shirt',
  name: 'T-shirt',
  category: 'kleding',
  priceCents: 4000,
  costPriceCents: 1500,
  vatRate: 21,
  stockQty: 2,
  minStockQty: 2,
  isActive: true,
};

const transaction: Transaction = {
  id: 1,
  tableId: 1,
  items: [{ lineId: 'line', product, quantity: 1 }],
  subtotalCents: 4000,
  vat12Cents: 0,
  vat21Cents: 694,
  totalCents: 4000,
  discountCents: 250,
  paymentMethod: 'PIN',
  timestamp: Date.UTC(2026, 7, 5),
  isFinalized: 0,
  userId: 'cashier-1',
  userName: 'Mila',
};

const customer: Customer = {
  id: 'customer-1',
  name: 'Emma',
  totalSpentCents: 4000,
  visitCount: 1,
  lastVisitAt: '2026-05-01T09:00:00.000Z',
  createdAt: '2026-01-01T09:00:00.000Z',
  isActive: true,
};

describe('buildRetailIntelligence', () => {
  it('derives margin, stock, customer and employee insights from stored data', () => {
    const result = buildRetailIntelligence(
      [transaction],
      [product],
      [customer],
      Date.UTC(2026, 7, 5),
    );

    expect(result.revenueCents).toBe(4000);
    expect(result.costCents).toBe(1500);
    expect(result.grossProfitCents).toBe(2500);
    expect(result.lowStockProducts).toEqual([product]);
    expect(result.dormantCustomers).toEqual([customer]);
    expect(result.employeePerformance).toEqual([
      { userId: 'cashier-1', name: 'Mila', transactionCount: 1, revenueCents: 4000 },
    ]);
    expect(result.actions.map((action) => action.id)).toEqual(
      expect.arrayContaining(['low-stock', 'discounts', 'dormant-customers', 'team-activity']),
    );
  });

  it('returns an honest empty-state action when there is no operational data yet', () => {
    const result = buildRetailIntelligence([], [], [], Date.UTC(2026, 7, 5));
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0].id).toBe('collect-data');
    expect(result.grossMarginPercent).toBeNull();
  });
});
