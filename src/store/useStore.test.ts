import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import type { Product } from "../types";
import { useProducts } from "./useProducts";
import { useStore } from "./useStore";

const product = (overrides: Partial<Product> = {}): Product => ({
  id: "deck-1",
  name: "Street deck",
  category: "Decks",
  priceCents: 6500,
  vatRate: 21,
  stockQty: 2,
  ...overrides,
});

describe("active POS cart", () => {
  beforeEach(() => {
    useStore.getState().clearCart();
    useStore.getState().setMainView("pos");
    useStore.getState().setMobileView("menu");
    useProducts.setState({ list: [product()], hydrated: true });
  });

  it("combines identical lines, caps stock and keeps customized lines distinct", () => {
    const store = useStore.getState();
    store.addOrderItem(product());
    store.addOrderItem(product());
    store.addOrderItem(product());
    let [line] = useStore.getState().cart.orders;
    expect(line.quantity).toBe(2);

    store.setOrderItemNotes(line.lineId, "Voor Alex");
    store.addOrderItem(product());
    expect(useStore.getState().cart.orders).toHaveLength(2);
    line = useStore.getState().cart.orders[0];
    store.setOrderItemModifiers(line.lineId, [{ id: "grip", label: "Grip", deltaCents: 300 }]);
    store.updateOrderItemQuantity(line.lineId, 99);
    expect(useStore.getState().cart.orders[0]).toMatchObject({ quantity: 2, modifiers: [{ deltaCents: 300 }] });
    store.setOrderItemModifiers(line.lineId, []);
    expect(useStore.getState().cart.orders[0].modifiers).toBeUndefined();
  });

  it("returns explicit scan results and clears every cart-bound value", () => {
    const store = useStore.getState();
    expect(store.scanCodeToCart("   ")).toEqual({ status: "empty", code: "" });
    expect(store.scanCodeToCart("missing")).toEqual({ status: "not-found", code: "missing" });
    useProducts.setState({ list: [product({ barcode: "OUT", stockQty: 0 }), product({ barcode: "IN", sku: "SKU-1" })] });
    expect(store.scanCodeToCart("OUT")).toMatchObject({ status: "out-of-stock", matchedOn: "barcode" });
    expect(store.scanCodeToCart("SKU-1")).toMatchObject({ status: "matched", matchedOn: "sku" });

    const line = useStore.getState().cart.orders[0];
    store.addCartGiftCard({ id: "gift-1", code: "PW-1", amountCents: 1000 });
    store.addCartGiftCard({ id: "gift-1", code: "PW-1", amountCents: 500 });
    store.setCartDiscount({ amountCents: 250, reason: "Klant", approvedByUserId: "manager" });
    store.linkCustomer("customer-1");
    store.removeOrderItem(line.lineId);
    store.clearCart();
    expect(useStore.getState()).toMatchObject({
      cart: { orders: [] }, cartDiscount: null, cartGiftCards: [], linkedCustomerId: null,
    });
  });
});
