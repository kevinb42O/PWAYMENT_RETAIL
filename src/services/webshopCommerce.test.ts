import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/db';
import { Product } from '../types';
import { localWebshopCommerceGateway, PlaceWebshopOrderInput } from './webshopCommerce';

const deck = (over: Partial<Product> = {}): Product => ({
  id: 'deck-1',
  name: 'Street Deck',
  category: 'skateboards',
  priceCents: 6500,
  vatRate: 21,
  stockQty: 3,
  isActive: true,
  variant: '8.25 inch',
  ...over,
});

const input = (over: Partial<PlaceWebshopOrderInput> = {}): PlaceWebshopOrderInput => ({
  clientRequestId: 'web-request-1',
  lines: [{ productId: 'deck-1', productName: 'Street Deck', variant: '8.25 inch', quantity: 1, unitPriceCents: 6500 }],
  customer: { firstName: 'Kevin', lastName: 'Janssens', email: 'kevin@example.com', phone: '+32 470 00 00 00' },
  deliveryMode: 'shipping',
  shippingAddress: { street: 'Kouter', number: '12', postal: '9000', city: 'Gent', country: 'België' },
  paymentMethod: 'bancontact',
  subtotalCents: 6500,
  discountCents: 500,
  shippingCents: 0,
  totalCents: 6000,
  couponCode: 'SKATE5',
  autoConfirm: true,
  notificationEmail: 'orders@example.com',
  shopName: 'Pwayment Skate Shop',
  ...over,
});

beforeEach(async () => {
  if (!db.isOpen()) await db.open();
  await Promise.all([
    db.webshop_orders.clear(),
    db.products.clear(),
    db.stock_movements.clear(),
    db.audit.clear(),
    db.outbox.clear(),
  ]);
  await db.products.put(deck());
});

describe('local webshop commerce gateway', () => {
  it('stores an order, queues its confirmation, and reserves stock atomically', async () => {
    const result = await localWebshopCommerceGateway.placeOrder(input());

    expect(result.duplicate).toBe(false);
    expect(result.order).toMatchObject({
      source: 'live',
      status: 'confirmed',
      paymentStatus: 'paid',
      inventoryStatus: 'reserved',
      totalCents: 6000,
      confirmationEmail: { status: 'queued', to: 'kevin@example.com' },
    });
    expect((await db.products.get('deck-1'))?.stockQty).toBe(2);
    expect(await db.webshop_orders.count()).toBe(1);
    expect(await db.stock_movements.where('productId').equals('deck-1').first()).toMatchObject({
      quantityDelta: -1,
      reason: 'webshop-reservation',
    });
    expect((await db.outbox.toArray()).map((entry) => entry.kind).sort()).toEqual(['webshop_email', 'webshop_order']);
  });

  it('makes a retry idempotent and never reserves the same stock twice', async () => {
    const first = await localWebshopCommerceGateway.placeOrder(input());
    const retry = await localWebshopCommerceGateway.placeOrder(input());

    expect(retry.duplicate).toBe(true);
    expect(retry.order.id).toBe(first.order.id);
    expect((await db.products.get('deck-1'))?.stockQty).toBe(2);
    expect(await db.webshop_orders.count()).toBe(1);
  });

  it('rejects insufficient stock without leaving a partial order or outbox entry', async () => {
    await db.products.put(deck({ stockQty: 0 }));

    await expect(localWebshopCommerceGateway.placeOrder(input())).rejects.toMatchObject({ code: 'insufficient-stock' });
    expect(await db.webshop_orders.count()).toBe(0);
    expect(await db.outbox.count()).toBe(0);
    expect(await db.stock_movements.count()).toBe(0);
    expect((await db.products.get('deck-1'))?.stockQty).toBe(0);
  });

  it('releases reserved stock and simulates a refund when an order is cancelled', async () => {
    const placed = await localWebshopCommerceGateway.placeOrder(input());
    const cancelled = await localWebshopCommerceGateway.updateOrder(placed.order.id, { status: 'cancelled' });

    expect(cancelled.order).toMatchObject({ status: 'cancelled', inventoryStatus: 'released', paymentStatus: 'refunded' });
    expect((await db.products.get('deck-1'))?.stockQty).toBe(3);
    expect((await db.stock_movements.where('productId').equals('deck-1').toArray()).map((row) => row.quantityDelta)).toEqual([-1, 1]);
  });

  it('supports the complete pickup flow from open payment to committed inventory', async () => {
    const placed = await localWebshopCommerceGateway.placeOrder(input({
      clientRequestId: 'pickup-request',
      deliveryMode: 'pickup',
      shippingAddress: undefined,
      pickupAddress: 'Kouter 12, Gent',
      paymentMethod: 'pickup',
    }));
    expect(placed.order.paymentStatus).toBe('pending');

    await localWebshopCommerceGateway.updateOrder(placed.order.id, { fulfillmentStatus: 'processing' });
    await localWebshopCommerceGateway.updateOrder(placed.order.id, { fulfillmentStatus: 'ready-for-pickup' });
    const completed = await localWebshopCommerceGateway.updateOrder(placed.order.id, { paymentStatus: 'paid', fulfillmentStatus: 'picked-up' });

    expect(completed.order).toMatchObject({ status: 'completed', paymentStatus: 'paid', fulfillmentStatus: 'picked-up', inventoryStatus: 'committed' });
    expect((await db.products.get('deck-1'))?.stockQty).toBe(2);
  });
});
