import { db } from '../db/db';
import {
  AuditEntry,
  OutboxEntry,
  Product,
  StockMovement,
  WebshopDeliveryMode,
  WebshopFulfillmentStatus,
  WebshopOrder,
  WebshopOrderStatus,
  WebshopPaymentStatus,
} from '../types';

export type WebshopCommerceErrorCode =
  | 'empty-cart'
  | 'invalid-order'
  | 'product-unavailable'
  | 'insufficient-stock'
  | 'order-not-found'
  | 'order-closed';

export class WebshopCommerceError extends Error {
  readonly code: WebshopCommerceErrorCode;

  constructor(code: WebshopCommerceErrorCode, message: string) {
    super(message);
    this.name = 'WebshopCommerceError';
    this.code = code;
  }
}

export interface WebshopCheckoutLineInput {
  productId: string;
  productName: string;
  variant?: string;
  sku?: string;
  quantity: number;
  unitPriceCents: number;
}

export interface PlaceWebshopOrderInput {
  clientRequestId: string;
  lines: WebshopCheckoutLineInput[];
  customer: WebshopOrder['customer'];
  deliveryMode: WebshopDeliveryMode;
  shippingAddress?: WebshopOrder['shippingAddress'];
  pickupAddress?: string;
  paymentMethod: string;
  note?: string;
  couponCode?: string;
  subtotalCents: number;
  discountCents: number;
  shippingCents: number;
  totalCents: number;
  autoConfirm: boolean;
  notificationEmail: string;
  shopName: string;
}

export interface PlaceWebshopOrderResult {
  order: WebshopOrder;
  duplicate: boolean;
  updatedProducts: Product[];
}

export interface UpdateWebshopOrderInput {
  status?: WebshopOrderStatus;
  paymentStatus?: WebshopPaymentStatus;
  fulfillmentStatus?: WebshopFulfillmentStatus;
}

/**
 * Boundary used by the UI. The demo implementation below writes to IndexedDB;
 * a live version can implement this contract with HTTP calls without changing
 * the storefront or order-management components.
 */
export interface WebshopCommerceGateway {
  placeOrder(input: PlaceWebshopOrderInput): Promise<PlaceWebshopOrderResult>;
  listOrders(): Promise<WebshopOrder[]>;
  updateOrder(id: string, update: UpdateWebshopOrderInput): Promise<{ order: WebshopOrder; updatedProducts: Product[] }>;
}

