export type Category = string;

export type SubCategory = string;

export interface ProductCategory {
  id: string;
  /** Internal backend identifier retained for realtime product-category mapping. */
  serverId?: string;
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
  /** Product reference used by the primary supplier. */
  supplierCode?: string;
  variant?: string;
  /**
   * Deterministic customer-group prices in integer cents. The standard price
   * remains `priceCents`; a missing group always falls back to that value.
   */
  priceTiers?: Record<string, number>;
  /** Merchant-defined import fields that are not part of the financial core. */
  customFields?: Record<string, string | number | boolean | null>;
  /** Current on-hand stock. Undefined means stock not tracked for this product. */
  stockQty?: number;
  /** Low-stock threshold used for alerts in admin/menu. */
  minStockQty?: number;
  color?: string;
  /** Soft-delete flag. Inactive products stay in history but disappear from the menu. */
  isActive?: boolean;
  /**
   * Financial treatment of the catalog row. Gift-card value is a liability,
   * never merchandise revenue or gross profit.
   */
  productType?: "merchandise" | "service" | "gift-card";
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

export type TableStatus = "free" | "ordered" | "waiting";

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

export type PaymentMethod = "Cash" | "PIN" | "Cadeaubon" | "Split";

export type TenderMethod = Exclude<PaymentMethod, "Split">;

export interface PaymentTender {
  method: TenderMethod;
  amountCents: number;
}

export type TransactionKind = "sale" | "refund";

/**
 * Operational destination for a returned item. Only `sellable` returns to the
 * available-to-sell quantity; the other states deliberately stay out of POS
 * stock until a separate inspection or supplier workflow resolves them.
 */
export type ReturnDisposition =
  | "sellable"
  | "quarantine"
  | "defective"
  | "supplier-return";

/** Reason recorded with a deliberate physical stock count/correction. */
export type InventoryAdjustmentReason =
  | "cycle-count"
  | "opening-balance"
  | "damage"
  | "loss"
  | "found"
  | "other";

/** The document the cashier intentionally requested before payment. */
export type SaleDocumentType = "receipt" | "invoice-b2c" | "invoice-b2b";

/**
 * Frozen billing information used for an issued invoice. It deliberately lives
 * on the transaction instead of being resolved from the mutable customer file
 * when somebody opens an old document.
 */
export interface InvoiceRecipientSnapshot {
  customerId?: string;
  name: string;
  companyName?: string;
  addressLine1: string;
  postalCode: string;
  city: string;
  countryCode: string;
  vatNumber?: string;
  email?: string;
  purchaseOrderReference?: string;
}

export interface SaleDocumentRequest {
  type: SaleDocumentType;
  /** Present for each invoice; absent for a normal anonymous receipt. */
  recipient?: InvoiceRecipientSnapshot;
}

/**
 * Mutable billing profile stored on a customer. Issued invoices never resolve
 * these fields directly: they use InvoiceRecipientSnapshot instead.
 */
export interface CustomerBillingProfile {
  type: "individual" | "business";
  companyName?: string;
  contactName: string;
  addressLine1: string;
  postalCode: string;
  city: string;
  countryCode: string;
  vatNumber?: string;
  email?: string;
  purchaseOrderReference?: string;
}

export interface Transaction {
  id?: number;
  /**
   * Client-generated idempotency key. Unique per checkout attempt, so a retry
   * or double-submit resolves to the already-persisted sale instead of a new one.
   */
  clientRequestId?: string;
  tableId: number;
  items: OrderItem[];
  subtotalCents: number;
  vat12Cents: number;
  vat21Cents: number;
  /**
   * Belgian five-cent cash rounding. The commercial/VAT total stays in
   * `totalCents`; this separately records the settlement difference.
   */
  roundingAdjustmentCents?: number;
  totalCents: number;
  discountCents: number;
  /** Optional manager-approved cart discount metadata. */
  discountReason?: string;
  discountApprovedByUserId?: string;
  /** Server-issued single-use approval used when a cashier applies a discount. */
  discountApprovalId?: string;
  /** Optional gratuity (added on top of total). */
  tipCents?: number;
  /** Cash tendered, used to compute change for receipts. */
  tenderedCents?: number;
  paymentMethod: PaymentMethod;
  /** Canonical tender ledger. New rows always contain at least one tender. */
  tenders?: PaymentTender[];
  /** @deprecated Legacy alias retained for database migration/read compatibility. */
  splitTenders?: PaymentTender[];
  /** Exact cards used in this sale; required for card-level reconciliation and history. */
  giftCardAllocations?: {
    giftCardId: string;
    code: string;
    amountCents: number;
    /** Immutable balance immediately after this redemption, for receipts/reprints. */
    balanceAfterCents?: number;
  }[];
  timestamp: number;
  isFinalized: 0 | 1;
  userId?: string;
  userName?: string;
  customerId?: string;
  /** Demo transactions are explicitly marked so they can be removed without touching live sales. */
  source?: "live" | "demo" | "webshop" | "import";
  kind?: TransactionKind;
  /** Original sale for a refund/correction row. */
  originalTransactionId?: number;
  correctionReason?: string;
  /** Physical disposition selected when this row is a return. */
  returnDisposition?: ReturnDisposition;
  /** Stable human-facing number and immutable merchant snapshot. */
  documentNumber?: string;
  /** Immutable Code 128 lookup key printed on every receipt and credit note. */
  receiptBarcode?: string;
  receiptBarcodeVersion?: 1;
  /** Cashier-selected document intent and immutable invoice recipient data. */
  documentRequest?: SaleDocumentRequest;
  /** Invoice sequence assigned at issue time. A backend will become canonical. */
  invoiceNumber?: string;
  invoiceIssuedAt?: number;
  merchantSnapshot?: {
    name: string;
    legalName?: string;
    addressLine1: string;
    addressLine2: string;
    vatNumber: string;
    phone?: string;
    email?: string;
    website?: string;
    footer?: string;
    returnPolicy?: string;
  };
  registerId?: string;
  shiftId?: number;
}

export type BusinessActionType =
  "inventory-reorder" | "discount-review" | "customer-recovery" | "team-review";

export type BusinessActionStatus =
  "draft" | "in-progress" | "completed" | "snoozed" | "dismissed";

export type InventoryForecastConfidence = "low" | "medium" | "high";

export type InventoryForecastUrgency =
  "out" | "critical" | "soon" | "watch" | "healthy" | "no-sales";

export type InventoryForecastModel =
  "insufficient" | "recent-blend" | "intermittent" | "seasonal-blend";

export type InventoryForecastTrend =
  "rising" | "stable" | "falling" | "unknown";

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

export type PurchaseOrderStatus =
  "draft" | "ordered" | "partially-received" | "received" | "cancelled";

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
  source: "inventory-forecast";
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
  reason:
    | "purchase-receipt"
    | "webshop-reservation"
    | "webshop-release"
    | "pos-sale"
    | "pos-refund"
    | "manual-adjustment";
  timestamp: number;
  purchaseOrderId?: string;
  transactionId?: number;
  userId?: string;
  userName?: string;
  /** Snapshot fields are populated for formal physical counts/corrections. */
  quantityBefore?: number;
  quantityAfter?: number;
  adjustmentReason?: InventoryAdjustmentReason;
  note?: string;
  /** Present for the stock movement caused by a sellable POS return. */
  returnDisposition?: ReturnDisposition;
  clientRequestId?: string;
}

