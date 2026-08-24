import type { PostgrestError } from "@supabase/supabase-js";
import { activateTenantDatabase, db } from "../db/db";
import {
  DEFAULT_CUSTOMER_INSIGHT_SETTINGS,
  DEFAULT_MERCHANT,
  DISABLED_COMMERCIAL_RETURN_POLICY,
  type CommercialReturnPolicy,
  type CustomerInsightSettings,
  type MerchantInfo,
  type PaceRecommendationMatchKind,
  type PaceRecommendationRule,
} from "../data/merchant";
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

const fetchAllSafe = async <T>(
  fetchPage: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: PostgrestError | null }>,
  fallback: T[] = [],
): Promise<T[]> => {
  try {
    return await fetchAll(fetchPage);
  } catch (err) {
    console.warn("Table sync skipped due to permissions or plan restrictions:", err);
    return fallback;
  }
};

const jsonArray = <T>(value: Json | null): T[] =>
  Array.isArray(value) ? (value as T[]) : [];

const jsonObject = <T>(value: Json | null): T => (value ?? {}) as T;

/** Accept only a complete, internally reconciling VAT snapshot from the API. */
const validVatBreakdown = (value: unknown): Transaction["vatBreakdown"] => {
  const rows = Array.isArray(value) ? value as Array<{
    rate?: unknown;
    grossCents?: unknown;
    exclCents?: unknown;
    vatCents?: unknown;
  }> : [];
  const allowed = new Set([0, 6, 12, 21]);
  const parsed = rows.flatMap((row) => {
    const rate = Number(row.rate);
    const grossCents = Number(row.grossCents);
    const exclCents = Number(row.exclCents);
    const vatCents = Number(row.vatCents);
    return allowed.has(rate)
      && [grossCents, exclCents, vatCents].every(Number.isSafeInteger)
      && grossCents === exclCents + vatCents
      ? [{ rate: rate as 0 | 6 | 12 | 21, grossCents, exclCents, vatCents }]
      : [];
  });
  const hasUniqueRates = new Set(parsed.map((line) => line.rate)).size === parsed.length;
  return parsed.length > 0 && parsed.length === rows.length && hasUniqueRates
    ? parsed
    : undefined;
};

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
  commercialReturnPolicy: { ...DISABLED_COMMERCIAL_RETURN_POLICY },
  customerInsightSettings: { ...DEFAULT_CUSTOMER_INSIGHT_SETTINGS },
  paceRecommendationRules: [],
  timezone: "Europe/Brussels",
});

const commercialReturnPolicy = (value: Json | null): CommercialReturnPolicy => {
  const candidate = jsonObject<Partial<CommercialReturnPolicy>>(value);
  return {
    ...DISABLED_COMMERCIAL_RETURN_POLICY,
    ...candidate,
    excludedProductTypes: Array.isArray(candidate.excludedProductTypes)
      ? candidate.excludedProductTypes.filter((item): item is "service" | "gift-card" => item === "service" || item === "gift-card")
      : [...DISABLED_COMMERCIAL_RETURN_POLICY.excludedProductTypes],
    excludedCategoryIds: Array.isArray(candidate.excludedCategoryIds)
      ? candidate.excludedCategoryIds.filter((item): item is string => typeof item === "string")
      : [],
  };
};

const customerInsightSettings = (value: Json | null): CustomerInsightSettings => ({
  ...DEFAULT_CUSTOMER_INSIGHT_SETTINGS,
  ...jsonObject<Partial<CustomerInsightSettings>>(value),
});

