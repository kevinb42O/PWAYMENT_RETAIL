import { db } from '../db/db';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { useAuth } from '../auth/useAuth';
import { useWebshopStore } from '../store/useWebshopStore';
import type { Database, Json } from '../types/database.generated';
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
 * Boundary used by the UI. Production uses the central Supabase order ledger;
 * local development keeps an IndexedDB fallback.
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
  userName: 'Webshop',
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

const placeLocalOrder = async (input: PlaceWebshopOrderInput): Promise<PlaceWebshopOrderResult> => {
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
          userName: 'Webshop',
        });
      }

      const paidOnline = input.paymentMethod !== 'pickup';
      const id = createId('web-order');
      const number = orderNumber(now);
      const order: WebshopOrder = {
        id,
        clientRequestId: input.clientRequestId,
        number,
        source: 'live',
        createdAt: now,
        updatedAt: now,
        status: input.autoConfirm ? 'confirmed' : 'pending',
        paymentStatus: paidOnline ? 'paid' : 'pending',
        fulfillmentStatus: 'unfulfilled',
        inventoryStatus: 'reserved',
        paymentMethod: input.paymentMethod,
        paymentReference: paidOnline ? createId('pay') : createId('pickup'),
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
          status: 'queued',
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
          queuedAt: now,
        }),
      ]);
      return { order, duplicate: false, updatedProducts };
    },
  );
  notifyOrderChange();
  return result;
};

const listLocalOrders = () => db.webshop_orders.orderBy('createdAt').reverse().toArray();

