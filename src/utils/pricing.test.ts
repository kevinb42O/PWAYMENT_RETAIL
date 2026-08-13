import { describe, expect, it } from "vitest";
import type { Product } from "../types";
import { normalizePriceGroup, resolveProductPrice } from "./pricing";

const product: Product = {
  id: "router",
  name: "Router",
  category: "telecom",
  priceCents: 12900,
  vatRate: 21,
  priceTiers: { "telenet-klant": 9900, b2b: 10900 },
};

describe("pricing", () => {
  it("normalizes merchant-defined customer groups", () => {
    expect(normalizePriceGroup(" Telenet Klant ")).toBe("telenet-klant");
  });

  it("uses an exact customer group price", () => {
    expect(resolveProductPrice(product, { priceGroup: "Telenet klant" })).toMatchObject({
      priceCents: 9900,
      standardPriceCents: 12900,
      source: "customer-group",
    });
  });

  it("falls back safely to the standard price", () => {
    expect(resolveProductPrice(product, { priceGroup: "vip" })).toMatchObject({
      priceCents: 12900,
      source: "standard",
    });
  });
});
