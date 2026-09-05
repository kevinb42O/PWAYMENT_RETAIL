import { afterEach, describe, expect, it, vi } from "vitest";
import { resolutionPersistence, resolveQuestionEntities } from "./entityResolution.js";

afterEach(() => vi.restoreAllMocks());

describe("PACE entity resolution", () => {
  it("auto-resolves one strong candidate", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json([{
      mentionKey: "M1", type: "product", search: "SKU-42",
      candidates: [{ canonicalId: "product-1", type: "product", label: "Sneaker · Blauw", attributes: { sku: "SKU-42" }, score: .99 }],
    }])));
    const result = await resolveQuestionEntities({
      supabaseUrl: "https://db.test", publishableKey: "key", serviceRoleKey: "service-key", actorUserId: "user-1",
    }, "store-1", "toon product SKU-42");
    expect(result[0].status).toBe("resolved");
    expect(resolutionPersistence(result).entities).toEqual([expect.objectContaining({ canonicalId: "product-1" })]);
    const [url, request] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://db.test/rest/v1/rpc/pace_server_rpc");
    expect(request.headers).toEqual(expect.objectContaining({ apikey: "service-key", Authorization: "Bearer service-key" }));
    expect(JSON.parse(String(request.body))).toMatchObject({
      target_actor_user_id: "user-1",
      operation: "resolve_pace_entities",
      rpc_payload: { target_store_id: "store-1" },
    });
  });

  it("requires clarification when candidates are close", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json([{
      mentionKey: "M1", type: "customer", search: "Jan",
      candidates: [
        { canonicalId: "a", type: "customer", label: "Jan A", attributes: {}, score: .92 },
        { canonicalId: "b", type: "customer", label: "Jan B", attributes: {}, score: .86 },
      ],
    }])));
    const result = await resolveQuestionEntities({
      supabaseUrl: "https://db.test", publishableKey: "key", serviceRoleKey: "service-key", actorUserId: "user-1",
    }, "store-1", "toon klant Jan");
    expect(result[0].status).toBe("ambiguous");
    expect(resolutionPersistence(result).entities).toEqual([]);
  });
});
