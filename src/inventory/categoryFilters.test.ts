import { describe, expect, it } from "vitest";
import type { Product, ProductCategory } from "../types";
import { inventoryCategoryFilterOptions } from "./categoryFilters";

const product = (overrides: Partial<Product>): Product => ({
  id: "product-1",
  name: "T-shirt",
  category: "apparel-sub-tshirts-a1b2c3d4",
  subCategory: "T-shirts",
  priceCents: 2500,
  vatRate: 21,
  stockQty: 4,
  ...overrides,
});

const categories: ProductCategory[] = [
  { id: "apparel", name: "Kledij", vatRate: 21 },
  { id: "apparel-sub-tshirts-a1b2c3d4", parentId: "apparel", name: "T-shirts", vatRate: 21 },
];

describe("inventoryCategoryFilterOptions", () => {
  it("toont het leesbare categoriepad en bewaart de interne id alleen als waarde", () => {
    expect(inventoryCategoryFilterOptions([product({}), product({ id: "product-2" })], categories)).toEqual([
      {
        value: "apparel-sub-tshirts-a1b2c3d4",
        label: "Kledij / T-shirts",
        productCount: 2,
      },
    ]);
  });

  it("lekt geen interne id wanneer de lokale taxonomie tijdelijk ontbreekt", () => {
    expect(inventoryCategoryFilterOptions([product({})], [])[0]).toMatchObject({
      label: "T-shirts",
      value: "apparel-sub-tshirts-a1b2c3d4",
    });
  });

  it("slaat diensten zonder voorraad en inactieve producten over", () => {
    expect(inventoryCategoryFilterOptions([
      product({ stockQty: undefined }),
      product({ id: "inactive", isActive: false }),
    ], categories)).toEqual([]);
  });
});
