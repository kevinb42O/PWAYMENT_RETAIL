import type { PostgrestError } from "@supabase/supabase-js";
import { activateTenantDatabase, db } from "../db/db";
import { DEFAULT_MERCHANT, type MerchantInfo } from "../data/merchant";
import { supabase } from "../lib/supabase";
import { useMerchantProfile } from "../store/useMerchantProfile";
import { useStoreConfiguration } from "../store/useStoreConfiguration";
import {
  normalizeStoreConfiguration,
  recommendedStartView,
} from "../onboarding/storeConfiguration";
import { reportLoadingProgress } from "./loadingProgress";
import {
  EMPTY_WEBSHOP_SETTINGS,
  useWebshopStore,
} from "../store/useWebshopStore";
import type { Database, Json } from "../types/database.generated";
import type {
  AuditEntry,
  Customer,
  DailyReport,
  GiftCard,
  GiftCardEvent,
  Product,
  ProductCategory,
  PurchaseOrder,
  RegisterShift,
  StockMovement,
  Transaction,
  VoidEntry,
} from "../types";

type TableName = keyof Database["public"]["Tables"];
type Row<T extends TableName> = Database["public"]["Tables"][T]["Row"];

const PAGE_SIZE = 500;

const fetchAll = async <T>(
  fetchPage: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: PostgrestError | null }>,
): Promise<T[]> => {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await fetchPage(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
};

const jsonArray = <T>(value: Json | null): T[] =>
  Array.isArray(value) ? (value as T[]) : [];

const jsonObject = <T>(value: Json | null): T => (value ?? {}) as T;

const blankMerchant = (name: string): MerchantInfo => ({
  ...DEFAULT_MERCHANT,
  name,
  legalName: name,
  addressLine1: "",
  addressLine2: "",
  vatNumber: "",
  phone: "",
  email: "",
  website: "",
  footer: "",
  returnPolicy: "",
});

/**
 * Replace the single-device Dexie cache with the active Supabase store.
 * Clearing before hydration prevents data from a previous Auth account from
 * appearing while a new tenant is loading on the same browser.
 */
export const syncStoreFromSupabase = async (storeId: string): Promise<void> => {
  const [previousProducts, previousCustomers] = await Promise.all([
    db.products.toArray(),
    db.customers.toArray(),
  ]);
  const previousProductById = new Map(previousProducts.map((product) => [product.id, product]));
  const previousCustomerById = new Map(previousCustomers.map((customer) => [customer.id, customer]));
  activateTenantDatabase(storeId);
  reportLoadingProgress("store-data");
  const [
    categoryRows,
    productRows,
    customerRows,
    transactionRows,
    transactionLineRows,
    tenderRows,
    giftCardRows,
    giftCardEventRows,
    registerRows,
    shiftRows,
    stockMovementRows,
    purchaseOrderRows,
    purchaseOrderLineRows,
    voidRows,
    auditRows,
    dailyReportRows,
    dailyReportTransactionRows,
    membershipRows,
    storeResult,
    webshopResult,
  ] = await Promise.all([
    fetchAll<Row<"categories">>((from, to) =>
      supabase
        .from("categories")
        .select("*")
        .eq("store_id", storeId)
        .order("sort_order", { ascending: true, nullsFirst: false })
        .range(from, to),
    ),
    fetchAll<Row<"products">>((from, to) =>
      supabase
        .from("products")
        .select("*")
        .eq("store_id", storeId)
        .order("name")
        .range(from, to),
    ),
    fetchAll<Row<"customers">>((from, to) =>
      supabase
        .from("customers")
        .select("*")
        .eq("store_id", storeId)
        .order("created_at")
        .range(from, to),
    ),
    fetchAll<Row<"transactions">>((from, to) =>
      supabase
        .from("transactions")
        .select("*")
        .eq("store_id", storeId)
        .order("occurred_at")
        .range(from, to),
    ),
    fetchAll<Row<"transaction_lines">>((from, to) =>
      supabase
        .from("transaction_lines")
        .select("*")
        .eq("store_id", storeId)
        .order("created_at")
        .range(from, to),
    ),
    fetchAll<Row<"transaction_tenders">>((from, to) =>
      supabase
        .from("transaction_tenders")
        .select("*")
        .eq("store_id", storeId)
        .order("created_at")
        .range(from, to),
    ),
    fetchAll<Row<"gift_cards">>((from, to) =>
      supabase
        .from("gift_cards")
        .select("*")
        .eq("store_id", storeId)
        .order("issued_at")
        .range(from, to),
    ),
    fetchAll<Row<"gift_card_events">>((from, to) =>
      supabase
        .from("gift_card_events")
        .select("*")
        .eq("store_id", storeId)
        .order("occurred_at")
        .range(from, to),
    ),
    fetchAll<Row<"registers">>((from, to) =>
      supabase
        .from("registers")
        .select("*")
        .eq("store_id", storeId)
        .order("created_at")
        .range(from, to),
    ),
    fetchAll<Row<"register_shifts">>((from, to) =>
      supabase
        .from("register_shifts")
        .select("*")
        .eq("store_id", storeId)
        .order("opened_at")
        .range(from, to),
    ),
    fetchAll<Row<"stock_movements">>((from, to) =>
      supabase
        .from("stock_movements")
        .select("*")
        .eq("store_id", storeId)
        .order("occurred_at")
        .range(from, to),
    ),
    fetchAll<Row<"purchase_orders">>((from, to) =>
      supabase
        .from("purchase_orders")
        .select("*")
        .eq("store_id", storeId)
        .order("created_at")
        .range(from, to),
    ),
    fetchAll<Row<"purchase_order_lines">>((from, to) =>
      supabase
        .from("purchase_order_lines")
        .select("*")
        .eq("store_id", storeId)
        .order("created_at")
        .range(from, to),
    ),
    fetchAll<Row<"void_entries">>((from, to) =>
      supabase
        .from("void_entries")
        .select("*")
        .eq("store_id", storeId)
        .order("occurred_at")
        .range(from, to),
    ),
    fetchAll<Row<"audit_entries">>((from, to) =>
      supabase
        .from("audit_entries")
        .select("*")
        .eq("store_id", storeId)
        .order("occurred_at")
        .range(from, to),
    ),
    fetchAll<Row<"daily_reports">>((from, to) =>
      supabase
        .from("daily_reports")
        .select("*")
        .eq("store_id", storeId)
        .order("report_number")
        .range(from, to),
    ),
    fetchAll<Row<"daily_report_transactions">>((from, to) =>
      supabase
        .from("daily_report_transactions")
        .select("*")
        .eq("store_id", storeId)
        .range(from, to),
    ),
    fetchAll<any>((from, to) =>
      supabase
        .from("store_memberships")
        .select("role, user_id")
        .eq("store_id", storeId)
        .eq("status", "active")
        .range(from, to),
    ),
    supabase.from("stores").select("*").eq("id", storeId).single(),
    supabase
      .from("webshop_settings")
      .select("settings")
      .eq("store_id", storeId)
      .maybeSingle(),
  ]);

  if (storeResult.error) throw storeResult.error;
  if (webshopResult.error) throw webshopResult.error;

  const userIds = membershipRows.map((r) => r.user_id);
  let profileMap = new Map();
  if (userIds.length > 0) {
    const { data: profileRows, error: profileError } = await supabase
      .from("profiles")
      .select("id, display_name, first_name, last_name, phone")
      .in("id", userIds);
      
    if (profileError) throw profileError;
    profileMap = new Map(profileRows?.map((p) => [p.id, p]));
  }

  const users = membershipRows.map((row) => {
    const p = profileMap.get(row.user_id);
    return {
      id: row.user_id,
      name: p?.display_name || "Gebruiker",
      firstName: p?.first_name || undefined,
      lastName: p?.last_name || undefined,
      role: row.role as any,
      // Store memberships are Auth identities, not POS-PIN records. PIN
      // verification is intentionally not hydrated into the browser cache.
      pinHash: "",
      createdAt: new Date().toISOString(),
    };
  });

  const categories: ProductCategory[] = categoryRows.map((row) => ({
    id: row.external_id ?? row.id,
    name: row.name,
    vatRate: Number(row.vat_rate),
    sortOrder: row.sort_order ?? undefined,
    isActive: row.is_active,
  }));

  const products: Product[] = productRows.map((row) => {
    const id = row.external_id ?? row.id;
    const previous = previousProductById.get(id);
    return {
    id,
    name: row.name,
    category: row.category_name,
    subCategory: row.subcategory ?? undefined,
    sku: row.sku ?? undefined,
    barcode: row.barcode ?? undefined,
    priceCents: Number(row.price_cents),
    costPriceCents:
      row.cost_price_cents == null ? undefined : Number(row.cost_price_cents),
    vatRate: Number(row.vat_rate),
    brand: row.brand ?? undefined,
    supplier: row.supplier ?? undefined,
    supplierCode: row.supplier_code === undefined ? previous?.supplierCode : row.supplier_code ?? undefined,
    variant: row.variant ?? undefined,
    priceTiers: row.price_tiers === undefined
      ? previous?.priceTiers
      : jsonObject<Record<string, number>>(row.price_tiers),
    customFields: row.custom_fields === undefined
      ? previous?.customFields
      : jsonObject<Product["customFields"]>(row.custom_fields),
    stockQty: row.stock_qty ?? undefined,
    minStockQty: row.min_stock_qty ?? undefined,
    color: row.color ?? undefined,
    productType: row.product_type as Product["productType"],
    isActive: row.is_active,
  }});

  const customerExternalId = new Map(
    customerRows.map((row) => [row.id, row.external_id ?? row.id]),
  );
  const customers: Customer[] = customerRows.map((row) => {
    const id = row.external_id ?? row.id;
    return {
    id,
    name: row.name,
    email: row.email ?? undefined,
    phone: row.phone ?? undefined,
    address: row.address ?? undefined,
    notes: row.notes ?? undefined,
    priceGroup: row.price_group === undefined
      ? previousCustomerById.get(id)?.priceGroup
      : row.price_group ?? undefined,
    totalSpentCents: Number(row.total_spent_cents),
    visitCount: row.visit_count,
    lastVisitAt: row.last_visit_at ?? undefined,
    createdAt: row.created_at,
    isActive: row.is_active,
  }});

  const productExternalId = new Map(
    productRows.map((row) => [row.id, row.external_id ?? row.id]),
  );
  const registerExternalId = new Map(
    registerRows.map((row) => [row.id, row.external_id ?? row.id]),
  );
  const shiftLocalId = new Map(
    shiftRows.map((row, index) => [row.id, index + 1]),
  );
  const shifts: RegisterShift[] = shiftRows.map((row, index) => ({
    id: index + 1,
    shiftNumber: Number(row.shift_number),
    registerId: registerExternalId.get(row.register_id) ?? row.register_id,
    openedAt: Date.parse(row.opened_at),
    openedByUserId: row.opened_by_user_id ?? undefined,
    openedByUserName: row.opened_by_user_name ?? undefined,
    openingFloatCents: Number(row.opening_float_cents),
    closedAt: row.closed_at ? Date.parse(row.closed_at) : undefined,
    closedByUserId: row.closed_by_user_id ?? undefined,
    closedByUserName: row.closed_by_user_name ?? undefined,
    countedCashCents:
      row.counted_cash_cents == null
        ? undefined
        : Number(row.counted_cash_cents),
    expectedCashCents:
      row.expected_cash_cents == null
        ? undefined
        : Number(row.expected_cash_cents),
    cashDifferenceCents:
      row.cash_difference_cents == null
        ? undefined
        : Number(row.cash_difference_cents),
    cashDifferenceReason: row.cash_difference_reason ?? undefined,
    status: row.status as RegisterShift["status"],
  }));

  const linesByTransaction = new Map<string, Row<"transaction_lines">[]>();
  for (const line of transactionLineRows) {
    const list = linesByTransaction.get(line.transaction_id) ?? [];
    list.push(line);
    linesByTransaction.set(line.transaction_id, list);
  }
  const tendersByTransaction = new Map<
    string,
    Row<"transaction_tenders">[]
  >();
  for (const tender of tenderRows) {
    const list = tendersByTransaction.get(tender.transaction_id) ?? [];
    list.push(tender);
    tendersByTransaction.set(tender.transaction_id, list);
  }

  const transactionLocalId = new Map(
    transactionRows.map((row, index) => [row.id, index + 1]),
  );
  const transactions: Transaction[] = transactionRows.map((row, index) => ({
    id: index + 1,
    clientRequestId: row.client_request_id,
    tableId: row.table_id,
    items: (linesByTransaction.get(row.id) ?? []).map((line) => {
      const productSnapshot = jsonObject<Product>(line.product_snapshot);
      return {
        lineId: line.line_external_id,
        product: {
          ...productSnapshot,
          id: line.product_external_id ?? productSnapshot.id ?? line.product_id ?? line.id,
          name: line.product_name,
          priceCents: Number(line.unit_price_cents),
          costPriceCents:
            line.unit_cost_cents == null
              ? undefined
              : Number(line.unit_cost_cents),
          vatRate: Number(line.vat_rate),
        },
        quantity: line.quantity,
        notes: line.notes ?? undefined,
        modifiers: jsonArray(line.modifiers),
      };
    }),
    subtotalCents: Number(row.subtotal_cents),
    vat12Cents: Number(row.vat_12_cents),
    vat21Cents: Number(row.vat_21_cents),
    totalCents: Number(row.total_cents),
    discountCents: Number(row.discount_cents),
    discountReason: row.discount_reason ?? undefined,
    discountApprovedByUserId: row.discount_approved_by_user_id ?? undefined,
    tipCents: Number(row.tip_cents),
    tenderedCents:
      row.tendered_cents == null ? undefined : Number(row.tendered_cents),
    paymentMethod: row.payment_method as Transaction["paymentMethod"],
    tenders: (tendersByTransaction.get(row.id) ?? []).map((tender) => ({
      method: tender.method as "Cash" | "PIN" | "Cadeaubon",
      amountCents: Number(tender.amount_cents),
    })),
    timestamp: Date.parse(row.occurred_at),
    isFinalized: row.is_finalized ? 1 : 0,
    userId: row.user_id ?? undefined,
    userName: row.user_name ?? undefined,
    customerId: row.customer_id
      ? customerExternalId.get(row.customer_id)
      : undefined,
    source: row.source as Transaction["source"],
    kind: row.kind as Transaction["kind"],
    originalTransactionId: row.original_transaction_id
      ? transactionLocalId.get(row.original_transaction_id)
      : undefined,
    correctionReason: row.correction_reason ?? undefined,
    documentNumber: row.document_number,
    merchantSnapshot: jsonObject(row.merchant_snapshot),
    registerId: row.register_id
      ? registerExternalId.get(row.register_id) ?? row.register_id
      : undefined,
    shiftId: row.shift_id ? shiftLocalId.get(row.shift_id) : undefined,
  }));

  const purchaseLinesByOrder = new Map<
    string,
    Row<"purchase_order_lines">[]
  >();
  for (const line of purchaseOrderLineRows) {
    const list = purchaseLinesByOrder.get(line.purchase_order_id) ?? [];
    list.push(line);
    purchaseLinesByOrder.set(line.purchase_order_id, list);
  }
  const purchaseOrderExternalId = new Map(
    purchaseOrderRows.map((row) => [row.id, row.external_id ?? row.id]),
  );
  const purchaseOrders: PurchaseOrder[] = purchaseOrderRows.map((row) => ({
    id: row.external_id ?? row.id,
    supplier: row.supplier,
    status: row.status as PurchaseOrder["status"],
    source: "inventory-forecast",
    createdAt: Date.parse(row.created_at),
    updatedAt: Date.parse(row.updated_at),
    orderedAt: row.ordered_at ? Date.parse(row.ordered_at) : undefined,
    receivedAt: row.received_at ? Date.parse(row.received_at) : undefined,
    expectedDeliveryAt: row.expected_delivery_at
      ? Date.parse(row.expected_delivery_at)
      : undefined,
    reference: row.reference ?? undefined,
    note: row.note ?? undefined,
    ownerUserId: row.owner_user_id ?? undefined,
    ownerName: row.owner_name ?? undefined,
    items: (purchaseLinesByOrder.get(row.id) ?? []).map((line) => {
      const forecast = jsonObject<Record<string, Json>>(
        line.forecast_snapshot,
      );
      return {
        productId: line.product_id
          ? productExternalId.get(line.product_id) ?? line.product_id
          : line.product_external_id ?? "deleted-product",
        productName: line.product_name,
        sku: line.sku ?? undefined,
        orderedQty: line.ordered_qty,
        receivedQty: line.received_qty,
        unitCostCents:
          line.unit_cost_cents == null
            ? undefined
            : Number(line.unit_cost_cents),
        currentStockQtyAtDraft: Number(
          forecast.currentStockQtyAtDraft ?? 0,
        ),
        minStockQtyAtDraft: Number(forecast.minStockQtyAtDraft ?? 0),
        estimatedStockoutAt:
          forecast.estimatedStockoutAt == null
            ? null
            : Number(forecast.estimatedStockoutAt),
        forecastConfidence: String(
          forecast.forecastConfidence ?? "low",
        ) as PurchaseOrder["items"][number]["forecastConfidence"],
        forecastTrend: String(
          forecast.forecastTrend ?? "unknown",
        ) as PurchaseOrder["items"][number]["forecastTrend"],
      };
    }),
  }));

  const stockMovements: StockMovement[] = stockMovementRows.map(
    (row, index) => ({
      id: index + 1,
      productId: productExternalId.get(row.product_id) ?? row.product_id,
      productName: row.product_name,
      quantityDelta: row.quantity_delta,
      reason: row.reason as StockMovement["reason"],
      timestamp: Date.parse(row.occurred_at),
      purchaseOrderId: row.purchase_order_id
        ? purchaseOrderExternalId.get(row.purchase_order_id) ??
          row.purchase_order_id
        : undefined,
      transactionId: row.transaction_id
        ? transactionLocalId.get(row.transaction_id)
        : undefined,
      userId: row.user_id ?? undefined,
      userName: row.user_name ?? undefined,
    }),
  );
  const voids: VoidEntry[] = voidRows.map((row, index) => ({
    id: index + 1,
    timestamp: Date.parse(row.occurred_at),
    tableId: row.table_id,
    productId: row.product_id
      ? productExternalId.get(row.product_id) ?? row.product_id
      : "deleted-product",
    productName: row.product_name,
    quantity: row.quantity,
    amountCents: Number(row.amount_cents),
    reason: row.reason,
    byUserId: row.by_user_id,
    byUserName: row.by_user_name,
  }));
  const audits: AuditEntry[] = auditRows.map((row, index) => ({
    id: index + 1,
    timestamp: Date.parse(row.occurred_at),
    userId: row.user_id,
    userName: row.user_name,
    action: row.action as AuditEntry["action"],
    detail: row.detail ?? undefined,
  }));

  const transactionsByReport = new Map<string, string[]>();
  for (const link of dailyReportTransactionRows) {
    const list = transactionsByReport.get(link.daily_report_id) ?? [];
    list.push(link.transaction_id);
    transactionsByReport.set(link.daily_report_id, list);
  }
  const dailyReportLocalId = new Map(
    dailyReportRows.map((row, index) => [row.id, index + 1]),
  );
  const dailyReports: DailyReport[] = dailyReportRows.map((row, index) => {
    const totals = jsonObject<Partial<DailyReport>>(row.totals);
    return {
      ...totals,
      id: index + 1,
      serverId: row.id,
      reportNumber: Number(row.report_number),
      timestamp: Date.parse(row.occurred_at),
      totalRevenueCents: Number(totals.totalRevenueCents ?? 0),
      totalCostCents: Number(totals.totalCostCents ?? 0),
      grossProfitCents: Number(totals.grossProfitCents ?? 0),
      totalVat12Cents: Number(totals.totalVat12Cents ?? 0),
      totalVat21Cents: Number(totals.totalVat21Cents ?? 0),
      totalExclVat12Cents: Number(totals.totalExclVat12Cents ?? 0),
      totalExclVat21Cents: Number(totals.totalExclVat21Cents ?? 0),
      totalDiscountCents: Number(totals.totalDiscountCents ?? 0),
      paymentTotalsCents: totals.paymentTotalsCents ?? {
        Cash: 0,
        PIN: 0,
        Cadeaubon: 0,
      },
      transactionIds: (transactionsByReport.get(row.id) ?? [])
        .map((id) => transactionLocalId.get(id))
        .filter((id): id is number => id != null),
      hash: row.hash,
      prevHash: row.previous_hash,
      closedByUserId: row.closed_by_user_id ?? undefined,
      closedByUserName: row.closed_by_user_name ?? undefined,
      registerId: row.register_id
        ? registerExternalId.get(row.register_id) ?? row.register_id
        : undefined,
      shiftId: row.shift_id ? shiftLocalId.get(row.shift_id) : undefined,
      openingFloatCents:
        row.opening_float_cents == null
          ? undefined
          : Number(row.opening_float_cents),
      countedCashCents:
        row.counted_cash_cents == null
          ? undefined
          : Number(row.counted_cash_cents),
      expectedCashCents:
        row.expected_cash_cents == null
          ? undefined
          : Number(row.expected_cash_cents),
      cashDifferenceCents:
        row.cash_difference_cents == null
          ? undefined
          : Number(row.cash_difference_cents),
      cashDifferenceReason: row.cash_difference_reason ?? undefined,
      hashPayloadVersion: row.hash_payload_version,
    };
  });

  const giftCardExternalId = new Map(
    giftCardRows.map((row) => [row.id, row.external_id ?? row.id]),
  );
  const giftCards: GiftCard[] = giftCardRows.map((row) => ({
    id: row.external_id ?? row.id,
    customerId: row.customer_id
      ? customerExternalId.get(row.customer_id)
      : undefined,
    code: row.code,
    initialCents: Number(row.initial_cents),
    balanceCents: Number(row.balance_cents),
    issuedAt: row.issued_at,
    expiresAt: row.expires_at ?? undefined,
    isActive: row.is_active,
  }));
  const giftCardEvents: GiftCardEvent[] = giftCardEventRows.map((row) => ({
    id: row.external_id ?? row.id,
    giftCardId: giftCardExternalId.get(row.gift_card_id) ?? row.gift_card_id,
    giftCardCode: row.gift_card_code,
    type: row.event_type as GiftCardEvent["type"],
    amountCents: Number(row.amount_cents),
    balanceBeforeCents: Number(row.balance_before_cents),
    balanceAfterCents: Number(row.balance_after_cents),
    timestamp: Date.parse(row.occurred_at),
    clientRequestId: row.client_request_id ?? undefined,
    customerId: row.customer_id
      ? customerExternalId.get(row.customer_id)
      : undefined,
    userId: row.user_id ?? undefined,
    userName: row.user_name ?? undefined,
    source: row.source as GiftCardEvent["source"],
    note: row.note ?? undefined,
    paymentTenders: jsonArray(row.payment_tenders),
    dailyReportId: row.daily_report_id
      ? dailyReportLocalId.get(row.daily_report_id)
      : undefined,
  }));

  reportLoadingProgress("local-cache");
  const authoritativeTables = [
    db.users,
    db.categories,
    db.products,
    db.customers,
    db.transactions,
    db.gift_cards,
    db.gift_card_events,
    db.shifts,
    db.stock_movements,
    db.purchase_orders,
    db.voids,
    db.audit,
    db.daily_reports,
  ];
  await db.transaction("rw", authoritativeTables, async () => {
    // Integration mapping history and service orders have their own sync
    // boundary. Never erase them merely because the POS cache is refreshed.
    for (const table of authoritativeTables) await table.clear();
    if (users.length) await db.users.bulkPut(users);
    if (categories.length) await db.categories.bulkPut(categories);
    if (products.length) await db.products.bulkPut(products);
    if (customers.length) await db.customers.bulkPut(customers);
    if (transactions.length) await db.transactions.bulkPut(transactions);
    if (giftCards.length) await db.gift_cards.bulkPut(giftCards);
    if (giftCardEvents.length)
      await db.gift_card_events.bulkPut(giftCardEvents);
    if (shifts.length) await db.shifts.bulkPut(shifts);
    if (stockMovements.length)
      await db.stock_movements.bulkPut(stockMovements);
    if (purchaseOrders.length)
      await db.purchase_orders.bulkPut(purchaseOrders);
    if (voids.length) await db.voids.bulkPut(voids);
    if (audits.length) await db.audit.bulkPut(audits);
    if (dailyReports.length)
      await db.daily_reports.bulkPut(dailyReports);
  });

  const store = storeResult.data;
  const storeConfiguration = normalizeStoreConfiguration(
    store.onboarding_config,
  );
  const shouldOpenRecommendedStart =
    Boolean(storeConfiguration.completedAt) &&
    !storeConfiguration.firstRunCompleted;
  useStoreConfiguration
    .getState()
    .applyRemote(storeConfiguration, storeId);
  useMerchantProfile.setState({
    profile: {
      ...blankMerchant(store.name),
      legalName: store.legal_name ?? store.name,
      addressLine1: store.address_line_1 ?? "",
      addressLine2: store.address_line_2 ?? "",
      vatNumber: store.vat_number ?? "",
      phone: store.phone ?? "",
      email: store.email ?? "",
      website: store.website ?? "",
      footer: store.receipt_footer ?? "",
      returnPolicy: store.return_policy ?? "",
    },
  });

  if (webshopResult.data?.settings) {
    const remoteSettings = jsonObject<Record<string, Json>>(
      webshopResult.data.settings,
    );
    const { activePlan: _legacyPlan, ...safeSettings } = remoteSettings;
    void _legacyPlan;
    useWebshopStore.setState(
      safeSettings as Partial<ReturnType<typeof useWebshopStore.getState>>,
      false,
    );
  } else {
    useWebshopStore.setState(EMPTY_WEBSHOP_SETTINGS, false);
  }

  const [
    { useProducts },
    { useCustomers },
    { useStore },
    { useIntegrations },
  ] = await Promise.all([
    import("../store/useProducts"),
    import("../store/useCustomers"),
    import("../store/useStore"),
    import("../store/useIntegrations"),
  ]);
  const pos = useStore.getState();
  pos.clearCart();
  pos.resetCartExtras();
  pos.unlinkCustomer();
  if (shouldOpenRecommendedStart) {
    pos.setMainView(recommendedStartView(storeConfiguration));
    void useStoreConfiguration
      .getState()
      .markFirstRunCompleted(storeId);
  }
  useIntegrations.setState({
    integrations: [],
    webhooks: [],
    apiKeys: [],
    logs: [],
  });
  try {
    localStorage.removeItem("pwayment_insight_workflow_v3");
    localStorage.removeItem("pwayment_insight_workflow_v2");
    localStorage.removeItem("pwayment_storefront_cart_v2");
  } catch {
    // Tenant database isolation remains effective without localStorage access.
  }
  await Promise.all([
    useProducts.getState().refresh(),
    useCustomers.getState().hydrate(true),
  ]);
};