const paceRecommendationRules = (value: Json | null): PaceRecommendationRule[] => {
  if (!Array.isArray(value)) return [];
  const isMatchKind = (kind: unknown): kind is PaceRecommendationMatchKind => kind === "product" || kind === "brand" || kind === "category";
  return value.flatMap((entry) => {
    const rule = jsonObject<Record<string, Json>>(entry);
    const trigger = jsonObject<Record<string, Json>>(rule.trigger);
    const recommendation = jsonObject<Record<string, Json>>(rule.recommendation);
    if (
      typeof rule.id !== "string" || !rule.id.trim()
      || typeof rule.name !== "string" || !rule.name.trim()
      || typeof rule.enabled !== "boolean"
      || !isMatchKind(trigger.kind)
      || typeof trigger.value !== "string" || !trigger.value.trim()
      || !isMatchKind(recommendation.kind)
      || typeof recommendation.value !== "string" || !recommendation.value.trim()
      || typeof rule.reason !== "string" || !rule.reason.trim()
      || typeof rule.priority !== "number" || rule.priority < 1 || rule.priority > 100
    ) return [];
    return [{
      id: rule.id,
      name: rule.name,
      enabled: rule.enabled,
      trigger: { kind: trigger.kind, value: trigger.value },
      recommendation: { kind: recommendation.kind, value: recommendation.value },
      reason: rule.reason,
      priority: rule.priority,
      validFrom: typeof rule.validFrom === "string" ? rule.validFrom : undefined,
      validUntil: typeof rule.validUntil === "string" ? rule.validUntil : undefined,
      scope: "store" as const,
    }];
  });
};

/**
 * Replace the single-device Dexie cache with the active Supabase store.
 * Clearing before hydration prevents data from a previous Auth account from
 * appearing while a new tenant is loading on the same browser.
 */
