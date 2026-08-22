import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { useAuth } from "../auth/useAuth";
import { productCategories } from "../data/categories";
import { db } from "../db/db";
import { useCategories } from "./useCategories";

describe("category repository store", () => {
  beforeEach(async () => {
    if (!db.isOpen()) await db.open();
    await Promise.all([db.categories.clear(), db.products.clear(), db.outbox.clear()]);
    useAuth.setState({ currentStoreIsDemo: false });
    useCategories.setState({ list: [], hydrated: false });
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
});