export type WebshopOrderStatus =
  "pending" | "confirmed" | "completed" | "cancelled";
export type WebshopPaymentStatus = "pending" | "paid" | "failed" | "refunded";
export type WebshopFulfillmentStatus =
  "unfulfilled" | "processing" | "ready-for-pickup" | "shipped" | "picked-up";
export type WebshopInventoryStatus = "reserved" | "committed" | "released";
export type WebshopDeliveryMode = "shipping" | "pickup";

/** Immutable commercial snapshot; catalog edits never rewrite existing webshop orders. */
export interface WebshopOrderLine {
  productId: string;
  productName: string;
  variant?: string;
  sku?: string;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
}

export interface WebshopOrder {
  id: string;
  /** Unique retry key. A double click or retry can never create a second order. */
  clientRequestId: string;
  number: string;
  source: "demo" | "live";
  createdAt: number;
  updatedAt: number;
  status: WebshopOrderStatus;
  paymentStatus: WebshopPaymentStatus;
  fulfillmentStatus: WebshopFulfillmentStatus;
  inventoryStatus: WebshopInventoryStatus;
  paymentMethod: string;
  paymentReference: string;
  deliveryMode: WebshopDeliveryMode;
  customer: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
  };
  shippingAddress?: {
    street: string;
    number: string;
    postal: string;
    city: string;
    country: string;
  };
  pickupAddress?: string;
  note?: string;
  couponCode?: string;
  lines: WebshopOrderLine[];
  subtotalCents: number;
  discountCents: number;
  shippingCents: number;
  totalCents: number;
  confirmationEmail: {
    to: string;
    status: "sent-demo" | "queued" | "failed";
    sentAt?: number;
    subject: string;
  };
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
  /** Canonical Supabase UUID; local `id` remains the Dexie cache key. */
  serverId?: string;
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
  /** Sum of statutory cash rounding differences, kept apart from VAT revenue. */
  totalCashRoundingAdjustmentCents?: number;
  paymentTotalsCents: {
    Cash: number;
    PIN: number;
    Cadeaubon: number;
  };
  giftCardLiabilityAddedCents?: number;
  giftCardLiabilityPaymentTotalsCents?: {
    Cash: number;
    PIN: number;
    Cadeaubon: number;
  };
  giftCardEventIds?: string[];
  transactionIds: number[];
  hash: string;
  prevHash: string | null;
  closedByUserId?: string;
  closedByUserName?: string;
  registerId?: string;
  shiftId?: number;
  openingFloatCents?: number;
  countedCashCents?: number;
  expectedCashCents?: number;
  cashDifferenceCents?: number;
  cashDifferenceReason?: string;
  /** Canonical data that the hash was calculated from. */
  hashPayloadVersion?: number;
  /** Exact canonical payload used by server-authoritative reports (v3+). */
  serverHashPayload?: string;
}