export const syncStoreFromSupabase = async (storeId: string): Promise<void> => {
  // Select the tenant database before reading anything. On a browser refresh
  // the module starts on the neutral database; reading first would snapshot
  // the wrong tenant and make an incoming hydrate destructive by default.
  activateTenantDatabase(storeId);
  const [previousProducts, previousCustomers] = await Promise.all([
    db.products.toArray(),
    db.customers.toArray(),
  ]);
  const previousProductById = new Map(previousProducts.map((product) => [product.id, product]));
  const previousCustomerById = new Map(previousCustomers.map((customer) => [customer.id, customer]));
  const pendingOutbox = await db.outbox.toArray();
  // A checkout is committed locally first so the POS remains usable offline.
  // Never let a server snapshot erase a sale that is still in this tenant's
  // outbox: it has not failed, it simply has not received its receipt yet.
  const pendingTransactionRequestIds = new Set(
    pendingOutbox
      .filter((entry) => entry.kind === "transaction")
      .map((entry) => (entry.payload as Partial<Transaction>).clientRequestId)
      .filter((requestId): requestId is string => Boolean(requestId)),
  );
  const pendingTransactions = pendingTransactionRequestIds.size === 0
    ? []
    : (await db.transactions.toArray()).filter((transaction) =>
      pendingTransactionRequestIds.has(transaction.clientRequestId),
    );
  const pendingTransactionIds = new Set(
    pendingTransactions
      .map((transaction) => transaction.id)
      .filter((id): id is number => Number.isInteger(id)),
  );
  const pendingStockMovements = pendingTransactionIds.size === 0
    ? []
    : (await db.stock_movements.toArray()).filter((movement) =>
      movement.transactionId != null && pendingTransactionIds.has(movement.transactionId),
    );
  const pendingProductIds = new Set<string>();
  for (const entry of pendingOutbox) {
    if (entry.kind === "upsert_product") {
      for (const product of entry.payload as Product[]) pendingProductIds.add(product.id);
    }
    if (entry.kind === "upsert_catalog_batch") {
      const payload = entry.payload as { products?: Product[] };
      for (const product of payload.products ?? []) pendingProductIds.add(product.id);
    }
  }
  reportLoadingProgress("store-data");
  const [
    categoryRows,
    productRows,
    productFamilyRows,
    productFamilyVariantRows,
    optionDefinitionRows,
    optionValueRows,
    variantOptionRows,
    productIdentifierRows,
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
    capabilityAssessmentRows,
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
    // Catalog relations are a rolling-deployment addition. An older project
    // may not expose these tables yet; in that case legacy SKU/barcode POS
    // behaviour remains intact rather than failing the whole store hydration.
    fetchAllSafe<Row<"product_families">>((from, to) =>
      supabase
        .from("product_families")
        .select("*")
        .eq("store_id", storeId)
        .range(from, to),
    ),
    fetchAllSafe<Row<"product_family_variants">>((from, to) =>
      supabase
        .from("product_family_variants")
        .select("*")
        .eq("store_id", storeId)
        .range(from, to),
    ),
    fetchAllSafe<Row<"product_family_option_definitions">>((from, to) =>
      supabase
        .from("product_family_option_definitions")
        .select("*")
        .eq("store_id", storeId)
        .range(from, to),
    ),
    fetchAllSafe<Row<"product_family_option_values">>((from, to) =>
      supabase
        .from("product_family_option_values")
        .select("*")
        .eq("store_id", storeId)
        .range(from, to),
    ),
    fetchAllSafe<Row<"product_variant_option_values">>((from, to) =>
      supabase
        .from("product_variant_option_values")
        .select("*")
        .eq("store_id", storeId)
        .range(from, to),
    ),
    fetchAllSafe<Row<"product_identifiers">>((from, to) =>
      supabase
        .from("product_identifiers")
        .select("*")
        .eq("store_id", storeId)
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
    fetchAllSafe<Row<"audit_entries">>((from, to) =>
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
    fetchAllSafe<Row<"store_capability_assessments">>((from, to) =>
      supabase
        .from("store_capability_assessments")
        .select("*")
        .eq("store_id", storeId)
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

  // The local POS stores the stable external category ID on each product,
  // while the server also carries the human-readable category_name for SQL
  // reporting. Restoring the name here breaks category navigation after a
  // sync because `products.category` no longer matches `categories.id`.
  const categoryExternalIdByDatabaseId = new Map(
    categoryRows.map((row) => [row.id, row.external_id ?? row.id]),
  );
  const categories: ProductCategory[] = categoryRows.map((row) => ({
    id: row.external_id ?? row.id,
    serverId: row.id,
    parentId: row.parent_id
      ? categoryExternalIdByDatabaseId.get(row.parent_id)
      : undefined,
    name: row.name,
    vatRate: Number(row.vat_rate),
    sortOrder: row.sort_order ?? undefined,
    isActive: row.is_active,
  }));

  const familyVariantByProductId = new Map(
    productFamilyVariantRows.map((variant) => [variant.product_id, variant]),
  );
  const optionDefinitionById = new Map(
    optionDefinitionRows
      .filter((definition) => definition.is_active)
      .map((definition) => [definition.id, definition]),
  );
  const optionValueById = new Map(
    optionValueRows
      .filter((optionValue) => optionValue.is_active)
      .map((optionValue) => [optionValue.id, optionValue]),
  );
  const variantOptionsByProductId = new Map<string, Record<string, string>>();
  for (const assignment of variantOptionRows) {
    const definition = optionDefinitionById.get(assignment.definition_id);
    const optionValue = optionValueById.get(assignment.value_id);
    if (!definition || !optionValue || definition.family_id !== assignment.family_id || optionValue.family_id !== assignment.family_id) continue;
    const options = variantOptionsByProductId.get(assignment.product_id) ?? {};
    options[definition.name] = optionValue.value;
    variantOptionsByProductId.set(assignment.product_id, options);
  }
  const identifiersByProductId = new Map<string, Product["identifiers"]>();
  for (const identifier of productIdentifierRows) {
    if (!identifier.is_active) continue;
    const list = identifiersByProductId.get(identifier.product_id) ?? [];
    list.push({
      type: identifier.identifier_type as NonNullable<Product["identifiers"]>[number]["type"],
      value: identifier.identifier_value,
      isScannable: identifier.is_scannable,
      isPrimary: identifier.is_primary,
    });
    identifiersByProductId.set(identifier.product_id, list);
  }

  const products: Product[] = productRows.map((row) => {
    const id = row.external_id ?? row.id;
    const previous = previousProductById.get(id);
    const familyVariant = familyVariantByProductId.get(row.id);
    const variantOptions = variantOptionsByProductId.get(row.id);
    const identifiers = identifiersByProductId.get(row.id);
    return {
    id,
    name: row.name,
    category: row.category_id
      ? categoryExternalIdByDatabaseId.get(row.category_id) ?? row.category_name
      : row.category_name,
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
    variant: row.variant ?? familyVariant?.display_name ?? undefined,
    familyId: familyVariant?.family_id,
    variantOptions: variantOptions && Object.keys(variantOptions).length > 0 ? variantOptions : undefined,
    identifiers: identifiers?.length ? identifiers : previous?.identifiers,
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
    billingProfile: row.billing_profile && typeof row.billing_profile === "object"
      ? row.billing_profile as unknown as Customer["billingProfile"]
      : undefined,
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
    vatBreakdown: validVatBreakdown(row.vat_breakdown),
    vat12Cents: Number(row.vat_12_cents),
    vat21Cents: Number(row.vat_21_cents),
    totalCents: Number(row.total_cents),
    roundingAdjustmentCents: Number(row.rounding_adjustment_cents ?? 0),
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
    returnDisposition: row.return_disposition == null
      ? undefined
      : row.return_disposition as Transaction["returnDisposition"],
    documentNumber: row.document_number,
    receiptBarcode: row.receipt_barcode ?? undefined,
    receiptBarcodeVersion: row.receipt_barcode_version === 1 ? 1 : undefined,
    documentRequest: row.document_request && typeof row.document_request === "object"
      ? row.document_request as unknown as Transaction["documentRequest"]
      : undefined,
    invoiceNumber: row.invoice_number ?? undefined,
    invoiceIssuedAt: row.invoice_issued_at ? Date.parse(row.invoice_issued_at) : undefined,
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
      quantityBefore: row.quantity_before ?? undefined,
      quantityAfter: row.quantity_after ?? undefined,
      adjustmentReason: row.adjustment_reason == null
        ? undefined
        : row.adjustment_reason as StockMovement["adjustmentReason"],
      note: row.note ?? undefined,
      returnDisposition: row.return_disposition == null
        ? undefined
        : row.return_disposition as StockMovement["returnDisposition"],
      clientRequestId: row.client_request_id ?? undefined,
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

  const remoteRequestIds = new Set(transactions.map((transaction) => transaction.clientRequestId));
  const unsyncedTransactions = pendingTransactions.filter(
    (transaction) => !remoteRequestIds.has(transaction.clientRequestId),
  );
  const unsyncedTransactionIds = new Set(
    unsyncedTransactions
      .map((transaction) => transaction.id)
      .filter((id): id is number => Number.isInteger(id)),
  );
  const unsyncedStockMovements = pendingStockMovements.filter(
    (movement) => movement.transactionId != null && unsyncedTransactionIds.has(movement.transactionId),
  );

  // Project the locally committed stock movements on top of the remote
  // snapshot until checkout_sale confirms them. This is intentionally based
  // on the ledger, rather than recalculating from the cart, so sales, refunds
  // and their exact quantities use one source of truth.
  const pendingStockDelta = new Map<string, number>();
  for (const movement of unsyncedStockMovements) {
    pendingStockDelta.set(
      movement.productId,
      (pendingStockDelta.get(movement.productId) ?? 0) + movement.quantityDelta,
    );
  }
  let hydratedProducts = products.map((product) => {
    const delta = pendingStockDelta.get(product.id) ?? 0;
    return product.stockQty == null || delta === 0
      ? product
      : { ...product, stockQty: Math.max(0, product.stockQty + delta) };
  });
  const hydratedProductIds = new Set(hydratedProducts.map((product) => product.id));
  for (const productId of pendingStockDelta.keys()) {
    if (!hydratedProductIds.has(productId)) {
      const localProduct = previousProductById.get(productId);
      if (localProduct) hydratedProducts.push(localProduct);
    }
  }
  // Product creation/editing is offline-first too. While its outbox command is
  // unacknowledged, the local row is newer than the server snapshot (including
  // familyId/variantOptions that a default server family cannot represent yet).
  if (pendingProductIds.size > 0) {
    const serverRowsById = new Map(hydratedProducts.map((product) => [product.id, product]));
    for (const productId of pendingProductIds) {
      const localProduct = previousProductById.get(productId);
      if (localProduct) serverRowsById.set(productId, localProduct);
    }
    hydratedProducts = [...serverRowsById.values()];
  }

  // Keep the actual local receipt visible until the server returns the same
  // client request ID. Remote row IDs are re-numbered for Dexie, so allocate
  // only when an unusual cache collision is encountered.
  const hydratedTransactions = [...transactions];
  const usedTransactionIds = new Set(
    hydratedTransactions.map((transaction) => transaction.id).filter((id): id is number => Number.isInteger(id)),
  );
  let nextTransactionId = Math.max(0, ...usedTransactionIds) + 1;
  for (const transaction of unsyncedTransactions) {
    const id = transaction.id != null && !usedTransactionIds.has(transaction.id)
      ? transaction.id
      : nextTransactionId++;
    usedTransactionIds.add(id);
    hydratedTransactions.push({ ...transaction, id });
  }
  const hydratedStockMovements = [...stockMovements];
  const usedStockMovementIds = new Set(
    hydratedStockMovements.map((movement) => movement.id).filter((id): id is number => Number.isInteger(id)),
  );
  let nextStockMovementId = Math.max(0, ...usedStockMovementIds) + 1;
  for (const movement of unsyncedStockMovements) {
    const id = movement.id != null && !usedStockMovementIds.has(movement.id)
      ? movement.id
      : nextStockMovementId++;
    usedStockMovementIds.add(id);
    hydratedStockMovements.push({ ...movement, id });
  }
  const hydratedCustomers = customers.map((customer) => {
    if (!unsyncedTransactions.some((transaction) => transaction.customerId === customer.id)) return customer;
    // The local customer already contains the pending visit/value update and
    // was itself built from the last successful server snapshot.
    return previousCustomerById.get(customer.id) ?? customer;
  });

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
    const totalVatBreakdown = validVatBreakdown(totals.totalVatBreakdown);
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
      totalVatBreakdown,
      totalDiscountCents: Number(totals.totalDiscountCents ?? 0),
      totalCashRoundingAdjustmentCents: Number(
        totals.totalCashRoundingAdjustmentCents ?? 0,
      ),
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
    if (hydratedProducts.length) await db.products.bulkPut(hydratedProducts);
    if (hydratedCustomers.length) await db.customers.bulkPut(hydratedCustomers);
    if (hydratedTransactions.length)
      await db.transactions.bulkPut(hydratedTransactions);
    if (giftCards.length) await db.gift_cards.bulkPut(giftCards);
    if (giftCardEvents.length)
      await db.gift_card_events.bulkPut(giftCardEvents);
    if (shifts.length) await db.shifts.bulkPut(shifts);
    if (hydratedStockMovements.length)
      await db.stock_movements.bulkPut(hydratedStockMovements);
    if (purchaseOrders.length)
      await db.purchase_orders.bulkPut(purchaseOrders);
    if (voids.length) await db.voids.bulkPut(voids);
    if (audits.length) await db.audit.bulkPut(audits);
    if (dailyReports.length)
      await db.daily_reports.bulkPut(dailyReports);
  });

  const store = storeResult.data;
  const persistedStoreConfiguration = normalizeStoreConfiguration(
    store.onboarding_config,
  );
  // Platform-confirmed lifecycle states (`enabled` and `blocked`) are stored
  // relationally, so a stale browser payload can never present them as a
  // merchant-editable answer. Missing rows are intentionally left unknown for
  // stores that predate the retail-profile migration.
  const storeConfiguration = {
    ...persistedStoreConfiguration,
    capabilities: {
      ...persistedStoreConfiguration.capabilities,
      ...Object.fromEntries(
        capabilityAssessmentRows.map((assessment) => [
          assessment.capability_code,
          assessment.state,
        ]),
      ),
    },
  };
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
      commercialReturnPolicy: commercialReturnPolicy(store.commercial_return_policy),
      customerInsightSettings: customerInsightSettings(store.customer_insight_settings),
      paceRecommendationRules: paceRecommendationRules(store.pace_recommendation_rules),
      timezone: store.timezone || "Europe/Brussels",
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
