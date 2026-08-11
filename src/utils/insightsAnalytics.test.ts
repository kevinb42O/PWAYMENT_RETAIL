import { describe, expect, it } from 'vitest';
import { Product, Transaction } from '../types';
import {
  buildCustomerInsights,
  buildDataQuality,
  buildDiscountInsights,
  buildHourlyInsights,
  buildProductInsights,
  buildWeekdayInsights,
} from './insightsAnalytics';

const product: Product = {
  id: 'board',
  name: 'Board',
  category: 'Skateboards',
  priceCents: 10_000,
  costPriceCents: 4_000,
  vatRate: 21,
  stockQty: 8,
};

const sale = (timestamp: string, overrides: Partial<Transaction> = {}): Transaction => ({
  tableId: 1,
  items: [{ lineId: timestamp, product, quantity: 1 }],
  subtotalCents: 10_000,
  vat12Cents: 0,
  vat21Cents: 1_736,
  totalCents: 10_000,
  discountCents: 0,
  paymentMethod: 'PIN',
  timestamp: new Date(timestamp).getTime(),
  isFinalized: 1,
  ...overrides,
});

describe('insights analytics', () => {
  it('builds product performance with a comparable previous period', () => {
    const current = [sale('2026-08-10T10:00:00')];
    const previous = [sale('2026-07-10T10:00:00', { totalCents: 5_000 })];
    expect(buildProductInsights(current, previous)[0]).toMatchObject({
      productId: 'board',
      revenueCents: 10_000,
      previousRevenueCents: 5_000,
      changePercent: 100,
    });
  });

  it('groups actual store moments by weekday and hour', () => {
    const rows = [sale('2026-08-10T10:00:00'), sale('2026-08-10T10:30:00')];
    const monday = buildWeekdayInsights(rows)[0];
    expect(monday).toMatchObject({ label: 'Ma', revenueCents: 20_000, transactionCount: 2, averageSaleCents: 10_000 });
    expect(buildHourlyInsights(rows)).toEqual([{ key: '10', label: '10u', revenueCents: 20_000, transactionCount: 2, averageSaleCents: 10_000 }]);
  });

  it('measures return behaviour from ordered customer purchases', () => {
    const rows = [
      sale('2026-01-01T10:00:00', { customerId: 'c1' }),
      sale('2026-01-21T10:00:00', { customerId: 'c1' }),
      sale('2026-02-01T10:00:00', { customerId: 'c2' }),
    ];
    const snapshot = buildCustomerInsights(rows);
    expect(snapshot).toMatchObject({ recognizedCustomers: 2, oneTimeCustomers: 1, returningCustomers: 1, repeatRate: 50, averageDaysToSecondPurchase: 20 });
    expect(snapshot.returnBuckets[0].customers).toBe(1);
  });

  it('uses the average return time and hides unreliable product return cohorts', () => {
    const rows = [
      sale('2026-01-01T10:00:00', { customerId: 'c1' }),
      sale('2026-01-11T10:00:00', { customerId: 'c1' }),
      sale('2026-01-01T10:00:00', { customerId: 'c2' }),
      sale('2026-01-21T10:00:00', { customerId: 'c2' }),
      sale('2026-01-01T10:00:00', { customerId: 'c3' }),
      sale('2026-04-11T10:00:00', { customerId: 'c3' }),
    ];
    const snapshot = buildCustomerInsights(rows, [
      { id: 'c1', name: 'Ada', totalSpentCents: 0, visitCount: 0, createdAt: '', isActive: true },
      { id: 'c2', name: 'Bram', totalSpentCents: 0, visitCount: 0, createdAt: '', isActive: true },
    ]);
    expect(snapshot.averageDaysToSecondPurchase).toBe(43);
    expect(snapshot.gatewayProducts).toEqual([]);
    expect(snapshot.customerRows[0]).toMatchObject({ customerId: 'c1', customerName: 'Ada', purchases: 2 });
  });

  it('reports completeness without inventing missing sources', () => {
    const snapshot = buildDataQuality([product, { ...product, id: 'unknown', costPriceCents: undefined, stockQty: undefined }], [sale('2026-08-10T10:00:00', { customerId: 'c1', userId: 'u1' })], []);
    expect(snapshot).toMatchObject({ costPriceCoverage: 50, stockCoverage: 50, categoryCoverage: 100, customerLinkCoverage: 100, employeeLinkCoverage: 100 });
    expect(snapshot.sources.find((source) => source.key === 'customer')).toMatchObject({
      label: 'Klantkoppeling bij verkoop',
      entityLabel: 'verkopen',
    });
  });

  it('shows where discounts land and calculates margin after discount', () => {
    const snapshot = buildDiscountInsights([
      sale('2026-08-10T10:00:00', { totalCents: 8_000, discountCents: 2_000 }),
      sale('2026-08-10T11:00:00', { totalCents: 10_000, discountCents: 0 }),
    ]);

    expect(snapshot).toMatchObject({
      discountCents: 2_000,
      discountedTransactionCount: 1,
      grossSalesBeforeDiscountCents: 10_000,
      discountRate: 20,
      grossProfitAfterDiscountCents: 4_000,
      marginAfterDiscountPercent: 50,
    });
    expect(snapshot.categoryRows[0]).toMatchObject({
      label: 'Skateboards',
      discountCents: 2_000,
      transactionCount: 1,
      marginPercent: 50,
    });
  });

  it('does not present a margin when discounted lines miss a cost price', () => {
    const withoutCost = { ...product, costPriceCents: undefined };
    const snapshot = buildDiscountInsights([
      sale('2026-08-10T10:00:00', {
        totalCents: 8_000,
        discountCents: 2_000,
        items: [{ lineId: 'missing-cost', product: withoutCost, quantity: 1 }],
      }),
    ]);
    expect(snapshot.missingCostLines).toBe(1);
    expect(snapshot.marginAfterDiscountPercent).toBeNull();
    expect(snapshot.productRows[0].marginPercent).toBeNull();
  });
});
