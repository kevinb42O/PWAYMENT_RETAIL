import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import type { Product, SaleDocumentRequest } from "../types";
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
    useStore.setState({
      cart: { id: 1, orders: [] },
      cartDiscount: null,
      cartDocumentRequest: { type: "receipt" },
      cartCheckoutRequestId: null,
      suspendedCarts: [],
      cartGiftCards: [],
      linkedCustomerId: null,
      mainView: "pos",
      mobileView: "menu",
    });
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
      cart: { orders: [] },
      cartDiscount: null,
      cartDocumentRequest: { type: "receipt" },
      cartCheckoutRequestId: null,
      cartGiftCards: [],
      linkedCustomerId: null,
    });
  });
});

describe("suspended retail carts", () => {
  const invoiceRequest: SaleDocumentRequest = {
    type: "invoice-b2b",
    recipient: {
      customerId: "customer-1",
      name: "Studio Alex",
      companyName: "Studio Alex BV",
      addressLine1: "Kerkstraat 1",
      postalCode: "9000",
      city: "Gent",
      countryCode: "BE",
      vatNumber: "BE0123456789",
    },
  };

  beforeEach(() => {
    useStore.setState({
      cart: { id: 1, orders: [] },
      cartDiscount: null,
      cartDocumentRequest: { type: "receipt" },
      cartCheckoutRequestId: null,
      suspendedCarts: [],
      cartGiftCards: [],
      linkedCustomerId: null,
    });
    useProducts.setState({ list: [product()], hydrated: true });
  });

  it("does not create or clear a held basket when the active basket is empty", () => {
    const store = useStore.getState();
    store.linkCustomer("customer-1");
    store.setCartDocumentRequest(invoiceRequest);

    expect(store.suspendCurrentCart({ storeId: "store-a", label: "Alex" })).toBeNull();
    expect(useStore.getState()).toMatchObject({
      suspendedCarts: [],
      linkedCustomerId: "customer-1",
      cartDocumentRequest: invoiceRequest,
    });
  });

  it("snapshots every basket-bound value, strips manager proof and resets the active basket", () => {
    const store = useStore.getState();
    store.addOrderItem(product());
    const line = useStore.getState().cart.orders[0];
    store.setOrderItemNotes(line.lineId, "Apart houden");
    store.setOrderItemModifiers(line.lineId, [{ id: "wrap", label: "Inpakken", deltaCents: 250 }]);
    store.setCartDiscount({
      amountCents: 500,
      reason: "Loyaliteit",
      approvedByUserId: "manager-1",
      approvalId: "one-time-proof",
    });
    store.addCartGiftCard({ id: "gift-1", code: "PW-1", amountCents: 1000 });
    store.linkCustomer("customer-1");
    store.setCartDocumentRequest(invoiceRequest);
    store.setCartCheckoutRequestId("checkout-retry-1");

    const held = store.suspendCurrentCart({
      storeId: "store-a",
      heldBy: { userId: "cashier-1", userName: "Sam" },
      label: "  Alex aan kassa 2  ",
    });

    expect(held).toMatchObject({
      storeId: "store-a",
      label: "Alex aan kassa 2",
      heldBy: { userId: "cashier-1", userName: "Sam" },
      cart: {
        orders: [{ notes: "Apart houden", modifiers: [{ id: "wrap", deltaCents: 250 }] }],
      },
      cartDiscount: {
        amountCents: 500,
        requiresReapproval: true,
      },
      cartGiftCards: [{ id: "gift-1", amountCents: 1000 }],
      linkedCustomerId: "customer-1",
      documentRequest: invoiceRequest,
      checkoutRequestId: "checkout-retry-1",
    });
    expect(held?.cartDiscount).not.toHaveProperty("approvalId");
    expect(useStore.getState()).toMatchObject({
      cart: { orders: [] },
      cartDiscount: null,
      cartGiftCards: [],
      linkedCustomerId: null,
      cartDocumentRequest: { type: "receipt" },
      cartCheckoutRequestId: null,
    });
  });

  it("restores held values only for the matching store and preserves a current basket when asked", () => {
    const store = useStore.getState();
    store.addOrderItem(product({ id: "first", name: "Eerste klant" }));
    store.setCartDocumentRequest(invoiceRequest);
    store.setCartCheckoutRequestId("retry-first");
    const first = store.suspendCurrentCart({ storeId: "store-a", label: "Eerste" });
    expect(first).not.toBeNull();

    store.addOrderItem(product({ id: "second", name: "Tweede klant" }));
    expect(store.resumeSuspendedCart(first!.id, { storeId: "store-b" })).toBe(false);
    expect(useStore.getState().cart.orders[0].product.id).toBe("second");
    expect(store.resumeSuspendedCart(first!.id, { storeId: "store-a" })).toBe(false);
    expect(store.resumeSuspendedCart(first!.id, {
      storeId: "store-a",
      suspendCurrent: true,
      suspendLabel: "Tweede",
    })).toBe(true);

    expect(useStore.getState()).toMatchObject({
      cart: { orders: [{ product: { id: "first" } }] },
      cartDocumentRequest: invoiceRequest,
      cartCheckoutRequestId: "retry-first",
    });
    expect(useStore.getState().suspendedCarts).toHaveLength(1);
    expect(useStore.getState().suspendedCarts[0]).toMatchObject({
      storeId: "store-a",
      label: "Tweede",
      cart: { orders: [{ product: { id: "second" } }] },
    });
  });

  it("persists queue state and migrates a version 6 basket without queue fields", async () => {
    const store = useStore.getState();
    store.addOrderItem(product());
    const held = store.suspendCurrentCart({ storeId: "store-a", label: "Bewaren" });
    expect(held).not.toBeNull();

    const options = useStore.persist.getOptions();
    const persisted = options.partialize(useStore.getState());
    expect(persisted).toMatchObject({
      cartDocumentRequest: { type: "receipt" },
      cartCheckoutRequestId: null,
      suspendedCarts: [{ id: held!.id, storeId: "store-a", label: "Bewaren" }],
    });
    expect(persisted).not.toHaveProperty("suspendCurrentCart");

    const migrate = options.migrate;
    expect(migrate).toBeDefined();
    const migrated = await migrate!({
      cart: { id: 1, orders: [] },
      cartDiscount: null,
      cartGiftCards: [],
      linkedCustomerId: "customer-legacy",
    }, 6);
    expect(migrated).toMatchObject({
      cartDocumentRequest: { type: "receipt" },
      cartCheckoutRequestId: null,
      suspendedCarts: [],
      linkedCustomerId: "customer-legacy",
    });
  });

  it("discards only a held basket from the matching store", () => {
    const store = useStore.getState();
    store.addOrderItem(product());
    const held = store.suspendCurrentCart({ storeId: "store-a" });
    expect(held).not.toBeNull();

    expect(store.discardSuspendedCart(held!.id, { storeId: "store-b" })).toBe(false);
    expect(useStore.getState().suspendedCarts).toHaveLength(1);
    expect(store.discardSuspendedCart(held!.id, { storeId: "store-a" })).toBe(true);
    expect(useStore.getState().suspendedCarts).toHaveLength(0);
  });
});
