import { describe, expect, it, vi } from "vitest";
import { supabase } from "../lib/supabase";
import type { ManualCatalogBatchPayload } from "../types";
import { upsertSupabaseCatalogBatch } from "./supabaseMutations";

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
