import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../db/db";
import type { Product } from "../types";
import {
  applyLocalInventoryCount,
  InventoryAdjustmentError,
} from "./inventoryAdjustments";

const product: Product = {
  id: "counted-deck",
  name: "Getelde deck",
  category: "decks",
  priceCents: 6000,
  vatRate: 21,
  stockQty: 5,
  isActive: true,
};

beforeEach(async () => {
  if (!db.isOpen()) await db.open();
  await Promise.all([
    db.products.clear(),
    db.stock_movements.clear(),
    db.audit.clear(),
  ]);
  await db.products.put(product);
});

describe("applyLocalInventoryCount", () => {
  it("writes an auditable correction movement from system quantity to physical count", async () => {
    const result = await applyLocalInventoryCount({
      clientRequestId: "count-1",
      productId: product.id,
      expectedStockQty: 5,
      countedStockQty: 3,
      reason: "loss",
      note: "Telling na sluiting",
      userId: "manager-1",
      userName: "Alex",
    });

    expect(result.product.stockQty).toBe(3);
    expect(result.movement).toMatchObject({
      quantityDelta: -2,
      reason: "manual-adjustment",
      quantityBefore: 5,
      quantityAfter: 3,
      adjustmentReason: "loss",
      note: "Telling na sluiting",
      clientRequestId: "count-1",
    });
    expect(await db.products.get(product.id)).toMatchObject({ stockQty: 3 });
    expect(await db.audit.orderBy("id").last()).toMatchObject({
      action: "inventory.count",
      detail: expect.objectContaining({
        expectedStockQty: 5,
        countedStockQty: 3,
        quantityDelta: -2,
        reason: "loss",
      }),
    });
  });

  it("records a matching physical count in audit without inventing a zero stock movement", async () => {
    const result = await applyLocalInventoryCount({
      clientRequestId: "count-match",
      productId: product.id,
      expectedStockQty: 5,
      countedStockQty: 5,
      reason: "cycle-count",
    });

    expect(result.movement).toBeUndefined();
    expect(await db.stock_movements.count()).toBe(0);
    expect(await db.audit.count()).toBe(1);
  });

  it("treats a retried client reference as the same count instead of applying it twice", async () => {
    const input = {
      clientRequestId: "count-retry",
      productId: product.id,
      expectedStockQty: 5,
      countedStockQty: 3,
      reason: "loss" as const,
    };

    await applyLocalInventoryCount(input);
    const retried = await applyLocalInventoryCount(input);

    expect(retried).toMatchObject({ duplicate: true, product: { stockQty: 3 } });
    expect(await db.products.get(product.id)).toMatchObject({ stockQty: 3 });
    expect(await db.stock_movements.count()).toBe(1);
    expect(await db.audit.count()).toBe(1);
  });

  it("rejects a stale system quantity before changing local stock", async () => {
    await expect(
      applyLocalInventoryCount({
        clientRequestId: "count-stale",
        productId: product.id,
        expectedStockQty: 4,
        countedStockQty: 3,
        reason: "cycle-count",
      }),
    ).rejects.toBeInstanceOf(InventoryAdjustmentError);

    expect(await db.products.get(product.id)).toMatchObject({ stockQty: 5 });
    expect(await db.stock_movements.count()).toBe(0);
    expect(await db.audit.count()).toBe(0);
  });

  it("requires a note for an other adjustment reason", async () => {
    await expect(
      applyLocalInventoryCount({
        clientRequestId: "count-other",
        productId: product.id,
        expectedStockQty: 5,
        countedStockQty: 4,
        reason: "other",
      }),
    ).rejects.toBeInstanceOf(InventoryAdjustmentError);
  });
});