export interface RegisterShift {
  id?: number;
  shiftNumber: number;
  registerId: string;
  openedAt: number;
  openedByUserId?: string;
  openedByUserName?: string;
  openingFloatCents: number;
  closedAt?: number;
  closedByUserId?: string;
  closedByUserName?: string;
  countedCashCents?: number;
  expectedCashCents?: number;
  cashDifferenceCents?: number;
  cashDifferenceReason?: string;
  status: "open" | "closed";
}

export type Role = "owner" | "manager" | "cashier";

export interface User {
  id: string;
  name: string;
  firstName?: string;
  lastName?: string;
  role: Role;
  jobTitle?: string;
  /** SHA-256 hex of the PIN. */
  pinHash: string;
  email?: string;
  /** SHA-256 hex of the password. */
  passwordHash?: string;
  storeName?: string;
  createdAt?: string;
  /** Optional link to the server-authoritative employment record. */
  workforceEmployeeId?: string;
}

export type AuditAction =
  | "login"
  | "logout"
  | "register"
  | "order.add"
  | "order.remove"
  | "order.update"
  | "order.note"
  | "order.modifier"
  | "order.void"
  | "order.send"
  | "order.bump"
  | "table.clear"
  | "table.guests"
  | "table.server"
  | "cart.suspend"
  | "cart.resume"
  | "cart.discard"
  | "checkout"
  | "refund.create"
  | "approve"
  | "discount.apply"
  | "zreport.finalize"
  | "product.create"
  | "product.update"
  | "product.delete"
  | "product.restore"
  | "customer.create"
  | "customer.update"
  | "customer.delete"
  | "customer.restore"
  | "giftcard.create"
  | "giftcard.recharge"
  | "giftcard.deduct"
  | "giftcard.deactivate"
  | "giftcard.activate"
  | "business_action.create"
  | "business_action.update"
  | "purchase_order.create"
  | "purchase_order.update"
  | "purchase_order.receive"
  | "purchase_order.cancel"
  | "inventory.count"
  | "webshop_order.create"
  | "webshop_order.update"
  | "webshop_order.cancel"
  | "import.preview"
  | "import.complete"
  | "import.rollback"
  | "migration.activate"
  | "migration.undo"
  | "service_order.create"
  | "service_order.update"
  | "service_order.status"
  | "service_order.communication";

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
  kind:
    | "transaction"
    | "daily_report"
    | "audit"
    | "webshop_order"
    | "webshop_email"
    | "upsert_product"
    | "upsert_customer"
    | "upsert_category"
    | "delete_category"
    | "gift_card_mutation"
    /** Durable server command for a locally committed migration activation. */
    | "migration_activate"
    /** Durable server command that closes the automatic full-undo window. */
    | "migration_lock"
    /** Durable server command for a locally committed Mode 1 undo. */
    | "migration_undo";
  payload: unknown;
  attempts: number;
  lastError?: string;
  /**
   * Delivery lifecycle is persisted so a bad non-financial integration cannot
   * pin the whole store queue forever. `in_flight` is protected with a lease
   * to keep two browser tabs from delivering the same row concurrently.
   */
  deliveryStatus?: "pending" | "retrying" | "in_flight" | "dead_letter";
  /** Earliest time at which a retrying entry may be claimed again. */
  nextAttemptAt?: number;
  /** Diagnostic only; no business data is stored here. */
  lastAttemptAt?: number;
  /** Random per-drain lease token used to safely finish or release a claim. */
  leaseOwner?: string;
  leaseExpiresAt?: number;
  /** A permanent business/configuration failure needs an explicit operator retry. */
  requiresManualResolution?: boolean;
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
  /** Default details to prefill a new invoice for this customer. */
  billingProfile?: CustomerBillingProfile;
  notes?: string;
  /** Optional price-book/customer segment key, e.g. `telenet-klant` or `b2b`. */
  priceGroup?: string;
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

