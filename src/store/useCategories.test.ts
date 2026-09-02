import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "../auth/useAuth";
import { productCategories } from "../data/categories";
import { db } from "../db/db";
import { useCategories } from "./useCategories";
import { useProducts } from "./useProducts";

describe("category repository store", () => {
  beforeEach(async () => {
    if (!db.isOpen()) await db.open();
    await Promise.all([db.categories.clear(), db.products.clear(), db.outbox.clear()]);
    useAuth.setState({ currentStoreIsDemo: false });
    useCategories.setState({ list: [], hydrated: false });
    useProducts.setState({ list: [], hydrated: false });
    vi.restoreAllMocks();
  });

  it("publishes subcategories committed concurrently by product hydration", async () => {
    const root = { id: "accessories", name: "Accessoires", vatRate: 21, isActive: true };
    const leaf = {
      id: "accessories-cadeaubonnen",
      parentId: root.id,
      name: "Cadeaubonnen",
      vatRate: 21,
      isActive: true,
    };
    await db.categories.put(root);

    const readProducts = db.products.toArray.bind(db.products);
    vi.spyOn(db.products, "toArray").mockImplementationOnce((async () => {
      await db.categories.put(leaf);
      return readProducts();
    }) as never);

    await useCategories.getState().hydrate();

    expect(useCategories.getState().list).toEqual(expect.arrayContaining([
      expect.objectContaining(root),
      expect.objectContaining(leaf),
    ]));
  });

  it("starts a real tenant with no categories", async () => {
    await useCategories.getState().hydrate();

    expect(useCategories.getState()).toMatchObject({ hydrated: true, list: [] });
  });

  it("removes the untouched legacy static seed from an empty real tenant", async () => {
    await db.categories.bulkPut(productCategories);

    await useCategories.getState().hydrate();

    expect(await db.categories.count()).toBe(0);
    expect(useCategories.getState().list).toEqual([]);
  });

  it("persists 0% and reduced VAT as a category policy instead of coercing it to 21%", async () => {
    const created = await useCategories.getState().addCategory("Boeken", 6);
    await useCategories.getState().setCategoryVatRate(created!.id, 0);

    expect(await db.categories.get(created!.id)).toMatchObject({ vatRate: 0 });
    expect((await db.outbox.toArray()).map((entry) => entry.kind)).toEqual([
      "upsert_category",
      "upsert_category",
    ]);
  });

  it("persists an owner-selected category icon and queues it for sync", async () => {
    const created = await useCategories.getState().addCategory("Boeken", 6);
    await useCategories.getState().setCategoryIcon(created!.id, "book");

    expect(await db.categories.get(created!.id)).toMatchObject({ icon: "book" });
    expect(useCategories.getState().list.find((category) => category.id === created!.id)).toMatchObject({ icon: "book" });
    expect((await db.outbox.toArray()).filter((entry) => entry.kind === "upsert_category")).toHaveLength(2);
  });

  it("creates subcategories below a main category and prevents deleting a non-empty branch", async () => {
    const parent = await useCategories.getState().addCategory("Schoenen", 21);
    const child = await useCategories.getState().addSubcategory(parent!.id, "Sneakers");

    expect(child).toMatchObject({ parentId: parent!.id, name: "Sneakers", vatRate: 21 });
    expect(await useCategories.getState().removeCategory(parent!.id)).toBe(false);
    expect(await db.categories.get(child!.id)).toMatchObject({ parentId: parent!.id });
  });

  it("renames a used subcategory without orphaning existing product selections", async () => {
    const parent = await useCategories.getState().addCategory("Kleding", 21);
    const child = await useCategories.getState().addSubcategory(parent!.id, "Truien");
    const product = {
      id: "hoodie",
      name: "Hoodie",
      category: parent!.id,
      subCategory: child!.name,
      priceCents: 5000,
      vatRate: 21,
    };
    await db.products.put(product);
    useProducts.setState({ list: [product], hydrated: true });

    await useCategories.getState().renameCategory(child!.id, "Sweaters");

    expect(await db.products.get(product.id)).toMatchObject({ subCategory: "Sweaters" });
    expect(useProducts.getState().list[0]).toMatchObject({ subCategory: "Sweaters" });
    expect(await useCategories.getState().removeCategory(child!.id)).toBe(false);
  });
});
