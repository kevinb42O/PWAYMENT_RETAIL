import { beforeEach, describe, expect, it } from "vitest";
import { EMPTY_WEBSHOP_SETTINGS, useWebshopStore } from "./useWebshopStore";

describe("webshop settings store", () => {
  beforeEach(() => useWebshopStore.setState({ ...EMPTY_WEBSHOP_SETTINGS }));

  it("maintains publication, featured products and product metadata independently", () => {
    const store = useWebshopStore.getState();
    store.toggleProductPublished("deck-1");
    store.toggleProductFeatured("deck-1");
    store.setProductDescription("deck-1", "Een stevige deck.");
    store.setProductImage("deck-1", "https://cdn.example.test/deck.jpg");
    store.setProductVariants("deck-1", ["8.25 inch"]);

    expect(useWebshopStore.getState()).toMatchObject({
      unpublishedProductIds: ["deck-1"],
      featuredProductIds: ["deck-1"],
      productDescriptions: { "deck-1": "Een stevige deck." },
      productImages: { "deck-1": "https://cdn.example.test/deck.jpg" },
    });
    expect(useWebshopStore.getState().productVariants["deck-1"]).toHaveLength(1);

    useWebshopStore.getState().setAllProductsPublished(["deck-1", "deck-2"], true);
    expect(useWebshopStore.getState().unpublishedProductIds).toEqual([]);
  });

  it("updates coupons without duplicating a code", () => {
    const store = useWebshopStore.getState();
    store.addCoupon({ code: "WELCOME", discountType: "fixed", value: 500, active: true });
    store.addCoupon({ code: "WELCOME", discountType: "percent", value: 10, active: true });
    store.toggleCouponActive("WELCOME");

    expect(useWebshopStore.getState().coupons).toEqual([
      { code: "WELCOME", discountType: "percent", value: 10, active: false },
    ]);
    useWebshopStore.getState().deleteCoupon("WELCOME");
    expect(useWebshopStore.getState().coupons).toEqual([]);
  });
});
