import { describe, expect, it } from "vitest";
import type { Product, ProductCategory } from "../types";
import {
  canonicalProductCategoryId,
  materializeLegacySubcategories,
  resolveProductCategoryPath,
} from "./categoryTaxonomy";

const categories: ProductCategory[] = [
  { id: "clothing", name: "Kleding", vatRate: 21 },
  { id: "clothing-hoodies", parentId: "clothing", name: "Hoodies", vatRate: 21 },
];

const product = (overrides: Partial<Product>): Product => ({
  id: "p1", name: "Hoodie", category: "clothing", priceCents: 5000, vatRate: 21, ...overrides,
});

describe("catalog category taxonomy", () => {
  it("resolves legacy root plus text and canonical leaf assignments to the same path", () => {
    const legacy = product({ subCategory: "Hoodies" });
    const canonical = product({ category: "clothing-hoodies", subCategory: "Hoodies" });

    expect(resolveProductCategoryPath(legacy, categories)).toEqual(resolveProductCategoryPath(canonical, categories));
    expect(canonicalProductCategoryId(legacy, categories)).toBe("clothing-hoodies");
  });

  it("materializes missing children deterministically and is idempotent", () => {
    const first = materializeLegacySubcategories(
      [{ id: "clothing", name: "Kleding", vatRate: 21 }],
      [product({ subCategory: "Truien" }), product({ id: "p2", subCategory: "Truien" })],
    );
    const second = materializeLegacySubcategories(first.categories, first.products);

    expect(first.createdCategories).toHaveLength(1);
    expect(first.products.map((item) => item.category)).toEqual(["clothing-truien", "clothing-truien"]);
    expect(second.createdCategories).toHaveLength(0);
    expect(second.updatedProducts).toHaveLength(0);
  });
});
