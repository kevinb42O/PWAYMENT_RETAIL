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
    const { db } = database;
    if (!db.isOpen()) await db.open();
    await db.products.put({
      id: "product-1",
      name: "Oude naam",
      category: "decks",
      priceCents: 100,
      vatRate: 21,
      supplierCode: "OLD-SKU",
      priceTiers: { vip: 90 },
    });

    const rows: Record<string, any[]> = {
      categories: [{ id: "category-db", external_id: "decks", name: "Decks", vat_rate: 21, sort_order: 2, is_active: true }],
      products: [{ id: "product-db", external_id: "product-1", name: "Nieuwe deck", category_id: "category-db", category_name: "Decks", subcategory: null, sku: "DECK-1", barcode: "123", price_cents: 6500, cost_price_cents: 2500, vat_rate: 21, brand: "Pwayment", supplier: null, variant: null, stock_qty: 4, min_stock_qty: 1, color: null, product_type: "merchandise", is_active: true }],
      customers: [{ id: "customer-db", external_id: "customer-1", name: "Ari Klant", email: "ari@example.test", phone: null, address: null, notes: null, total_spent_cents: 6500, visit_count: 1, last_visit_at: now, created_at: now, is_active: true }],
      transactions: [{ id: "transaction-db", client_request_id: "request-1", table_id: 1, subtotal_cents: 6500, vat_12_cents: 0, vat_21_cents: 1128, total_cents: 6500, discount_cents: 0, discount_reason: null, discount_approved_by_user_id: null, tip_cents: 0, tendered_cents: null, payment_method: "PIN", occurred_at: now, is_finalized: false, user_id: "user-1", user_name: "Alex", customer_id: "customer-db", source: "live", kind: "sale", original_transaction_id: null, correction_reason: null, document_number: "2026-1", merchant_snapshot: { name: "Pwayment" }, register_id: "register-db", shift_id: "shift-db" }],
      transaction_lines: [{ id: "line-db", transaction_id: "transaction-db", line_external_id: "line-1", product_id: "product-db", product_external_id: "product-1", product_name: "Nieuwe deck", sku: "DECK-1", barcode: "123", quantity: 1, unit_price_cents: 6500, unit_cost_cents: 2500, vat_rate: 21, line_total_cents: 6500, notes: "Grip inbegrepen", modifiers: [], product_snapshot: { category: "decks", priceCents: 6500, vatRate: 21 }, created_at: now }],
      transaction_tenders: [{ id: "tender-db", transaction_id: "transaction-db", method: "PIN", amount_cents: 6500, created_at: now }],
      gift_cards: [{ id: "gift-db", external_id: "gift-1", customer_id: "customer-db", code: "PW-1", initial_cents: 5000, balance_cents: 3000, issued_at: now, expires_at: null, is_active: true }],
      gift_card_events: [{ id: "event-db", external_id: "event-1", gift_card_id: "gift-db", gift_card_code: "PW-1", event_type: "redeem", amount_cents: 2000, balance_before_cents: 5000, balance_after_cents: 3000, occurred_at: now, transaction_id: "transaction-db", client_request_id: "request-1", customer_id: "customer-db", user_id: "user-1", user_name: "Alex", source: "live", note: null, payment_tenders: [{ method: "PIN", amountCents: 2000 }], daily_report_id: "report-db" }],
      registers: [{ id: "register-db", external_id: "register-1", name: "Kassa 1", is_active: true, created_at: now }],
      register_shifts: [{ id: "shift-db", register_id: "register-db", shift_number: 1, opened_at: now, opened_by_user_id: "user-1", opened_by_user_name: "Alex", opening_float_cents: 1000, closed_at: null, closed_by_user_id: null, closed_by_user_name: null, counted_cash_cents: null, expected_cash_cents: null, cash_difference_cents: null, cash_difference_reason: null, status: "open" }],
      stock_movements: [{ id: "movement-db", product_id: "product-db", product_name: "Nieuwe deck", quantity_delta: -1, reason: "pos-sale", occurred_at: now, purchase_order_id: null, transaction_id: "transaction-db", user_id: "user-1", user_name: "Alex" }],
      purchase_orders: [{ id: "purchase-db", external_id: "purchase-1", supplier: "Leverancier", status: "draft", created_at: now, updated_at: now, ordered_at: null, received_at: null, expected_delivery_at: null, reference: null, note: null, owner_user_id: null, owner_name: null }],
      purchase_order_lines: [{ id: "purchase-line-db", purchase_order_id: "purchase-db", product_id: "product-db", product_external_id: "product-1", product_name: "Nieuwe deck", sku: "DECK-1", ordered_qty: 3, received_qty: 0, unit_cost_cents: 2500, forecast_snapshot: { currentStockQtyAtDraft: 4, minStockQtyAtDraft: 1, forecastConfidence: "high", forecastTrend: "up" }, created_at: now }],
      void_entries: [{ id: "void-db", occurred_at: now, table_id: 1, product_id: "product-db", product_name: "Nieuwe deck", quantity: 1, amount_cents: 6500, reason: "Invoerfout", by_user_id: "user-1", by_user_name: "Alex" }],
      audit_entries: [{ id: "audit-db", occurred_at: now, user_id: "user-1", user_name: "Alex", action: "login", detail: { source: "test" } }],
      daily_reports: [{ id: "report-db", report_number: 1, occurred_at: now, totals: { totalRevenueCents: 6500, paymentTotalsCents: { Cash: 0, PIN: 6500, Cadeaubon: 0 } }, hash: "hash-1", previous_hash: null, closed_by_user_id: "user-1", closed_by_user_name: "Alex", register_id: "register-db", shift_id: "shift-db", opening_float_cents: 1000, counted_cash_cents: 1000, expected_cash_cents: 1000, cash_difference_cents: 0, cash_difference_reason: null, hash_payload_version: 3 }],
      daily_report_transactions: [{ daily_report_id: "report-db", transaction_id: "transaction-db" }],
      store_memberships: [{ user_id: "user-1", role: "owner" }],
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
    });
    expect(await activeDb.customers.get("customer-1")).toMatchObject({ name: "Ari Klant" });
    expect(await activeDb.transactions.get(1)).toMatchObject({
      clientRequestId: "request-1",
      customerId: "customer-1",
      registerId: "register-1",
      tenders: [{ method: "PIN", amountCents: 6500 }],
    });
    expect(await activeDb.daily_reports.get(1)).toMatchObject({ reportNumber: 1, transactionIds: [1] });
    expect(await activeDb.gift_card_events.get("event-1")).toMatchObject({ giftCardId: "gift-1", dailyReportId: 1 });
  });
});