const createId = (prefix: string) => {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${random}`;
};

const orderNumber = (now: number) => {
  const date = new Date(now);
  const day = date.toISOString().slice(0, 10).replaceAll('-', '');
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `WEB-${day}-${suffix}`;
};

const auditEntry = (action: AuditEntry['action'], detail: unknown): AuditEntry => ({
  timestamp: Date.now(),
  userId: null,
  userName: 'Webshop demo',
  action,
  detail,
});

const outboxEntry = (kind: OutboxEntry['kind'], payload: unknown): OutboxEntry => ({
  timestamp: Date.now(),
  kind,
  payload,
  attempts: 0,
});

const assertCheckoutInput = (input: PlaceWebshopOrderInput) => {
  if (input.lines.length === 0) throw new WebshopCommerceError('empty-cart', 'Uw winkelmand is leeg.');
  if (!input.clientRequestId.trim() || !input.customer.email.trim() || !input.paymentMethod.trim()) {
    throw new WebshopCommerceError('invalid-order', 'De bestelling bevat onvolledige gegevens.');
  }
  const calculatedSubtotal = input.lines.reduce((sum, line) => {
    if (!Number.isSafeInteger(line.quantity) || line.quantity <= 0 || !Number.isSafeInteger(line.unitPriceCents) || line.unitPriceCents < 0) {
      throw new WebshopCommerceError('invalid-order', `Ongeldige bestellijn voor ${line.productName}.`);
    }
    return sum + line.quantity * line.unitPriceCents;
  }, 0);
  if (calculatedSubtotal !== input.subtotalCents || input.totalCents !== input.subtotalCents - input.discountCents + input.shippingCents) {
    throw new WebshopCommerceError('invalid-order', 'Het bestelbedrag kon niet worden gevalideerd.');
  }
};

const notifyOrderChange = () => {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('pwayment:webshop-orders-changed'));
  if (typeof BroadcastChannel !== 'undefined') {
    const channel = new BroadcastChannel('pwayment-webshop-orders');
    channel.postMessage({ type: 'changed' });
    channel.close();
  }
};

const placeDemoOrder = async (input: PlaceWebshopOrderInput): Promise<PlaceWebshopOrderResult> => {
  assertCheckoutInput(input);
  const existing = await db.webshop_orders.where('clientRequestId').equals(input.clientRequestId).first();
  if (existing) return { order: existing, duplicate: true, updatedProducts: [] };

  const now = Date.now();
  const result = await db.transaction(
    'rw',
    [db.webshop_orders, db.products, db.stock_movements, db.audit, db.outbox],
    async () => {
      const duplicate = await db.webshop_orders.where('clientRequestId').equals(input.clientRequestId).first();
      if (duplicate) return { order: duplicate, duplicate: true, updatedProducts: [] };

      const requested = new Map<string, number>();
      input.lines.forEach((line) => requested.set(line.productId, (requested.get(line.productId) ?? 0) + line.quantity));
      const updatedProducts: Product[] = [];
      const movements: StockMovement[] = [];

      for (const [productId, quantity] of requested) {
        const product = await db.products.get(productId);
        if (!product || product.isActive === false) {
          throw new WebshopCommerceError('product-unavailable', 'Een product in uw winkelmand is niet meer beschikbaar.');
        }
        if (product.stockQty == null) continue;
        if (product.stockQty < quantity) {
          throw new WebshopCommerceError(
            'insufficient-stock',
            `${product.name} heeft nog ${product.stockQty} ${product.stockQty === 1 ? 'exemplaar' : 'exemplaren'} beschikbaar.`,
          );
        }
        const updated = { ...product, stockQty: product.stockQty - quantity };
        updatedProducts.push(updated);
        movements.push({
          productId,
          productName: product.name,
          quantityDelta: -quantity,
          reason: 'webshop-reservation',
          timestamp: now,
          purchaseOrderId: input.clientRequestId,
          userName: 'Webshop demo',
        });
      }

      const paidOnline = input.paymentMethod !== 'pickup';
      const id = createId('web-order');
      const number = orderNumber(now);
      const order: WebshopOrder = {
        id,
        clientRequestId: input.clientRequestId,
        number,
        source: 'demo',
        createdAt: now,
        updatedAt: now,
        status: input.autoConfirm ? 'confirmed' : 'pending',
        paymentStatus: paidOnline ? 'paid' : 'pending',
        fulfillmentStatus: 'unfulfilled',
        inventoryStatus: 'reserved',
        paymentMethod: input.paymentMethod,
        paymentReference: paidOnline ? createId('demo-pay') : createId('demo-pickup'),
        deliveryMode: input.deliveryMode,
        customer: { ...input.customer },
        shippingAddress: input.deliveryMode === 'shipping' ? input.shippingAddress : undefined,
        pickupAddress: input.deliveryMode === 'pickup' ? input.pickupAddress : undefined,
        note: input.note?.trim() || undefined,
        couponCode: input.couponCode,
        lines: input.lines.map((line) => ({
          ...line,
          lineTotalCents: line.unitPriceCents * line.quantity,
        })),
        subtotalCents: input.subtotalCents,
        discountCents: input.discountCents,
        shippingCents: input.shippingCents,
        totalCents: input.totalCents,
        confirmationEmail: {
          to: input.customer.email,
          status: 'sent-demo',
          sentAt: now,
          subject: `Bevestiging ${number} · ${input.shopName}`,
        },
      };

      if (updatedProducts.length > 0) await db.products.bulkPut(updatedProducts);
      if (movements.length > 0) await db.stock_movements.bulkAdd(movements);
      await db.webshop_orders.add(order);
      await db.audit.add(auditEntry('webshop_order.create', { orderId: id, number: order.number, totalCents: order.totalCents }));
      await db.outbox.bulkAdd([
        outboxEntry('webshop_order', { event: 'webshop.order.created', order }),
        outboxEntry('webshop_email', {
          event: 'webshop.order.confirmation',
          to: order.customer.email,
          bcc: input.notificationEmail,
          subject: order.confirmationEmail.subject,
          orderId: order.id,
          orderNumber: order.number,
          demoDeliveredAt: now,
        }),
      ]);
      return { order, duplicate: false, updatedProducts };
    },
  );
  notifyOrderChange();
  return result;
};

const listDemoOrders = () => db.webshop_orders.orderBy('createdAt').reverse().toArray();

const updateDemoOrder = async (id: string, update: UpdateWebshopOrderInput) => {
  const result = await db.transaction(
    'rw',
    [db.webshop_orders, db.products, db.stock_movements, db.audit, db.outbox],
    async () => {
      const current = await db.webshop_orders.get(id);
      if (!current) throw new WebshopCommerceError('order-not-found', 'De webshopbestelling bestaat niet meer.');
      if (current.status === 'cancelled' && update.status !== 'cancelled') {
        throw new WebshopCommerceError('order-closed', 'Een geannuleerde bestelling kan niet opnieuw worden geopend.');
      }
      if (current.status === 'completed' && update.status === 'cancelled') {
        throw new WebshopCommerceError('order-closed', 'Een afgeronde bestelling kan niet via annulering worden teruggedraaid.');
      }

      const now = Date.now();
      const next: WebshopOrder = { ...current, ...update, updatedAt: now };
      const updatedProducts: Product[] = [];
      if (update.status === 'cancelled' && current.inventoryStatus === 'reserved') {
        const releaseByProduct = new Map<string, number>();
        current.lines.forEach((line) => releaseByProduct.set(line.productId, (releaseByProduct.get(line.productId) ?? 0) + line.quantity));
        for (const [productId, quantity] of releaseByProduct) {
          const product = await db.products.get(productId);
          if (!product || product.stockQty == null) continue;
          const updated = { ...product, stockQty: product.stockQty + quantity };
          updatedProducts.push(updated);
          await db.stock_movements.add({
            productId: product.id,
            productName: product.name,
            quantityDelta: quantity,
            reason: 'webshop-release',
            timestamp: now,
            purchaseOrderId: current.id,
            userName: 'Webshop demo',
          });
        }
        next.inventoryStatus = 'released';
        if (current.paymentStatus === 'paid') next.paymentStatus = 'refunded';
      }
      if (update.fulfillmentStatus === 'shipped' || update.fulfillmentStatus === 'picked-up') {
        next.inventoryStatus = 'committed';
        next.status = 'completed';
      }

      if (updatedProducts.length > 0) await db.products.bulkPut(updatedProducts);
      await db.webshop_orders.put(next);
      await db.audit.add(auditEntry(update.status === 'cancelled' ? 'webshop_order.cancel' : 'webshop_order.update', {
        orderId: next.id,
        number: next.number,
        update,
      }));
      await db.outbox.add(outboxEntry('webshop_order', { event: 'webshop.order.updated', order: next }));
      return { order: next, updatedProducts };
    },
  );
  notifyOrderChange();
  return result;
};

export const demoWebshopCommerceGateway: WebshopCommerceGateway = {
  placeOrder: placeDemoOrder,
  listOrders: listDemoOrders,
  updateOrder: updateDemoOrder,
};

/** Swap this export for an API-backed implementation when the backend is available. */
export const webshopCommerce: WebshopCommerceGateway = demoWebshopCommerceGateway;
