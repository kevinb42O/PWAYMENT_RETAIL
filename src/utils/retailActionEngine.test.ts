import { describe, expect, it } from 'vitest';
import { Product, Transaction } from '../types';
import {
  buildInventoryDraftActions,
  buildInventoryForecast,
  buildReorderRecommendations,
  MISSING_SUPPLIER,
} from './retailActionEngine';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 7, 31, 12);

const makeProduct = (patch: Partial<Product> = {}): Product => ({
  id: 'p-1',
  name: 'Test product',
  category: 'Test',
  supplier: 'Leverancier A',
  priceCents: 2000,
  costPriceCents: 800,
  vatRate: 21,
  stockQty: 2,
  minStockQty: 3,
  isActive: true,
  ...patch,
});

const makeTransaction = (
  product: Product,
  quantity: number,
  timestamp: number,
): Transaction => ({
  tableId: 1,
  items: [{ lineId: `${product.id}-${timestamp}`, product, quantity }],
  subtotalCents: product.priceCents * quantity,
  vat12Cents: 0,
  vat21Cents: 0,
  totalCents: product.priceCents * quantity,
  discountCents: 0,
  paymentMethod: 'PIN',
  timestamp,
  isFinalized: 1,
});

describe('buildInventoryForecast', () => {
  it('keeps a sparse 30-day estimate explicitly low-confidence', () => {
    const product = makeProduct();
    const transaction = makeTransaction(product, 10, NOW - 29 * DAY_MS);
    const [row] = buildInventoryForecast([product], [transaction], NOW);

    expect(row).toEqual(expect.objectContaining({
      productId: 'p-1',
      observedDays: 30,
      soldLast30Days: 10,
      averageDailySales: 10 / 30,
      estimatedDaysCover: 6,
      estimatedDaysUntilReorder: 0,
      estimatedReorderAt: NOW,
      estimatedStockoutAt: NOW + 6 * DAY_MS,
      confidence: 'low',
      forecastModel: 'intermittent',
      trend: 'unknown',
      urgency: 'critical',
      suggestedQty: 11,
      selectedQty: 11,
    }));
  });

  it('still predicts demand when the last 30 days are quiet but the 90-day history is not', () => {
    const product = makeProduct({ stockQty: 8, minStockQty: 2 });
    const transactions = [
      makeTransaction(product, 1, NOW - 119 * DAY_MS),
      ...Array.from({ length: 10 }, (_, index) => makeTransaction(product, 2, NOW - (35 + index * 5) * DAY_MS)),
    ];
    const [row] = buildInventoryForecast([product], transactions, NOW);

    expect(row.observedDays).toBe(120);
    expect(row.soldLast30Days).toBe(0);
    expect(row.soldLast90Days).toBe(20);
    expect(row.averageDailySales).toBeGreaterThan(0);
    expect(row.forecastModel).toBe('intermittent');
    expect(row.estimatedStockoutAt).not.toBeNull();
  });

  it('detects a rising trend for products that sell on many different days', () => {
    const product = makeProduct({ stockQty: 80, minStockQty: 10 });
    const transactions: Transaction[] = [];
    for (let daysAgo = 119; daysAgo >= 0; daysAgo -= 2) {
      transactions.push(makeTransaction(product, daysAgo <= 29 ? 2 : 1, NOW - daysAgo * DAY_MS));
    }
    const [row] = buildInventoryForecast([product], transactions, NOW);

    expect(row.forecastModel).toBe('recent-blend');
    expect(row.trend).toBe('rising');
    expect(row.activeSalesDays).toBeGreaterThanOrEqual(50);
    expect(row.averageDailySales).toBeGreaterThan(0.5);
  });

  it('activates a bounded seasonal correction when enough annual history exists', () => {
    const product = makeProduct({ stockQty: 20, minStockQty: 4 });
    const transactions = [
      makeTransaction(product, 1, NOW - 400 * DAY_MS),
      makeTransaction(product, 4, NOW - 360 * DAY_MS),
      makeTransaction(product, 4, NOW - 350 * DAY_MS),
      makeTransaction(product, 4, NOW - 340 * DAY_MS),
      makeTransaction(product, 2, NOW - 80 * DAY_MS),
      makeTransaction(product, 2, NOW - 45 * DAY_MS),
      makeTransaction(product, 2, NOW - 10 * DAY_MS),
    ];
    const [row] = buildInventoryForecast([product], transactions, NOW);

    expect(row.observedDays).toBe(401);
    expect(row.forecastModel).toBe('seasonal-blend');
    expect(row.confidence).toBe('high');
    expect(row.averageDailySales).toBeGreaterThan(0);
  });

  it('does not label an even long-term sales rhythm as seasonal', () => {
    const product = makeProduct({ stockQty: 80, minStockQty: 10 });
    const transactions: Transaction[] = [];
    for (let daysAgo = 400; daysAgo >= 0; daysAgo -= 4) {
      transactions.push(makeTransaction(product, 1, NOW - daysAgo * DAY_MS));
    }
    const [row] = buildInventoryForecast([product], transactions, NOW);

    expect(row.forecastModel).toBe('recent-blend');
    expect(row.trend).toBe('stable');
  });

  it('flags an upcoming minimum before the product is actually low in stock', () => {
    const product = makeProduct({ stockQty: 20, minStockQty: 5 });
    const transaction = makeTransaction(product, 15, NOW - 29 * DAY_MS);
    const [row] = buildInventoryForecast([product], [transaction], NOW);

    expect(row.averageDailySales).toBe(0.5);
    expect(row.estimatedDaysUntilReorder).toBe(30);
    expect(row.estimatedDaysCover).toBe(40);
    expect(row.urgency).toBe('soon');
    expect(row.suggestedQty).toBe(15);
  });

  it('shows insufficient sales history without inventing a stockout date', () => {
    const product = makeProduct();
    const [row] = buildInventoryForecast([product], [], NOW);

    expect(row).toEqual(expect.objectContaining({
      observedDays: 0,
      soldLast30Days: 0,
      averageDailySales: 0,
      estimatedDaysCover: null,
      estimatedStockoutAt: null,
      estimatedReorderAt: null,
      confidence: 'low',
      urgency: 'no-sales',
      suggestedQty: 1,
    }));
  });

  it('ignores inactive, untracked and out-of-window products or sales', () => {
    const tracked = makeProduct();
    const inactive = makeProduct({ id: 'inactive', isActive: false });
    const untracked = makeProduct({ id: 'untracked', stockQty: undefined });
    const oldTransaction = makeTransaction(tracked, 99, NOW - 31 * DAY_MS);
    const futureTransaction = makeTransaction(tracked, 99, NOW + DAY_MS);

    const rows = buildInventoryForecast(
      [tracked, inactive, untracked],
      [oldTransaction, futureTransaction],
      NOW,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].soldLast30Days).toBe(0);
  });
});