const updateLocalOrder = async (id: string, update: UpdateWebshopOrderInput) => {
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
            userName: 'Webshop',
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

type RemoteOrderRow = Database['public']['Tables']['webshop_orders']['Row'];
type RemoteOrderLineRow = Database['public']['Tables']['webshop_order_lines']['Row'];

const jsonRecord = (value: Json | null | undefined): Record<string, Json | undefined> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, Json | undefined> : {};

const mapRemoteOrder = (row: RemoteOrderRow, lines: RemoteOrderLineRow[]): WebshopOrder => {
  const customer = jsonRecord(row.customer_snapshot);
  const shippingAddress = jsonRecord(row.shipping_address);
  const confirmationEmail = jsonRecord(row.confirmation_email);
  return {
    id: row.id,
    clientRequestId: row.client_request_id,
    number: row.order_number,
    source: row.source as WebshopOrder['source'],
    createdAt: Date.parse(row.created_at),
    updatedAt: Date.parse(row.updated_at),
    status: row.status as WebshopOrderStatus,
    paymentStatus: row.payment_status as WebshopPaymentStatus,
    fulfillmentStatus: row.fulfillment_status as WebshopFulfillmentStatus,
    inventoryStatus: row.inventory_status as WebshopOrder['inventoryStatus'],
    paymentMethod: row.payment_method,
    paymentReference: row.payment_reference ?? '',
    deliveryMode: row.delivery_mode as WebshopDeliveryMode,
    customer: {
      firstName: String(customer.firstName ?? ''),
      lastName: String(customer.lastName ?? ''),
      email: String(customer.email ?? ''),
      phone: String(customer.phone ?? ''),
    },
    shippingAddress: row.shipping_address ? {
      street: String(shippingAddress.street ?? ''),
      number: String(shippingAddress.number ?? ''),
      postal: String(shippingAddress.postal ?? ''),
      city: String(shippingAddress.city ?? ''),
      country: String(shippingAddress.country ?? ''),
    } : undefined,
    pickupAddress: row.pickup_address ?? undefined,
    note: row.note ?? undefined,
    couponCode: row.coupon_code ?? undefined,
    lines: lines.map((line) => ({
      productId: line.product_external_id ?? line.product_id ?? '',
      productName: line.product_name,
      variant: line.variant ?? undefined,
      sku: line.sku ?? undefined,
      quantity: line.quantity,
      unitPriceCents: Number(line.unit_price_cents),
      lineTotalCents: Number(line.line_total_cents),
    })),
    subtotalCents: Number(row.subtotal_cents),
    discountCents: Number(row.discount_cents),
    shippingCents: Number(row.shipping_cents),
    totalCents: Number(row.total_cents),
    confirmationEmail: {
      to: String(confirmationEmail.to ?? customer.email ?? ''),
      status: confirmationEmail.status === 'failed' ? 'failed' : 'queued',
      sentAt: typeof confirmationEmail.sentAt === 'number' ? confirmationEmail.sentAt : undefined,
      subject: String(confirmationEmail.subject ?? `Bevestiging ${row.order_number}`),
    },
  };
};

const mapRemotePayload = (value: Json): WebshopOrder => {
  const payload = jsonRecord(value);
  const row = payload.order as unknown as RemoteOrderRow;
  const lines = Array.isArray(payload.lines) ? payload.lines as unknown as RemoteOrderLineRow[] : [];
  if (!row?.id) throw new Error('De centrale orderopslag gaf geen geldige bestelling terug.');
  return mapRemoteOrder(row, lines);
};

export const resolveWebshopStoreIdentifier = async (): Promise<string | null> => {
  const fromUrl = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('shop')?.trim()
    : null;
  if (fromUrl) return fromUrl;

  const configuredIdentifier = import.meta.env.VITE_PUBLIC_WEBSHOP_IDENTIFIER?.trim();
  if (configuredIdentifier) return configuredIdentifier;

  const activeStoreId = useAuth.getState().currentStoreId;
  if (activeStoreId) return activeStoreId;

  const { data: sessionData } = await supabase.auth.getSession();
  if (sessionData.session?.user) {
    const { data: membership } = await supabase
      .from('store_memberships')
      .select('store_id')
      .eq('user_id', sessionData.session.user.id)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle();
    if (membership?.store_id) return membership.store_id;
  }

  const settings = useWebshopStore.getState();
  if (settings.subdomain.trim()) return settings.subdomain.trim();
  if (settings.customDomain.trim()) return settings.customDomain.trim();
  return typeof window !== 'undefined' ? window.location.hostname : null;
};

const placeRemoteOrder = async (input: PlaceWebshopOrderInput): Promise<PlaceWebshopOrderResult> => {
  assertCheckoutInput(input);
  const storeIdentifier = await resolveWebshopStoreIdentifier();
  if (!storeIdentifier) throw new Error('De webshop kon niet aan een winkel worden gekoppeld.');
  const { data, error } = await supabase.rpc('place_public_webshop_order', {
    store_identifier: storeIdentifier,
    payload: JSON.parse(JSON.stringify(input)) as Json,
  });
  if (error) throw new Error(`De bestelling kon niet centraal worden opgeslagen: ${error.message}`);
  const response = jsonRecord(data);
  const order = mapRemotePayload(data);
  notifyOrderChange();
  return { order, duplicate: response.duplicate === true, updatedProducts: [] };
};

const listRemoteOrders = async (storeId: string): Promise<WebshopOrder[]> => {
  const [{ data: rows, error: ordersError }, { data: lines, error: linesError }] = await Promise.all([
    supabase.from('webshop_orders').select('*').eq('store_id', storeId).order('created_at', { ascending: false }),
    supabase.from('webshop_order_lines').select('*').eq('store_id', storeId).order('created_at'),
  ]);
  if (ordersError) throw ordersError;
  if (linesError) throw linesError;
  const linesByOrder = new Map<string, RemoteOrderLineRow[]>();
  (lines ?? []).forEach((line) => linesByOrder.set(line.webshop_order_id, [...(linesByOrder.get(line.webshop_order_id) ?? []), line]));
  return (rows ?? []).map((row) => mapRemoteOrder(row, linesByOrder.get(row.id) ?? []));
};

const updateRemoteOrder = async (storeId: string, id: string, update: UpdateWebshopOrderInput) => {
  const { data, error } = await supabase.rpc('update_webshop_order', {
    target_store_id: storeId,
    target_order_id: id,
    payload: JSON.parse(JSON.stringify(update)) as Json,
  });
  if (error) throw error;
  const order = mapRemotePayload(data);
  notifyOrderChange();
  return { order, updatedProducts: [] };
};

export const localWebshopCommerceGateway: WebshopCommerceGateway = {
  placeOrder: placeLocalOrder,
  listOrders: listLocalOrders,
  updateOrder: updateLocalOrder,
};

export const webshopCommerce: WebshopCommerceGateway = {
  placeOrder: (input) => isSupabaseConfigured ? placeRemoteOrder(input) : placeLocalOrder(input),
  listOrders: () => {
    const storeId = useAuth.getState().currentStoreId;
    return isSupabaseConfigured && storeId ? listRemoteOrders(storeId) : listLocalOrders();
  },
  updateOrder: (id, update) => {
    const storeId = useAuth.getState().currentStoreId;
    return isSupabaseConfigured && storeId ? updateRemoteOrder(storeId, id, update) : updateLocalOrder(id, update);
  },
};