export type ImportSourceFormat = "csv" | "tsv" | "xlsx" | "json";

export type ImportJobStatus =
  | "preview"
  | "completed"
  | "completed-with-errors"
  | "failed"
  | "rolled-back";

export interface ImportFieldMapping {
  source: string;
  target: string;
  confidence: number;
}

export interface ImportMappingProfile {
  id: string;
  name: string;
  format: ImportSourceFormat;
  mappings: ImportFieldMapping[];
  createdAt: number;
  updatedAt: number;
  lastUsedAt?: number;
}

export interface ImportJob {
  id: string;
  fileName: string;
  format: ImportSourceFormat;
  status: ImportJobStatus;
  createdAt: number;
  completedAt?: number;
  rowCount: number;
  importedCount: number;
  updatedCount: number;
  skippedCount: number;
  errorCount: number;
  mappings: ImportFieldMapping[];
  profileId?: string;
  affectedProductIds: string[];
  issues: Array<{ row: number; message: string }>;
}

/** Immutable activation record for one tenant migration. The first meaningful
 * activity fields are write-once: once present, a full automatic undo is no
 * longer permitted. */
export type MigrationActivationStatus =
  | "active"
  | "undone"
  | "locked"
  | "correction-required";

export type MigrationMeaningfulActivityType =
  | "checkout"
  | "refund"
  | "catalog-change"
  | "customer-change"
  | "stock-change"
  | "service-change"
  | "gift-card-change"
  | "webshop-order"
  | "configuration-change"
  | "external-delivery";

export type MigrationEntityType =
  | "transaction"
  | "product"
  | "category"
  | "customer"
  | "stock-movement"
  | "service-order"
  | "gift-card"
  | "webshop-order"
  | "store-configuration"
  | "external-delivery";

export type MigrationInverseActionType =
  | "delete-created"
  | "restore-before-image"
  | "remove-relation"
  | "restore-configuration";

export type MigrationJson =
  | string
  | number
  | boolean
  | null
  | MigrationJson[]
  | { [key: string]: MigrationJson };

