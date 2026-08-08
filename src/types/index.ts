export type Category = string;

export type SubCategory = string;

export interface ProductCategory {
  id: string;
  name: string;
  vatRate: number;
  sortOrder?: number;
  isActive?: boolean;
}

export interface Product {
  id: string;
  name: string;
  category: Category;
  subCategory?: SubCategory;
  /** Optional owner-defined SKU for inventory operations. */
  sku?: string;
  /** Optional scan code (EAN/UPC/custom). */
  barcode?: string;
  /** Unit price in INTEGER CENTS (EUR). */
  priceCents: number;
  /** Owner purchase cost in INTEGER CENTS (EUR), excluding recoverable VAT. */
  costPriceCents?: number;
  /** Belgian VAT percentage applied to the gross selling price. */
  vatRate: number;
  brand?: string;
  supplier?: string;
  variant?: string;
  /** Current on-hand stock. Undefined means stock not tracked for this product. */
  stockQty?: number;
  /** Low-stock threshold used for alerts in admin/menu. */
  minStockQty?: number;
  color?: string;
  /** Soft-delete flag. Inactive products stay in history but disappear from the menu. */
  isActive?: boolean;
}

/**
 * Modifier on a single line item, e.g. assembly service or gift wrapping.
 * Free modifiers use deltaCents = 0.
 */
export interface Modifier {
  id: string;
  label: string;
  deltaCents: number;
}

export interface OrderItem {
  /** Stable line ID — survives quantity changes & modifier edits. */
  lineId: string;
  product: Product;
  quantity: number;
  notes?: string;
  modifiers?: Modifier[];
  /**
  * Marker reserved for external fulfilment integrations, so tickets are not
  * duplicated when the cart is mutated again.
   */
  sentAt?: number;
  /** Marker reserved for external fulfilment status integrations. */
  bumpedAt?: number;
}

export type TableStatus = 'free' | 'ordered' | 'waiting';

export interface Table {
  id: number;
  name?: string;
  status: TableStatus;
  lastActionTime: number | null;
  /** When the cart/session started, used for elapsed-time chips. */
  openedAt?: number | null;
  /** Optional customer count for appointment or fitting flows. */
  guestCount?: number;
  /** Employee who owns this cart during the current shift. */
  serverId?: string | null;
  serverName?: string | null;
  orders: OrderItem[];
  customerCard?: CustomerCard | null;
}

export interface CustomerCard {
  id: string;
  name: string;
  /** 1 point = 10 cents (€0.10) discount. */
  points: number;
}

export type PaymentMethod = 'Cash' | 'PIN' | 'Cadeaubon' | 'Split';

export interface Transaction {
  id?: number;
  tableId: number;
  items: OrderItem[];
  subtotalCents: number;
  vat12Cents: number;
  vat21Cents: number;
  totalCents: number;
  discountCents: number;
  /** Optional manager-approved cart discount metadata. */
  discountReason?: string;
  discountApprovedByUserId?: string;
  /** Optional gratuity (added on top of total). */
  tipCents?: number;
  /** Cash tendered, used to compute change for receipts. */
  tenderedCents?: number;
  paymentMethod: PaymentMethod;
  splitTenders?: { method: 'Cash' | 'PIN' | 'Cadeaubon'; amountCents: number }[];
  timestamp: number;
  isFinalized: 0 | 1;
  userId?: string;
  userName?: string;
  customerId?: string;
  /** Demo transactions are explicitly marked so they can be removed without touching live sales. */
  source?: 'live' | 'demo';
}

export type BusinessActionType =
  | 'inventory-reorder'
  | 'discount-review'
  | 'customer-recovery'
  | 'team-review';

export type BusinessActionStatus = 'draft' | 'in-progress' | 'completed' | 'snoozed' | 'dismissed';

export type InventoryForecastConfidence = 'low' | 'medium' | 'high';

export type InventoryForecastUrgency = 'out' | 'critical' | 'soon' | 'watch' | 'healthy' | 'no-sales';

export type InventoryForecastModel = 'insufficient' | 'recent-blend' | 'intermittent' | 'seasonal-blend';

export type InventoryForecastTrend = 'rising' | 'stable' | 'falling' | 'unknown';

export interface ReorderActionItem {
  productId: string;
  productName: string;
  supplier: string;
  currentStockQty: number;
  minStockQty: number;
  observedDays: number;
  activeSalesDays: number;
  soldLast7Days: number;
  soldLast30Days: number;
  soldLast90Days: number;
  averageDailySales: number;
  estimatedDaysCover: number | null;
  estimatedStockoutAt: number | null;
  estimatedReorderAt: number | null;
  estimatedDaysUntilReorder: number | null;
  confidence: InventoryForecastConfidence;
  forecastModel: InventoryForecastModel;
  trend: InventoryForecastTrend;
  urgency: InventoryForecastUrgency;
  targetCoverDays: number;
  suggestedQty: number;
  selectedQty: number;
  unitCostCents?: number;
}

export type PurchaseOrderStatus = 'draft' | 'ordered' | 'partially-received' | 'received' | 'cancelled';

