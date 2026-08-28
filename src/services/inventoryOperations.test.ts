import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "../auth/useAuth";
import { db } from "../db/db";
import type { Product } from "../types";
import { supabase } from "../lib/supabase";
import { InventoryOperationError, recordInventoryBatch, recordInventoryOperation } from "./inventoryOperations";

const product: Product = {
  id: "operation-deck",
  name: "Operationele deck",
  category: "decks",
  priceCents: 6000,
  vatRate: 21,
  stockQty: 5,
  isActive: true,
};

beforeEach(async () => {
  vi.restoreAllMocks();
  if (!db.isOpen()) await db.open();
  await Promise.all([db.products.clear(), db.stock_movements.clear(), db.audit.clear()]);
  await db.products.put(product);
  useAuth.setState({ currentStoreId: null, currentUserId: "manager-1", currentUserName: "Alex", currentRole: "manager" });
});

describe("recordInventoryOperation local contract", () => {
  it("records a delivery as a purchase receipt with before and after snapshots", async () => {
    const result = await recordInventoryOperation({
      clientRequestId: "delivery-request-1",
      productId: product.id,
      expectedStockQty: 5,
      mode: "delivery",
      quantity: 4,
    });

    expect(result.product.stockQty).toBe(9);
    expect(result.movement).toMatchObject({
      reason: "purchase-receipt",
      quantityDelta: 4,
      quantityBefore: 5,
      quantityAfter: 9,
      clientRequestId: "delivery-request-1",
    });
    expect(await db.audit.orderBy("id").last()).toMatchObject({
      action: "inventory.operation",
      detail: expect.objectContaining({ mode: "delivery", quantityAfter: 9 }),
    });
  });

  it("commits a multi-SKU batch atomically with one movement per changed SKU", async () => {
    await db.products.put({ ...product, id: "operation-truck", name: "Truck", stockQty: 2 });
    const input = {
      clientRequestId: "batch-delivery-1",
      mode: "delivery" as const,
      lines: [
        { productId: product.id, expectedStockQty: 5, quantity: 2 },
        { productId: "operation-truck", expectedStockQty: 2, quantity: 3 },
      ],
    };
    const result = await recordInventoryBatch(input);
    const duplicate = await recordInventoryBatch(input);
    expect(result.products.map((row) => row.stockQty)).toEqual([7, 5]);
    expect(result.movements).toHaveLength(2);
    expect(duplicate.duplicate).toBe(true);
    expect(await db.stock_movements.count()).toBe(2);
    expect(await db.audit.where("action").equals("inventory.batch").count()).toBe(1);
  });

  it("rolls the entire batch back when one line is stale", async () => {
    await db.products.put({ ...product, id: "operation-truck", name: "Truck", stockQty: 2 });
    await expect(recordInventoryBatch({
      clientRequestId: "batch-stale-1",
      mode: "count",
      lines: [
        { productId: product.id, expectedStockQty: 5, quantity: 4 },
        { productId: "operation-truck", expectedStockQty: 99, quantity: 1 },
      ],
    })).rejects.toThrow("volledige batch is niet verwerkt");
    expect((await db.products.get(product.id))?.stockQty).toBe(5);
    expect((await db.products.get("operation-truck"))?.stockQty).toBe(2);
    expect(await db.stock_movements.count()).toBe(0);
  });

  it("records a correction with its explicit reason and never applies a retry twice", async () => {
    const input = {
      clientRequestId: "correction-request-1",
      productId: product.id,
      expectedStockQty: 5,
      mode: "correction" as const,
      quantity: -2,
      reason: "damage" as const,
    };
    await recordInventoryOperation(input);
    const retry = await recordInventoryOperation(input);

    expect(retry.duplicate).toBe(true);
    expect(retry.product.stockQty).toBe(3);
    expect(await db.stock_movements.count()).toBe(1);
    expect(await db.audit.count()).toBe(1);
  });

  it("rejects stale and negative resulting stock without any partial write", async () => {
    await expect(recordInventoryOperation({
      clientRequestId: "stale-request-1",
      productId: product.id,
      expectedStockQty: 4,
      mode: "delivery",
      quantity: 1,
    })).rejects.toBeInstanceOf(InventoryOperationError);
    await expect(recordInventoryOperation({
      clientRequestId: "negative-request-1",
      productId: product.id,
      expectedStockQty: 5,
      mode: "correction",
      quantity: -6,
      reason: "loss",
    })).rejects.toBeInstanceOf(InventoryOperationError);

    expect(await db.products.get(product.id)).toMatchObject({ stockQty: 5 });
    expect(await db.stock_movements.count()).toBe(0);
    expect(await db.audit.count()).toBe(0);
  });

  it.each([
    { mode: "delivery" as const, quantity: 2, confirmed: 7 },
    { mode: "count" as const, quantity: 2, confirmed: 2 },
  ])("uses the guarded remote operation contract for $mode", async ({ mode, quantity, confirmed }) => {
    useAuth.setState({ currentStoreId: "store-1" });
    const rpc = vi.spyOn(supabase, "rpc").mockResolvedValue({
      data: { quantity_after: confirmed, duplicate: false }, error: null,
    } as never);

    const result = await recordInventoryOperation({
      clientRequestId: `remote-${mode}-request`,
      productId: product.id,
      expectedStockQty: 5,
      mode,
      quantity,
    });

    expect(result.product.stockQty).toBe(confirmed);
    expect(rpc).toHaveBeenCalledWith("record_inventory_operation", expect.objectContaining({
      target_store_id: "store-1",
      payload: expect.objectContaining({ mode }),
    }));
  });

  it("translates remote operation errors and rejects malformed confirmations", async () => {
    useAuth.setState({ currentStoreId: "store-1" });
    const rpc = vi.spyOn(supabase, "rpc");
    rpc.mockResolvedValueOnce({ data: null, error: { message: "inventory-operation:stock-changed:Nieuwe stand vereist." } } as never);
    await expect(recordInventoryOperation({
      clientRequestId: "remote-error-request", productId: product.id, expectedStockQty: 5, mode: "delivery", quantity: 1,
    })).rejects.toThrow("Nieuwe stand vereist");

    rpc.mockResolvedValueOnce({ data: { quantity_after: "onbekend" }, error: null } as never);
    await expect(recordInventoryOperation({
      clientRequestId: "remote-malformed-request", productId: product.id, expectedStockQty: 5, mode: "delivery", quantity: 1,
    })).rejects.toThrow("geen geldige voorraadbevestiging");
    expect((await db.products.get(product.id))?.stockQty).toBe(5);
  });

  it("refuses remote mutations while offline", async () => {
    useAuth.setState({ currentStoreId: "store-1" });
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    await expect(recordInventoryOperation({
      clientRequestId: "offline-operation-request", productId: product.id, expectedStockQty: 5, mode: "delivery", quantity: 1,
    })).rejects.toThrow("Maak verbinding");
    await expect(recordInventoryBatch({
      clientRequestId: "offline-batch-request", mode: "count", lines: [{ productId: product.id, expectedStockQty: 5, quantity: 4 }],
    })).rejects.toThrow("Maak verbinding");
  });

  it("applies a remotely confirmed batch locally and validates full server acknowledgement", async () => {
    useAuth.setState({ currentStoreId: "store-1" });
    const rpc = vi.spyOn(supabase, "rpc");
    rpc.mockResolvedValueOnce({ data: { line_count: 1, duplicate: true }, error: null } as never);
    const result = await recordInventoryBatch({
      clientRequestId: "remote-batch-request", mode: "delivery", lines: [{ productId: product.id, expectedStockQty: 5, quantity: 3 }],
    });
    expect(result).toMatchObject({ duplicate: true, products: [{ stockQty: 8 }] });
    expect(rpc).toHaveBeenCalledWith("record_inventory_batch", expect.any(Object));

    rpc.mockResolvedValueOnce({ data: { line_count: 0 }, error: null } as never);
    await expect(recordInventoryBatch({
      clientRequestId: "remote-short-batch", mode: "count", lines: [{ productId: product.id, expectedStockQty: 8, quantity: 7 }],
    })).rejects.toThrow("niet volledig");
  });
});
