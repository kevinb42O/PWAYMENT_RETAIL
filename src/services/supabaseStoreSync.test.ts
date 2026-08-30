import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";

const storeId = "00000000-0000-0000-0000-000000000001";
const now = "2026-08-14T12:00:00.000Z";

const loadSync = async () => {
  vi.resetModules();
  vi.stubEnv("VITE_E2E_BUILD", "true");
  const [database, client, sync] = await Promise.all([
    import("../db/db"),
    import("../lib/supabase"),
    import("./supabaseStoreSync"),
  ]);
  return { database, ...client, ...sync };
};

describe("Supabase store bootstrap", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("hydrates a tenant cache from related server rows without retaining stale local data", async () => {
    const loaded = await loadSync();
    const { database, supabase, syncStoreFromSupabase } = loaded;
    // Seed the same tenant cache that a real refresh reads. A checkout can
    // exist locally for a few seconds before its idempotent server RPC is
    // acknowledged; bootstrap must retain that financial fact.
    const tenantDb = database.activateTenantDatabase(storeId);
    if (!tenantDb.isOpen()) await tenantDb.open();
    await tenantDb.products.put({
      id: "product-1",
      name: "Oude naam",
      category: "decks",
      priceCents: 100,
      vatRate: 21,
      stockQty: 3,
      supplierCode: "OLD-SKU",
      priceTiers: { vip: 90 },
    });
    await tenantDb.transactions.put({
      id: 50,
      clientRequestId: "pending-sale",
      tableId: 1,
      items: [{
        lineId: "pending-line",
        product: {
          id: "product-1",
          name: "Nieuwe deck",
          category: "decks",
          priceCents: 6500,
          vatRate: 21,
          stockQty: 3,
        },
        quantity: 1,
      }],
      subtotalCents: 6500,
      vat12Cents: 0,
      vat21Cents: 1128,
      totalCents: 6500,
      discountCents: 0,
      paymentMethod: "PIN",
      timestamp: Date.parse(now) + 1,
      isFinalized: 0,
      source: "live",
      kind: "sale",
    });
    await tenantDb.stock_movements.put({
      id: 50,
      productId: "product-1",
      productName: "Nieuwe deck",
      quantityDelta: -1,
      reason: "pos-sale",
      timestamp: Date.parse(now) + 1,
      transactionId: 50,
      clientRequestId: "pending-sale",
    });
    await tenantDb.outbox.add({
      timestamp: Date.parse(now) + 1,
      kind: "transaction",
      payload: {
        id: 50,
        clientRequestId: "pending-sale",
      },
      attempts: 0,
    });
    await tenantDb.products.put({
      id: "pending-product",
      name: "Lokale hoodie",
      category: "hardware-local-leaf",
      subCategory: "Lokale leaf",
      priceCents: 4500,
      vatRate: 21,
      stockQty: 7,
      familyId: "00000000-0000-4000-8000-000000000099",
      variantOptions: { Maat: "M" },
    });
    await tenantDb.outbox.add({
      timestamp: Date.parse(now) + 2,
      kind: "upsert_catalog_batch",
      payload: {
        requestId: "pending-catalog",
        products: [{ id: "pending-product" }],
        existingProductExternalIds: [],
      },
      attempts: 0,
    });
    await tenantDb.categories.put({
      id: "hardware-local-leaf",
      parentId: "hardware",
      name: "Lokale leaf",
      vatRate: 21,
      isActive: true,
    });
    await tenantDb.outbox.add({
      timestamp: Date.parse(now) + 3,
      kind: "upsert_category",
      payload: [{
        id: "hardware-local-leaf",
        parentId: "hardware",
        name: "Lokale leaf",
        vatRate: 21,
        isActive: true,
      }],
      attempts: 0,
    });

    const rows: Record<string, any[]> = {
      categories: [
        { id: "category-root-db", external_id: "hardware", name: "Hardware", parent_id: null, vat_rate: 21, sort_order: 1, is_active: true },
        { id: "category-db", external_id: "decks", name: "Decks", parent_id: "category-root-db", vat_rate: 21, sort_order: 2, is_active: true },
      ],
      products: [{ id: "product-db", external_id: "product-1", name: "Nieuwe deck", category_id: "category-db", category_name: "Decks", subcategory: null, sku: "DECK-1", barcode: "123", price_cents: 6500, cost_price_cents: 2500, vat_rate: 21, brand: "Pwayment", supplier: null, variant: null, stock_qty: 4, min_stock_qty: 1, color: null, product_type: "merchandise", is_active: true }],
      product_families: [{ id: "family-db", external_id: "family-1", name: "Nieuwe deck", brand: "Pwayment", category_id: "category-db", description: null, is_active: true, created_at: now, updated_at: now }],
      product_family_variants: [{ store_id: storeId, product_id: "product-db", family_id: "family-db", display_name: "8.25 inch", display_order: 0, option_signature: "size:value", created_at: now, updated_at: now }],
      product_family_option_definitions: [{ id: "option-definition-db", store_id: storeId, family_id: "family-db", name: "Maat", normalized_name: "maat", display_order: 0, is_active: true, created_at: now, updated_at: now }],
      product_family_option_values: [{ id: "option-value-db", store_id: storeId, family_id: "family-db", definition_id: "option-definition-db", value: "8.25", normalized_value: "8.25", display_order: 0, is_active: true, created_at: now, updated_at: now }],
      product_variant_option_values: [{ store_id: storeId, product_id: "product-db", family_id: "family-db", definition_id: "option-definition-db", value_id: "option-value-db", created_at: now }],
      product_identifiers: [{ id: "identifier-db", store_id: storeId, product_id: "product-db", identifier_type: "ean", identifier_value: "5410000000011", normalized_value: "5410000000011", is_scannable: true, is_primary: true, is_active: true, created_at: now, updated_at: now }],
      customers: [{ id: "customer-db", external_id: "customer-1", name: "Ari Klant", email: "ari@example.test", phone: null, address: null, notes: null, total_spent_cents: 6500, visit_count: 1, last_visit_at: now, created_at: now, is_active: true }],
      transactions: [{ id: "transaction-db", client_request_id: "request-1", table_id: 1, subtotal_cents: 6500, vat_0_cents: 0, vat_6_cents: 60, vat_12_cents: 0, vat_21_cents: 944, vat_breakdown: [{ rate: 6, grossCents: 1060, exclCents: 1000, vatCents: 60 }, { rate: 21, grossCents: 5440, exclCents: 4496, vatCents: 944 }], total_cents: 6500, discount_cents: 0, discount_reason: null, discount_approved_by_user_id: null, tip_cents: 0, tendered_cents: null, payment_method: "PIN", occurred_at: now, is_finalized: false, user_id: "user-1", user_name: "Alex", customer_id: "customer-db", source: "live", kind: "sale", original_transaction_id: null, correction_reason: null, document_number: "2026-1", merchant_snapshot: { name: "Pwayment" }, register_id: "register-db", shift_id: "shift-db" }],
      transaction_lines: [{ id: "line-db", transaction_id: "transaction-db", line_external_id: "line-1", product_id: "product-db", product_external_id: "product-1", product_name: "Nieuwe deck", sku: "DECK-1", barcode: "123", quantity: 1, unit_price_cents: 6500, unit_cost_cents: 2500, vat_rate: 21, line_total_cents: 6500, notes: "Grip inbegrepen", modifiers: [], product_snapshot: { category: "decks", priceCents: 6500, vatRate: 21 }, created_at: now }],
      transaction_tenders: [{ id: "tender-db", transaction_id: "transaction-db", method: "PIN", amount_cents: 6500, created_at: now }],
      gift_cards: [{ id: "gift-db", external_id: "gift-1", customer_id: "customer-db", code: "PW-1", initial_cents: 5000, balance_cents: 3000, issued_at: now, expires_at: null, is_active: true }],
      gift_card_events: [{ id: "event-db", external_id: "event-1", gift_card_id: "gift-db", gift_card_code: "PW-1", event_type: "issue", amount_cents: 50000, balance_before_cents: 0, balance_after_cents: 50000, occurred_at: now, transaction_id: "transaction-db", client_request_id: "request-1", customer_id: "customer-db", user_id: "user-1", user_name: "Alex", source: "live", note: null, payment_tenders: [{ method: "PIN", amount_cents: 50000 }], daily_report_id: "report-db" }],
      registers: [{ id: "register-db", external_id: "register-1", name: "Kassa 1", is_active: true, created_at: now }],
      register_shifts: [{ id: "shift-db", register_id: "register-db", shift_number: 1, opened_at: now, opened_by_user_id: "user-1", opened_by_user_name: "Alex", opening_float_cents: 1000, closed_at: null, closed_by_user_id: null, closed_by_user_name: null, counted_cash_cents: null, expected_cash_cents: null, cash_difference_cents: null, cash_difference_reason: null, status: "open" }],
      stock_movements: [{ id: "movement-db", product_id: "product-db", product_name: "Nieuwe deck", quantity_delta: -1, reason: "pos-sale", occurred_at: now, purchase_order_id: null, transaction_id: "transaction-db", user_id: "user-1", user_name: "Alex" }],
      purchase_orders: [{ id: "purchase-db", external_id: "purchase-1", supplier: "Leverancier", status: "draft", created_at: now, updated_at: now, ordered_at: null, received_at: null, expected_delivery_at: null, reference: null, note: null, owner_user_id: null, owner_name: null }],
      purchase_order_lines: [{ id: "purchase-line-db", purchase_order_id: "purchase-db", product_id: "product-db", product_external_id: "product-1", product_name: "Nieuwe deck", sku: "DECK-1", ordered_qty: 3, received_qty: 0, unit_cost_cents: 2500, forecast_snapshot: { currentStockQtyAtDraft: 4, minStockQtyAtDraft: 1, forecastConfidence: "high", forecastTrend: "up" }, created_at: now }],
      void_entries: [{ id: "void-db", occurred_at: now, table_id: 1, product_id: "product-db", product_name: "Nieuwe deck", quantity: 1, amount_cents: 6500, reason: "Invoerfout", by_user_id: "user-1", by_user_name: "Alex" }],
      audit_entries: [{ id: "audit-db", occurred_at: now, user_id: "user-1", user_name: "Alex", action: "login", detail: { source: "test" } }],
      daily_reports: [{ id: "report-db", report_number: 1, occurred_at: now, totals: { totalRevenueCents: 6500, paymentTotalsCents: { Cash: 0, PIN: 6500, Cadeaubon: 0 }, totalVatBreakdown: [{ rate: 6, grossCents: 1060, exclCents: 1000, vatCents: 60 }, { rate: 21, grossCents: 5440, exclCents: 4496, vatCents: 944 }], serverHashPayload: "canonical-v4-payload" }, hash: "hash-1", previous_hash: null, closed_by_user_id: "user-1", closed_by_user_name: "Alex", register_id: "register-db", shift_id: "shift-db", opening_float_cents: 1000, counted_cash_cents: 1000, expected_cash_cents: 1000, cash_difference_cents: 0, cash_difference_reason: null, hash_payload_version: 4 }],
      daily_report_transactions: [{ daily_report_id: "report-db", transaction_id: "transaction-db" }],
      store_memberships: [{ user_id: "user-1", role: "owner" }],
      store_capability_assessments: [{
        store_id: storeId,
        capability_code: "variant-matrix",
        state: "enabled",
        source: "platform",
        assessed_by_user_id: null,
        assessment_note: null,
        assessed_at: now,
        updated_at: now,
      }],
      profiles: [{ id: "user-1", display_name: "Alex Owner", first_name: "Alex", last_name: "Owner", phone: null }],
    };
    const result = (table: string) => ({ data: rows[table] ?? [], error: null });
    const query = (table: string): any => {
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        order: () => chain,
        in: () => Promise.resolve(result(table)),
        range: () => Promise.resolve(result(table)),
        single: () => Promise.resolve({ data: { id: storeId, name: "Testwinkel", legal_name: null, address_line_1: null, address_line_2: null, vat_number: null, phone: null, email: null, website: null, receipt_footer: null, return_policy: null, onboarding_config: null }, error: null }),
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
      };
      return chain;
    };
    vi.spyOn(supabase, "from").mockImplementation(((table: string) => query(table)) as never);

    await syncStoreFromSupabase(storeId);

    const activeDb = database.db;

    expect(await activeDb.products.get("product-1")).toMatchObject({
      name: "Nieuwe deck",
      category: "decks",
      supplierCode: "OLD-SKU",
      priceTiers: { vip: 90 },
      stockQty: 3,
      familyId: "family-db",
      variantOptions: { Maat: "8.25" },
      identifiers: [{ type: "ean", value: "5410000000011", isScannable: true, isPrimary: true }],
    });
    expect(await activeDb.products.get("pending-product")).toMatchObject({
      name: "Lokale hoodie",
      category: "hardware-local-leaf",
      stockQty: 7,
      familyId: "00000000-0000-4000-8000-000000000099",
      variantOptions: { Maat: "M" },
    });
    expect(await activeDb.categories.get("decks")).toMatchObject({
      parentId: "hardware",
    });
    expect(await activeDb.categories.get("hardware-local-leaf")).toMatchObject({
      parentId: "hardware",
      name: "Lokale leaf",
    });
    const [{ useCategories }, { useProducts }] = await Promise.all([
      import("../store/useCategories"),
      import("../store/useProducts"),
    ]);
    expect(useCategories.getState().list).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "hardware" }),
      expect.objectContaining({ id: "hardware-local-leaf", parentId: "hardware" }),
    ]));
    expect(useProducts.getState().list).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "pending-product", category: "hardware-local-leaf" }),
    ]));
    expect(await activeDb.customers.get("customer-1")).toMatchObject({ name: "Ari Klant" });
    expect(await activeDb.transactions.get(1)).toMatchObject({
      clientRequestId: "request-1",
      customerId: "customer-1",
      registerId: "register-1",
      tenders: [{ method: "PIN", amountCents: 6500 }],
      vatBreakdown: [
        { rate: 6, grossCents: 1060, exclCents: 1000, vatCents: 60 },
        { rate: 21, grossCents: 5440, exclCents: 4496, vatCents: 944 },
      ],
    });
    expect(await activeDb.transactions.get(50)).toMatchObject({
      clientRequestId: "pending-sale",
    });
    expect(
      (await activeDb.stock_movements.toArray()).some(
        (movement) => movement.clientRequestId === "pending-sale",
      ),
    ).toBe(true);
    expect(await activeDb.daily_reports.get(1)).toMatchObject({
      reportNumber: 1,
      transactionIds: [1],
      hashPayloadVersion: 4,
      serverHashPayload: "canonical-v4-payload",
      totalVatBreakdown: [
        { rate: 6, grossCents: 1060, exclCents: 1000, vatCents: 60 },
        { rate: 21, grossCents: 5440, exclCents: 4496, vatCents: 944 },
      ],
    });
    expect(await activeDb.gift_card_events.get("event-1")).toMatchObject({
      giftCardId: "gift-1",
      transactionId: 1,
      paymentTenders: [{ method: "PIN", amountCents: 50000 }],
      dailyReportId: 1,
    });
    expect((await activeDb.transactions.get(1))?.items[0].product).toMatchObject({
      productType: "gift-card",
    });
    const { useStoreConfiguration } = await import("../store/useStoreConfiguration");
    expect(useStoreConfiguration.getState().configuration.capabilities["variant-matrix"])
      .toBe("enabled");
  });
});
