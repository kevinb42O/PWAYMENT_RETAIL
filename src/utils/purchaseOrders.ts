import {
  Product,
  PurchaseOrder,
  PurchaseOrderItem,
  ReorderActionItem,
  StockMovement,
} from '../types';
import { MISSING_SUPPLIER } from './retailActionEngine';

export interface PurchaseOrderOwner {
  userId?: string;
  userName?: string;
}

export interface PurchaseOrderDraftOptions extends PurchaseOrderOwner {
  now?: number;
  idFactory?: () => string;
  productSkus?: Record<string, string | undefined>;
}

export interface PurchaseOrderReceiptResult {
  order: PurchaseOrder;
  updatedProducts: Product[];
  movements: StockMovement[];
}

const defaultOrderId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `purchase-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

const positiveInteger = (value: number) => Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;

export const purchaseOrderTotalCents = (order: PurchaseOrder) => order.items.reduce(
  (sum, item) => sum + (item.unitCostCents ?? 0) * item.orderedQty,
  0,
);

export const purchaseOrderOutstandingQty = (order: PurchaseOrder) => order.items.reduce(
  (sum, item) => sum + Math.max(0, item.orderedQty - item.receivedQty),
  0,
);

export const buildPurchaseOrderDrafts = (
  selectedRows: ReorderActionItem[],
  options: PurchaseOrderDraftOptions = {},
): PurchaseOrder[] => {
  const now = options.now ?? Date.now();
  const idFactory = options.idFactory ?? defaultOrderId;
  const rowsBySupplier = new Map<string, ReorderActionItem[]>();

  for (const row of selectedRows) {
    if (row.supplier === MISSING_SUPPLIER || positiveInteger(row.selectedQty) === 0) continue;
    const supplierRows = rowsBySupplier.get(row.supplier) ?? [];
    supplierRows.push(row);
    rowsBySupplier.set(row.supplier, supplierRows);
  }

  return [...rowsBySupplier.entries()].map(([supplier, rows]) => ({
    id: idFactory(),
    supplier,
    status: 'draft',
    source: 'inventory-forecast',
    createdAt: now,
    updatedAt: now,
    ownerUserId: options.userId,
    ownerName: options.userName,
    items: rows.map((row): PurchaseOrderItem => ({
      productId: row.productId,
      productName: row.productName,
      sku: options.productSkus?.[row.productId],
      orderedQty: positiveInteger(row.selectedQty),
      receivedQty: 0,
      unitCostCents: row.unitCostCents,
      currentStockQtyAtDraft: row.currentStockQty,
      minStockQtyAtDraft: row.minStockQty,
      estimatedStockoutAt: row.estimatedStockoutAt,
      forecastConfidence: row.confidence,
      forecastTrend: row.trend,
    })),
  }));
};

export const markPurchaseOrderAsOrdered = (
  order: PurchaseOrder,
  details: { now?: number; reference?: string; expectedDeliveryAt?: number },
): PurchaseOrder => {
  if (order.status !== 'draft') throw new Error('Alleen een concept kan als besteld worden gemarkeerd.');
  const now = details.now ?? Date.now();
  const reference = details.reference?.trim();
  return {
    ...order,
    status: 'ordered',
    updatedAt: now,
    orderedAt: now,
    reference: reference || undefined,
    expectedDeliveryAt: details.expectedDeliveryAt,
  };
};

export const updatePurchaseOrderDraftQuantities = (
  order: PurchaseOrder,
  quantitiesByProductId: Record<string, number>,
  now = Date.now(),
): PurchaseOrder => {
  if (order.status !== 'draft') throw new Error('Alleen een concept kan worden aangepast.');
  const items = order.items.map((item) => {
    const quantity = quantitiesByProductId[item.productId] == null
      ? item.orderedQty
      : positiveInteger(quantitiesByProductId[item.productId]);
    if (quantity < 1) throw new Error(`Het bestelaantal voor ${item.productName} moet minstens 1 zijn.`);
    return { ...item, orderedQty: quantity };
  });
  return { ...order, items, updatedAt: now };
};

export const cancelPurchaseOrder = (order: PurchaseOrder, now = Date.now()): PurchaseOrder => {
  if (order.status !== 'draft') throw new Error('Alleen een concept kan worden geannuleerd.');
  return { ...order, status: 'cancelled', updatedAt: now };
};

/**
 * Applies a checked delivery without persistence. Callers store the returned
 * order, products and movements atomically in one database transaction.
 */
export const applyPurchaseOrderReceipt = (
  order: PurchaseOrder,
  receivedByProductId: Record<string, number>,
  products: Product[],
  options: PurchaseOrderOwner & { now?: number } = {},
): PurchaseOrderReceiptResult => {
  if (order.status !== 'ordered' && order.status !== 'partially-received') {
    throw new Error('Ontvangst is alleen mogelijk voor een bestelling die als besteld staat.');
  }
  const now = options.now ?? Date.now();
  const productsById = new Map(products.map((product) => [product.id, product]));
  const updatedProducts: Product[] = [];
  const movements: StockMovement[] = [];
  let receivedAnything = false;

  const items = order.items.map((item) => {
    const quantity = positiveInteger(receivedByProductId[item.productId] ?? 0);
    if (quantity === 0) return item;
    const outstanding = item.orderedQty - item.receivedQty;
    if (quantity > outstanding) {
      throw new Error(`Voor ${item.productName} kunnen maximaal ${outstanding} stuks worden ontvangen.`);
    }
    const product = productsById.get(item.productId);
    if (!product || product.stockQty == null) {
      throw new Error(`De voorraad van ${item.productName} kan niet worden bijgewerkt.`);
    }
    receivedAnything = true;
    const updatedProduct = { ...product, stockQty: product.stockQty + quantity };
    productsById.set(product.id, updatedProduct);
    updatedProducts.push(updatedProduct);
    movements.push({
      productId: product.id,
      productName: product.name,
      quantityDelta: quantity,
      reason: 'purchase-receipt',
      timestamp: now,
      purchaseOrderId: order.id,
      userId: options.userId,
      userName: options.userName,
    });
    return { ...item, receivedQty: item.receivedQty + quantity };
  });

  if (!receivedAnything) throw new Error('Vul minstens één ontvangen aantal in.');
  const fullyReceived = items.every((item) => item.receivedQty >= item.orderedQty);
  return {
    order: {
      ...order,
      items,
      status: fullyReceived ? 'received' : 'partially-received',
      updatedAt: now,
      receivedAt: fullyReceived ? now : undefined,
    },
    updatedProducts,
    movements,
  };
};
