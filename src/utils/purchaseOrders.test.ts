import { describe, expect, it } from 'vitest';
import { Product, PurchaseOrder, ReorderActionItem } from '../types';
import {
  applyPurchaseOrderReceipt,
  buildPurchaseOrderDrafts,
  markPurchaseOrderAsOrdered,
  purchaseOrderOutstandingQty,
  purchaseOrderTotalCents,
  updatePurchaseOrderDraftQuantities,
} from './purchaseOrders';

const row = (patch: Partial<ReorderActionItem>): ReorderActionItem => ({
  productId: 'p-1', productName: 'Product 1', supplier: 'Leverancier A', currentStockQty: 2,
  minStockQty: 1, observedDays: 365, activeSalesDays: 20, soldLast7Days: 2,
  soldLast30Days: 8, soldLast90Days: 20, averageDailySales: 0.25,
  estimatedDaysCover: 8, estimatedStockoutAt: 1000, estimatedReorderAt: 500,
  estimatedDaysUntilReorder: 4, confidence: 'high', forecastModel: 'recent-blend',
  trend: 'rising', urgency: 'critical', targetCoverDays: 30, suggestedQty: 8,
  selectedQty: 8, unitCostCents: 500, ...patch,
});

const product = (id: string, stockQty: number): Product => ({
  id, name: id, category: 'Test', priceCents: 1000, costPriceCents: 500,
  vatRate: 21, stockQty, minStockQty: 1, isActive: true,
});

describe('purchase order workflow', () => {
  it('creates one immutable draft per supplier', () => {
    let id = 0;
    const orders = buildPurchaseOrderDrafts([
      row({ productId: 'a', selectedQty: 4 }),
      row({ productId: 'b', supplier: 'Leverancier B', selectedQty: 7 }),
      row({ productId: 'c', selectedQty: 0 }),
    ], { now: 100, idFactory: () => `order-${++id}` });

    expect(orders).toHaveLength(2);
    expect(orders[0]).toEqual(expect.objectContaining({ id: 'order-1', supplier: 'Leverancier A', status: 'draft' }));
    expect(orders[0].items[0]).toEqual(expect.objectContaining({ productId: 'a', orderedQty: 4, receivedQty: 0 }));
    expect(purchaseOrderTotalCents(orders[0])).toBe(2000);
  });

  it('adds only received quantities and supports partial delivery', () => {
    const [draft] = buildPurchaseOrderDrafts([
      row({ productId: 'a', productName: 'A', selectedQty: 4 }),
      row({ productId: 'b', productName: 'B', selectedQty: 3 }),
    ], { now: 100, idFactory: () => 'order-1' });
    const ordered = markPurchaseOrderAsOrdered(draft, { now: 200, reference: 'PO-42' });
    const partial = applyPurchaseOrderReceipt(ordered, { a: 2 }, [product('a', 5), product('b', 8)], { now: 300 });

    expect(partial.order.status).toBe('partially-received');
    expect(partial.order.items.find((item) => item.productId === 'a')?.receivedQty).toBe(2);
    expect(partial.updatedProducts).toEqual([expect.objectContaining({ id: 'a', stockQty: 7 })]);
    expect(partial.movements).toEqual([expect.objectContaining({ productId: 'a', quantityDelta: 2, purchaseOrderId: 'order-1' })]);
    expect(purchaseOrderOutstandingQty(partial.order)).toBe(5);

    const completed = applyPurchaseOrderReceipt(partial.order, { a: 2, b: 3 }, partial.updatedProducts.concat(product('b', 8)), { now: 400 });
    expect(completed.order.status).toBe('received');
    expect(completed.order.receivedAt).toBe(400);
    expect(purchaseOrderOutstandingQty(completed.order)).toBe(0);
  });

  it('keeps draft quantities editable but locks them after ordering', () => {
    const [draft] = buildPurchaseOrderDrafts([row({ selectedQty: 4 })], { now: 100, idFactory: () => 'order-1' });
    const updated = updatePurchaseOrderDraftQuantities(draft, { 'p-1': 6 }, 150);
    expect(updated.items[0].orderedQty).toBe(6);
    expect(updated.updatedAt).toBe(150);
    const ordered = markPurchaseOrderAsOrdered(updated, { now: 200 });
    expect(() => updatePurchaseOrderDraftQuantities(ordered, { 'p-1': 7 })).toThrow(/Alleen een concept/);
  });

  it('rejects over-receipt and receiving a draft', () => {
    const draft: PurchaseOrder = buildPurchaseOrderDrafts([row({ selectedQty: 2 })], { idFactory: () => 'order-1' })[0];
    expect(() => applyPurchaseOrderReceipt(draft, { 'p-1': 1 }, [product('p-1', 2)])).toThrow(/als besteld/);
    const ordered = markPurchaseOrderAsOrdered(draft, {});
    expect(() => applyPurchaseOrderReceipt(ordered, { 'p-1': 3 }, [product('p-1', 2)])).toThrow(/maximaal 2/);
  });
});
