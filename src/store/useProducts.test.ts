import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../db/db";
import type { Product } from "../types";
import { useProducts } from "./useProducts";

const product = (overrides: Partial<Product> = {}): Product => ({
  id: "product-1",
  name: "Deck",
  category: "Decks",
  priceCents: 6500,
  vatRate: 21,
  stockQty: 4,
  ...overrides,
});

describe("product repository store", () => {
  beforeEach(async () => {
    if (!db.isOpen()) await db.open();
    await Promise.all([db.products.clear(), db.outbox.clear()]);
    useProducts.setState({ list: [], hydrated: false });
  });

  it("normalizes writes, scans keys and supports archive/restore", async () => {
    await useProducts.getState().upsert(product({
      name: "Deck Pro",
      sku: " DECK-1 ",
      barcode: " 12345 ",
      stockQty: 4.8,
      minStockQty: -2,
      costPriceCents: -10,
    }));
    expect(await db.products.get("product-1")).toMatchObject({
      sku: "DECK-1", barcode: "12345", stockQty: 4, minStockQty: 0, costPriceCents: 0,
    });
    expect(useProducts.getState().findByScanCode("12345")).toMatchObject({ matchedOn: "barcode" });
    expect(useProducts.getState().findByScanCode("DECK-1")).toMatchObject({ matchedOn: "sku" });

    await useProducts.getState().remove("product-1");
    expect((await db.products.get("product-1"))?.isActive).toBe(false);
    await useProducts.getState().restore("product-1");
    expect((await db.products.get("product-1"))?.isActive).toBe(true);
    await useProducts.getState().remove("unknown");
  });

  it("bulk writes atomically and keeps the list synchronized with persisted checkout changes", async () => {
    await useProducts.getState().bulkUpsert([
      product(),
      product({ id: "product-2", name: "Truck", vatRate: 12, stockQty: undefined }),
    ]);
    expect(await db.products.count()).toBe(2);
    useProducts.getState().syncPersisted([{ ...product(), stockQty: 1 }]);
    expect(useProducts.getState().list.find((item) => item.id === "product-1")?.stockQty).toBe(1);
    useProducts.getState().syncPersisted([]);
    await useProducts.getState().refresh();
    expect(useProducts.getState().hydrated).toBe(true);
  });

  it("hydrates the configured catalogue once and reads persisted rows on later starts", async () => {
    await useProducts.getState().hydrate();
    expect(useProducts.getState()).toMatchObject({ hydrated: true });
    expect(useProducts.getState().list.length).toBeGreaterThan(0);

    await db.products.clear();
    await db.products.put(product({ id: "persisted", name: "Persisted deck" }));
    useProducts.setState({ list: [], hydrated: false });
    await useProducts.getState().hydrate();
    expect(useProducts.getState().list).toEqual([
      expect.objectContaining({ id: "persisted", name: "Persisted deck" }),
    ]);
  });
});
