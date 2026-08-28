import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
    await Promise.all([db.products.clear(), db.outbox.clear(), db.stock_movements.clear(), db.audit.clear()]);
    vi.restoreAllMocks();
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
    expect(useProducts.getState().findByScanCode("DECK-1")).toMatchObject({ matchedOn: "identifier" });

    await useProducts.getState().remove("product-1");
    expect((await db.products.get("product-1"))?.isActive).toBe(false);
    await useProducts.getState().restore("product-1");
    expect((await db.products.get("product-1"))?.isActive).toBe(true);
    await useProducts.getState().remove("unknown");
  });

  it("bulk writes atomically and keeps the list synchronized with persisted checkout changes", async () => {
    await useProducts.getState().bulkUpsert([
      product({ stockQty: 0 }),
      product({ id: "product-2", name: "Truck", vatRate: 12, stockQty: undefined }),
    ]);
    expect(await db.products.count()).toBe(2);
    useProducts.getState().syncPersisted([{ ...product(), stockQty: 1 }]);
    expect(useProducts.getState().list.find((item) => item.id === "product-1")?.stockQty).toBe(1);
    useProducts.getState().syncPersisted([]);
    await useProducts.getState().refresh();
    expect(useProducts.getState().hydrated).toBe(true);
  });

  it("never lets a catalog bulk import silently change existing or opening stock", async () => {
    await useProducts.getState().bulkUpsert([product({ stockQty: 0 })]);
    await expect(useProducts.getState().bulkUpsert([product({ stockQty: 8 })])).rejects.toThrow(
      "kan niet via catalogusimport worden gewijzigd",
    );
    await expect(useProducts.getState().bulkUpsert([
      product({ id: "new-with-stock", stockQty: 3 }),
    ])).rejects.toThrow("kan niet via catalogusimport worden gewijzigd");
    expect((await db.products.get("product-1"))?.stockQty).toBe(0);
    expect(await db.products.get("new-with-stock")).toBeUndefined();
    expect(await db.stock_movements.count()).toBe(0);
  });

  it("starts a real tenant with an empty catalogue and reads persisted rows on later starts", async () => {
    await useProducts.getState().hydrate();
    expect(useProducts.getState()).toMatchObject({ hydrated: true });
    expect(useProducts.getState().list).toEqual([]);

    await db.products.clear();
    await db.products.put(product({ id: "persisted", name: "Persisted deck" }));
    useProducts.setState({ list: [], hydrated: false });
    await useProducts.getState().hydrate();
    expect(useProducts.getState().list).toEqual([
      expect.objectContaining({ id: "persisted", name: "Persisted deck" }),
    ]);
  });

  it("commits a family, identifiers, opening balance and one outbox command atomically", async () => {
    const familyId = "00000000-0000-4000-8000-000000000099";
    const first = product({
      id: "hoodie-s", name: "Hoodie", sku: "HD-S", barcode: "5410000000001",
      supplierCode: "SUP-HD", stockQty: 8, minStockQty: 2, familyId,
      variant: "Maat: S", variantOptions: { Maat: "S" },
    });
    const second = product({
      id: "hoodie-m", name: "Hoodie", sku: "HD-M", stockQty: 5,
      minStockQty: 2, familyId, variant: "Maat: M", variantOptions: { Maat: "M" },
    });
    await useProducts.getState().createCatalogBatch([first, second], {
      familyId, name: "Hoodie", categoryExternalId: "Decks",
      variants: [first, second].map((row) => ({
        productExternalId: row.id,
        displayName: row.variant!,
        options: Object.entries(row.variantOptions!).map(([name, value]) => ({ name, value })),
      })),
    });

    expect(await db.products.count()).toBe(2);
    expect((await db.products.get("hoodie-s"))?.identifiers).toEqual([
      { type: "internal-sku", value: "HD-S", isScannable: true, isPrimary: false },
      { type: "ean", value: "5410000000001", isScannable: true, isPrimary: true },
      { type: "supplier-code", value: "SUP-HD", isScannable: false, isPrimary: false },
    ]);
    expect((await db.stock_movements.toArray()).map((movement) => movement.quantityAfter).sort()).toEqual([5, 8]);
    const queued = await db.outbox.toArray();
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({ kind: "upsert_catalog_batch", attempts: 0 });
    expect(queued[0].payload).toMatchObject({
      products: [{ id: "hoodie-s" }, { id: "hoodie-m" }],
      existingProductExternalIds: [],
      family: { familyId },
    });
  });

  it("rolls back products and outbox when any part of a catalogue batch fails", async () => {
    vi.spyOn(db.audit, "add").mockRejectedValueOnce(new Error("audit unavailable"));
    await expect(useProducts.getState().createCatalogBatch([product()])).rejects.toThrow("audit unavailable");
    expect(await db.products.count()).toBe(0);
    expect(await db.stock_movements.count()).toBe(0);
    expect(await db.outbox.count()).toBe(0);
  });

  it("replaces edited canonical codes while preserving extra identifiers", async () => {
    const original = product({
      sku: "OLD-SKU",
      barcode: "5410000000001",
      supplierCode: "OLD-SUP",
      identifiers: [
        { type: "internal-sku", value: "OLD-SKU", isScannable: true, isPrimary: false },
        { type: "ean", value: "5410000000001", isScannable: true, isPrimary: true },
        { type: "supplier-code", value: "OLD-SUP", isScannable: false, isPrimary: false },
        { type: "alternate", value: "LEGACY-REF", isScannable: false, isPrimary: false },
      ],
    });
    await useProducts.getState().createCatalogBatch([original]);
    await db.outbox.clear();

    await useProducts.getState().createCatalogBatch([{
      ...original,
      sku: "NEW-SKU",
      barcode: "5410000000002",
      supplierCode: "NEW-SUP",
    }]);

    expect((await db.products.get(original.id))?.identifiers).toEqual([
      { type: "internal-sku", value: "NEW-SKU", isScannable: true, isPrimary: false },
      { type: "ean", value: "5410000000002", isScannable: true, isPrimary: true },
      { type: "supplier-code", value: "NEW-SUP", isScannable: false, isPrimary: false },
      { type: "alternate", value: "LEGACY-REF", isScannable: false, isPrimary: false },
    ]);
    expect((await db.outbox.toArray())[0].payload).toMatchObject({
      existingProductExternalIds: [original.id],
    });
  });

  it("rejects collisions across the shared SKU and barcode scan namespace", async () => {
    await useProducts.getState().createCatalogBatch([
      product({ id: "scan-a", sku: "SHARED-CODE" }),
    ]);

    await expect(useProducts.getState().createCatalogBatch([
      product({ id: "scan-b", barcode: " SHARED-CODE " }),
    ])).rejects.toThrow("wordt al door een ander product gebruikt");
    await expect(useProducts.getState().createCatalogBatch([
      product({ id: "scan-c", sku: "SAME", barcode: " SAME " }),
    ])).rejects.toThrow("mogen niet dezelfde scancode gebruiken");

    expect(await db.products.count()).toBe(1);
    expect(await db.outbox.count()).toBe(1);
  });
});
