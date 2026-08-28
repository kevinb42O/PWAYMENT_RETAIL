import { describe, expect, it } from "vitest";
import type { Product } from "../types";
import { parseInventoryCsv } from "./inventoryCsv";

const products: Product[] = [{ id: "a", name: "Deck", category: "Decks", priceCents: 1000, vatRate: 21, sku: "SKU-A", barcode: "5410000000001", stockQty: 4 }];

describe("inventory CSV", () => {
  it("builds controlled batch lines without mutating products", () => {
    expect(parseInventoryCsv("sku;aantal;notitie\nSKU-A;3;Levering", products, "delivery")).toEqual({
      lines: [{ productId: "a", expectedStockQty: 4, quantity: 3, note: "Levering" }], issues: [],
    });
    expect(products[0].stockQty).toBe(4);
  });

  it("fails the entire preview for duplicates, unknown products and invalid quantities", () => {
    const result = parseInventoryCsv("sku;aantal\nSKU-A;2\nSKU-A;1\nUNKNOWN;2", products, "count");
    expect(result.lines).toEqual([]);
    expect(result.issues).toHaveLength(2);
  });

  it("requires notes for other corrections and rejects negative outcomes", () => {
    expect(parseInventoryCsv("sku;aantal\nSKU-A;-1", products, "correction", "other").issues[0].message).toContain("notitie");
    expect(parseInventoryCsv("sku;aantal;notitie\nSKU-A;-5;verlies", products, "correction", "loss").issues[0].message).toContain("onder nul");
  });
});