export interface MigrationActivation {
  id: string;
  storeId: string;
  status: MigrationActivationStatus;
  graphVersion: number;
  answersJson: Record<string, MigrationJson>;
  receiptJson: Record<string, MigrationJson>;
  activatedAt: number;
  createdAt: number;
  updatedAt: number;
  /** Write once when the tenant begins using the activated setup. */
  firstMeaningfulActivityAt?: number;
  firstMeaningfulActivityType?: MigrationMeaningfulActivityType;
  firstMeaningfulActivityEntityType?: MigrationEntityType;
  firstMeaningfulActivityEntityId?: string;
  lockedAt?: number;
  undoneAt?: number;
}

/** One deterministic inverse operation, executed in sequence during Mode 1
 * undo. The migration receipt itself is never deleted. */
export interface MigrationInverseChange {
  id: string;
  migrationId: string;
  sequence: number;
  actionType: MigrationInverseActionType;
  entityType: MigrationEntityType;
  entityId: string;
  beforeImageOrInversePayload: MigrationJson;
  createdAt: number;
}

/** Append-only evidence that a migration's full-undo window closed. */
export interface MigrationActivityLock {
  id: string;
  migrationId: string;
  storeId: string;
  activityType: MigrationMeaningfulActivityType;
  entityType: MigrationEntityType;
  entityId: string;
  occurredAt: number;
  actorUserId?: string;
  actorName?: string;
  correlationId?: string;
}

export type ServiceOrderSystemStatus =
  | "open"
  | "in-progress"
  | "blocked"
  | "ready"
  | "closed"
  | "cancelled";

export type ServiceOrderRoute =
  | "internal-repair"
  | "external-repair"
  | "exchange"
  | "warranty-return";

export interface ServiceOrderEvent {
  id: string;
  timestamp: number;
  type: "created" | "status" | "note" | "communication" | "payment";
  label: string;
  detail?: string;
  userId?: string;
  userName?: string;
}

export interface ServiceOrderAttachment {
  id: string;
  name: string;
  contentType: string;
  size: number;
  /** Local fallback used until object storage has accepted the upload. */
  dataUrl?: string;
  remotePath?: string;
  createdAt: number;
}

export interface ServiceOrder {
  id: string;
  number: string;
  trackingToken: string;
  createdAt: number;
  updatedAt: number;
  promisedAt?: number;
  status: ServiceOrderSystemStatus;
  substatus: string;
  route: ServiceOrderRoute;
  customerId?: string;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  assetType: string;
  brand?: string;
  model?: string;
  identifierType?: string;
  identifierValue?: string;
  accessories?: string;
  issue: string;
  intakeCondition?: string;
  diagnosis?: string;
  resolution?: string;
  externalReference?: string;
  internalNote?: string;
  warranty: boolean;
  noCureNoPay: boolean;
  diagnosisFeeCents: number;
  laborCents: number;
  partsCents: number;
  otherCents: number;
  depositCents: number;
  totalCents: number;
  paidCents: number;
  attachments: ServiceOrderAttachment[];
  events: ServiceOrderEvent[];
  merchantSnapshot: {
    name: string;
    phone?: string;
    email?: string;
    addressLine1?: string;
    addressLine2?: string;
  };
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

export type GiftCardEventType =
  | "issue"
  | "recharge"
  | "redeem"
  | "deactivate"
  | "activate"
  | "refund"
  | "expire"
  | "opening-balance";

/** Append-only ledger row. Financial mutations write this atomically with the card itself. */
export interface GiftCardEvent {
  id: string;
  giftCardId: string;
  giftCardCode: string;
  type: GiftCardEventType;
  /** Positive magnitude for issue, recharge and redemption; zero for status events. */
  amountCents: number;
  balanceBeforeCents: number;
  balanceAfterCents: number;
  timestamp: number;
  transactionId?: number;
  clientRequestId?: string;
  customerId?: string;
  userId?: string;
  userName?: string;
  source?: "live" | "demo" | "migration";
  note?: string;
  /** Payment received when value was issued/recharged. Empty for non-financial status events. */
  paymentTenders?: PaymentTender[];
  dailyReportId?: number;
}