export interface PurchaseOrderItem {
  productId: string;
  productName: string;
  sku?: string;
  orderedQty: number;
  receivedQty: number;
  unitCostCents?: number;
  currentStockQtyAtDraft: number;
  minStockQtyAtDraft: number;
  estimatedStockoutAt: number | null;
  forecastConfidence: InventoryForecastConfidence;
  forecastTrend: InventoryForecastTrend;
}

/** A supplier-specific order. Product and price data are snapshotted at creation. */
export interface PurchaseOrder {
  id: string;
  supplier: string;
  status: PurchaseOrderStatus;
  source: 'inventory-forecast';
  createdAt: number;
  updatedAt: number;
  orderedAt?: number;
  receivedAt?: number;
  expectedDeliveryAt?: number;
  reference?: string;
  note?: string;
  ownerUserId?: string;
  ownerName?: string;
  items: PurchaseOrderItem[];
}

export interface StockMovement {
  id?: number;
  productId: string;
  productName: string;
  quantityDelta: number;
  reason: 'purchase-receipt';
  timestamp: number;
  purchaseOrderId: string;
  userId?: string;
  userName?: string;
}

/**
 * A decision the owner explicitly saved from Pwayment Intelligence.
 * It is deliberately separate from a financial transaction or purchase order:
 * saving a proposal must never alter stock, send a message or place an order.
 */
export interface BusinessAction {
  id: string;
  type: BusinessActionType;
  status: BusinessActionStatus;
  sourceSignalId: string;
  title: string;
  description: string;
  createdAt: number;
  updatedAt: number;
  dueAt?: number;
  completedAt?: number;
  ownerUserId?: string;
  ownerName?: string;
  /** Evidence captured at decision time, so outcomes can later be compared fairly. */
  baseline: {
    transactionCount: number;
    revenueCents: number;
    grossProfitCents: number;
  };
  inventoryItems?: ReorderActionItem[];
  customerIds?: string[];
  transactionIds?: number[];
  note?: string;
}

export interface DailyReport {
  id?: number;
  reportNumber: number;
  timestamp: number;
  totalRevenueCents: number;
  totalCostCents: number;
  grossProfitCents: number;
  totalVat12Cents: number;
  totalVat21Cents: number;
  totalExclVat12Cents: number;
  totalExclVat21Cents: number;
  totalDiscountCents: number;
  paymentTotalsCents: {
    Cash: number;
    PIN: number;
    Cadeaubon: number;
  };
  transactionIds: number[];
  hash: string;
  prevHash: string | null;
  closedByUserId?: string;
  closedByUserName?: string;
}

export type Role = 'owner' | 'manager' | 'cashier';

export interface User {
  id: string;
  name: string;
  role: Role;
  /** SHA-256 hex of the PIN. */
  pinHash: string;
}

export type AuditAction =
  | 'login'
  | 'logout'
  | 'order.add'
  | 'order.remove'
  | 'order.update'
  | 'order.note'
  | 'order.modifier'
  | 'order.void'
  | 'order.send'
  | 'order.bump'
  | 'table.clear'
  | 'table.guests'
  | 'table.server'
  | 'checkout'
  | 'approve'
  | 'discount.apply'
  | 'zreport.finalize'
  | 'product.create'
  | 'product.update'
  | 'product.delete'
  | 'product.restore'
  | 'customer.create'
  | 'customer.update'
  | 'customer.delete'
  | 'customer.restore'
  | 'giftcard.create'
  | 'giftcard.recharge'
  | 'giftcard.deduct'
  | 'giftcard.deactivate'
  | 'giftcard.activate'
  | 'business_action.create'
  | 'business_action.update'
  | 'purchase_order.create'
  | 'purchase_order.update'
  | 'purchase_order.receive'
  | 'purchase_order.cancel';

export interface AuditEntry {
  id?: number;
  timestamp: number;
  userId: string | null;
  userName: string | null;
  action: AuditAction;
  detail?: unknown;
}

export interface OutboxEntry {
  id?: number;
  timestamp: number;
  kind: 'transaction' | 'daily_report' | 'audit';
  payload: unknown;
  attempts: number;
  lastError?: string;
}

/** Voided line item — surfaces in audit + Z-report variance. */
export interface VoidEntry {
  id?: number;
  timestamp: number;
  tableId: number;
  productId: string;
  productName: string;
  quantity: number;
  amountCents: number;
  reason: string;
  byUserId: string;
  byUserName: string;
}

export interface Customer {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  notes?: string;
  /** Cumulative amount spent in INTEGER CENTS (EUR). */
  totalSpentCents: number;
  /** Number of completed transactions. */
  visitCount: number;
  /** ISO timestamp of last checkout. */
  lastVisitAt?: string;
  /** ISO timestamp of creation. */
  createdAt: string;
  /** Soft-delete flag. */
  isActive: boolean;
}

export interface GiftCard {
  id: string;
  /** Linked customer (optional — anonymous gift cards allowed). */
  customerId?: string;
  /** Unique scannable/typeable code. */
  code: string;
  /** Original loaded amount in INTEGER CENTS (EUR). */
  initialCents: number;
  /** Current remaining balance in INTEGER CENTS (EUR). */
  balanceCents: number;
  /** ISO timestamp of issue date. */
  issuedAt: string;
  /** Optional ISO timestamp expiry date. */
  expiresAt?: string;
  /** Active/blocked flag. */
  isActive: boolean;
}