describe('buildReorderRecommendations', () => {
  it('includes products predicted to reach minimum within the action horizon', () => {
    const product = makeProduct({ stockQty: 20, minStockQty: 5 });
    const transaction = makeTransaction(product, 15, NOW - 29 * DAY_MS);
    const rows = buildReorderRecommendations([product], [transaction], NOW);

    expect(rows).toEqual([expect.objectContaining({
      productId: 'p-1',
      estimatedDaysUntilReorder: 30,
      suggestedQty: 15,
    })]);
  });

  it('does not recommend healthy stock outside the selected horizon', () => {
    const product = makeProduct({ stockQty: 100, minStockQty: 5 });
    const transaction = makeTransaction(product, 15, NOW - 29 * DAY_MS);

    expect(buildReorderRecommendations([product], [transaction], NOW)).toEqual([]);
    expect(buildReorderRecommendations([product], [transaction], NOW, { actionHorizonDays: 200 }))
      .toEqual([expect.objectContaining({ productId: 'p-1', suggestedQty: 15 })]);
  });

  it('respects a configured minimum even before enough sales data exists', () => {
    const belowMinimum = makeProduct({ stockQty: 2, minStockQty: 5 });
    const aboveMinimum = makeProduct({ id: 'p-2', stockQty: 10, minStockQty: 5 });
    const rows = buildReorderRecommendations([belowMinimum, aboveMinimum], [], NOW);

    expect(rows).toEqual([expect.objectContaining({
      productId: 'p-1',
      confidence: 'low',
      urgency: 'no-sales',
      suggestedQty: 3,
    })]);
  });
});

describe('buildInventoryDraftActions', () => {
  it('groups an explicit selection per supplier without performing side effects', () => {
    const supplierAProduct = makeProduct({ id: 'a', supplier: 'Leverancier A' });
    const supplierBProduct = makeProduct({ id: 'b', supplier: 'Leverancier B' });
    const missingSupplierProduct = makeProduct({ id: 'missing', supplier: undefined });
    const transaction = makeTransaction(supplierAProduct, 2, NOW - DAY_MS);
    const [rowA] = buildInventoryForecast([supplierAProduct], [transaction], NOW);
    const [rowB] = buildInventoryForecast([supplierBProduct], [transaction], NOW);
    const [missingRow] = buildInventoryForecast([missingSupplierProduct], [transaction], NOW);
    let id = 0;

    const actions = buildInventoryDraftActions(
      [
        { ...rowA, selectedQty: 4 },
        { ...rowB, selectedQty: 7 },
        { ...missingRow, supplier: MISSING_SUPPLIER, selectedQty: 9 },
      ],
      [transaction],
      {
        now: NOW,
        ownerUserId: 'owner-1',
        ownerName: 'Kevin',
        idFactory: () => `draft-${++id}`,
      },
    );

    expect(actions).toHaveLength(2);
    expect(actions).toEqual([
      expect.objectContaining({
        id: 'draft-1',
        title: 'Concept-inkooporder · Leverancier A',
        status: 'draft',
        ownerUserId: 'owner-1',
        inventoryItems: [expect.objectContaining({ productId: 'a', selectedQty: 4 })],
        baseline: expect.objectContaining({ transactionCount: 1, revenueCents: 4000, grossProfitCents: 2400 }),
      }),
      expect.objectContaining({
        id: 'draft-2',
        title: 'Concept-inkooporder · Leverancier B',
        inventoryItems: [expect.objectContaining({ productId: 'b', selectedQty: 7 })],
      }),
    ]);
    expect(actions.some((action) => action.title.includes(MISSING_SUPPLIER))).toBe(false);
  });

  it('drops zero quantities and returns no drafts for an empty effective selection', () => {
    const product = makeProduct();
    const transaction = makeTransaction(product, 2, NOW - DAY_MS);
    const [row] = buildInventoryForecast([product], [transaction], NOW);

    expect(buildInventoryDraftActions([{ ...row, selectedQty: 0 }], [transaction], { now: NOW }))
      .toEqual([]);
  });
});
