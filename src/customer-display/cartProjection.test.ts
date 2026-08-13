import { describe, expect, it } from "vitest";
import type { Customer, OrderItem, Product } from "../types";
import { projectCart } from "./cartProjection";
import { customerDisplayLineSchema } from "./protocol";

const sensitiveProduct: Product = {
  id: "deck-1",
  name: "Maple Deck 8.25",
  category: "Decks",
  variant: "Black",
  sku: "SECRET-SKU",
  barcode: "1234567890123",
  priceCents: 10_000,
  costPriceCents: 3_500,
  vatRate: 21,
  supplier: "Interne leverancier",
  stockQty: 12,
  priceTiers: { vip: 8_000 },
  customFields: { internalMarginBand: "A" },
};

const customer: Customer = {
  id: "customer-1",
  name: "Niet tonen",
  email: "private@example.com",
  priceGroup: "VIP",
  totalSpentCents: 0,
  visitCount: 0,
  createdAt: new Date(0).toISOString(),
  isActive: true,
};

const order: OrderItem = {
  lineId: "line-1",
  product: sensitiveProduct,
  quantity: 2,
  notes: "Interne notitie die nooit op het klantenscherm mag",
  modifiers: [{ id: "grip", label: "Grip aanbrengen", deltaCents: 500 }],
};

describe("projectCart", () => {
  it("uses the resolved customer price and keeps every amount cent-exact", () => {
    const projected = projectCart({
      orders: [order],
      linkedCustomer: customer,
      discountCents: 1_000,
      giftCards: [{ id: "gift-1", amountCents: 2_500 }],
    });

    expect(projected.items[0].product.priceCents).toBe(8_000);
    expect(projected.displayLines).toEqual([
      {
        lineId: "line-1",
        name: "Maple Deck 8.25",
        variant: "Black",
        modifierLabels: ["Grip aanbrengen"],
        quantity: 2,
        unitPriceCents: 8_500,
        lineTotalCents: 17_000,
        standardUnitPriceCents: 10_500,
      },
    ]);
    expect(projected.totals.subtotal).toBe(17_000);
    expect(projected.totals.discount).toBe(1_000);
    expect(projected.totals.total).toBe(16_000);
    expect(projected.giftCardCents).toBe(2_500);
    expect(projected.remainingCents).toBe(13_500);
  });

  it("emits an allowlisted line without internal product, customer or note data", () => {
    const line = projectCart({
      orders: [order],
      linkedCustomer: customer,
    }).displayLines[0];

    expect(customerDisplayLineSchema.safeParse(line).success).toBe(true);
    const serialized = JSON.stringify(line);
    expect(serialized).not.toContain("costPriceCents");
    expect(serialized).not.toContain("supplier");
    expect(serialized).not.toContain("SECRET-SKU");
    expect(serialized).not.toContain("1234567890123");
    expect(serialized).not.toContain("internalMarginBand");
    expect(serialized).not.toContain("Interne notitie");
    expect(serialized).not.toContain("private@example.com");
    expect(serialized).not.toContain("Niet tonen");
  });

  it("blocks unsupported VAT from producing a misleading total", () => {
    const projected = projectCart({
      orders: [
        {
          ...order,
          product: { ...sensitiveProduct, vatRate: 6 },
        },
      ],
    });

    expect(projected.vatBlockers).toHaveLength(1);
    expect(projected.totals.total).toBe(0);
    expect(projected.remainingCents).toBe(0);
  });
});
