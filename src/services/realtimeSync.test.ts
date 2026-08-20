import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../db/db";
import type { Database } from "../types/database.generated";
import { mapRealtimeProduct } from "./realtimeSync";

type ProductRow = Database["public"]["Tables"]["products"]["Row"];

const productRow = (overrides: Partial<ProductRow> = {}): ProductRow => ({
  id: "product-db-1",
  external_id: "deck-8-25",
  store_id: "store-1",
  category_id: "category-db-1",
  category_name: "Decks",
  name: "Deck 8.25",
  barcode: null,
  brand: null,
  color: null,
  cost_price_cents: 2500,
  created_at: "2026-08-20T12:00:00.000Z",
  custom_fields: {},
  is_active: true,
  is_demo: false,
  min_stock_qty: 1,
  price_cents: 5995,
  price_tiers: {},
  product_type: "merchandise",
  sku: "DECK-825",
  stock_qty: 5,
  subcategory: null,
  supplier: null,
  supplier_code: null,
  updated_at: "2026-08-20T12:00:00.000Z",
  variant: null,
  vat_rate: 21,
  ...overrides,
});

describe("Realtime product mapping", () => {
  beforeEach(async () => {
    if (!db.isOpen()) await db.open();
    await Promise.all([db.categories.clear(), db.products.clear()]);
  });

  it("retains the local external category id instead of writing category_name", async () => {
    await db.categories.put({
      id: "decks",
      serverId: "category-db-1",
      name: "Decks",
      vatRate: 21,
      isActive: true,
    });

    const product = await mapRealtimeProduct(productRow());

    expect(product.category).toBe("decks");
    expect(product.category).not.toBe("Decks");
  });

  it("repairs a pre-serverId cache by matching the category name", async () => {
    await db.categories.put({
      id: "decks",
      name: "Decks",
      vatRate: 21,
      isActive: true,
    });

    const product = await mapRealtimeProduct(productRow());

    expect(product.category).toBe("decks");
  });
});
