import { afterEach, describe, expect, it, vi } from "vitest";
import { supabase } from "../lib/supabase";
import type { ManualCatalogBatchPayload } from "../types";
import {
  deleteSupabaseCategory,
  upsertSupabaseCatalogBatch,
  upsertSupabaseCategories,
} from "./supabaseMutations";

afterEach(() => vi.restoreAllMocks());

describe("manual catalogue server mutation", () => {
  it("sends one complete idempotent RPC instead of separate product and relation writes", async () => {
    const payload: ManualCatalogBatchPayload = {
      requestId: "catalog-request-1",
      existingProductExternalIds: [],
      products: [{
        id: "product-1", name: "Hoodie", category: "clothing",
        priceCents: 5000, vatRate: 21, stockQty: 4,
      }],
    };
    const rpc = vi.spyOn(supabase, "rpc").mockResolvedValue({ data: { products_upserted: 1 }, error: null } as never);
    await upsertSupabaseCatalogBatch("00000000-0000-0000-0000-000000000001", payload);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("upsert_manual_catalog_batch", {
      target_store_id: "00000000-0000-0000-0000-000000000001",
      batch_payload: payload,
    });
  });

  it("keeps a rejected server mutation visible to the retry layer", async () => {
    vi.spyOn(supabase, "rpc").mockResolvedValue({ data: null, error: { message: "retail-catalog:create-conflict" } } as never);
    await expect(upsertSupabaseCatalogBatch("store-1", {
      requestId: "catalog-request-2", existingProductExternalIds: [],
      products: [{ id: "p", name: "P", category: "c", priceCents: 100, vatRate: 21 }],
    })).rejects.toThrow("retail-catalog:create-conflict");
  });
});

describe("category taxonomy server mutations", () => {
  it("upserts parents before children through the atomic taxonomy RPC", async () => {
    const rpc = vi.spyOn(supabase, "rpc").mockResolvedValue({ data: {}, error: null } as never);

    await upsertSupabaseCategories("store-1", [
      { id: "hoodies", parentId: "clothing", name: "Hoodies", vatRate: 21, isActive: true },
      { id: "clothing", name: "Kleding", vatRate: 21, isActive: true },
    ]);

    expect(rpc).toHaveBeenNthCalledWith(1, "upsert_catalog_category", {
      target_store_id: "store-1",
      category_payload: { id: "clothing", name: "Kleding", vatRate: 21, isActive: true },
    });
    expect(rpc).toHaveBeenNthCalledWith(2, "upsert_catalog_category", {
      target_store_id: "store-1",
      category_payload: { id: "hoodies", parentId: "clothing", name: "Hoodies", vatRate: 21, isActive: true },
    });
  });

  it("deletes through the guarded taxonomy RPC", async () => {
    const rpc = vi.spyOn(supabase, "rpc").mockResolvedValue({ data: null, error: null } as never);
    await deleteSupabaseCategory("store-1", "hoodies");
    expect(rpc).toHaveBeenCalledWith("delete_catalog_category", {
      target_store_id: "store-1",
      category_external_id: "hoodies",
    });
  });
});
