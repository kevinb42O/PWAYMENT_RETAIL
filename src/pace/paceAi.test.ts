import { describe, expect, it, vi } from "vitest";
import { askPaceAi, normalizePaceAiAnswer, readPaceApiResponse, toPaceAiContext } from "./paceAi";
import type { PaceContext } from "./paceSignals";

vi.mock("../lib/supabase", () => ({
  supabase: { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: "test-token" } } }) } },
}));

describe("Pace AI privacy boundary", () => {
  it("removes model markdown before plain-text UI rendering", () => {
    expect(normalizePaceAiAnswer("## Resultaat\n- **Product A**\n  - Voorraad: `2`\n  - Stilstand: 80 dagen")).toBe(
      "## Resultaat\n- Product A\n - Voorraad: 2\n - Stilstand: 80 dagen",
    );
  });

  it("drops every customer insight before a request leaves the till", () => {
    const context: PaceContext = {
      view: "pos",
      role: "cashier",
      productCount: 10,
      cartCount: 1,
      firstRunCompleted: true,
      online: true,
      pendingSync: 0,
      retryingSync: 0,
      failedSync: 0,
      customerInsights: [{
        id: "customer-secret",
        kind: "brand-affinity",
        priority: 55,
        tone: "flow",
        title: "Sensitive customer title",
        compact: "Sensitive purchase history",
        detail: "Sensitive detail",
        evidence: [{ transactionId: 42, brand: "Secret brand" }],
      }],
    };
    const serialized = JSON.stringify(toPaceAiContext(context));
    expect(serialized).not.toContain("customer-secret");
    expect(serialized).not.toContain("Sensitive");
    expect(serialized).not.toContain("Secret brand");
  });

  it("keeps tenant authorization while removing live store and cart values", () => {
    const context: PaceContext = {
      storeId: "store-secret",
      view: "pos",
      role: "owner",
      productCount: 93,
      cartCount: 2,
      firstRunCompleted: true,
      online: true,
      pendingSync: 12,
      retryingSync: 1,
      failedSync: 0,
      cartSummary: {
        items: [{ name: "Secret product", quantity: 2, unitPriceCents: 1995 }],
        customerLinked: true,
        customerName: "Sensitive customer",
        discountCents: 100,
        documentType: "receipt",
      },
    };
    const serialized = JSON.stringify(toPaceAiContext(context, false));
    expect(serialized).toContain('"storeId":"store-secret"');
    expect(serialized).toContain('"liveStoreContext":false');
    expect(serialized).not.toContain("Secret product");
    expect(serialized).not.toContain("Sensitive customer");
    expect(serialized).not.toContain("93");
    expect(serialized).toContain('"view":"pos"');
  });

  it("never starts a network request when AI answers are disabled", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const context: PaceContext = {
      view: "pos", role: "cashier", productCount: 0, cartCount: 0,
      firstRunCompleted: true, online: true, pendingSync: 0, retryingSync: 0, failedSync: 0,
    };
    await expect(askPaceAi("hi", context, [], undefined, { enabled: false })).rejects.toThrow("AI-antwoorden staan uit");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("reads public progress incrementally and returns the final payload", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('{"version":1,"type":"progress","sequence":1,"phase":"planning","interaction":"cancel"}\n'));
        controller.enqueue(encoder.encode('{"version":1,"type":"progress","sequence":2,"phase":"retrieving","progress":{"completed":1,"total":2},"sourceCount":2}\n'));
        controller.enqueue(encoder.encode('{"version":1,"type":"answer","status":200,"payload":{"answer":"Klaar","source":"analytics","model":"PWAYMENT Analytics"}}\n'));
        controller.close();
      },
    });
    const progress: string[] = [];
    const parsed = await readPaceApiResponse(new Response(stream, {
      headers: { "Content-Type": "application/x-ndjson; charset=utf-8" },
    }), (event) => progress.push(event.phase));
    expect(progress).toEqual(["planning", "retrieving"]);
    expect(parsed).toEqual({ status: 200, result: { answer: "Klaar", source: "analytics", model: "PWAYMENT Analytics" } });
  });

  it("fails closed when a progress stream has no final event", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"version":1,"type":"progress","sequence":1,"phase":"planning"}\n'));
        controller.close();
      },
    });
    await expect(readPaceApiResponse(new Response(stream, {
      headers: { "Content-Type": "application/x-ndjson" },
    }))).resolves.toEqual({ status: 502, result: { error: "PACE_STREAM_INCOMPLETE" } });
  });

  it("identifies missing server configuration and preserves the cause during cooldown", async () => {
    vi.resetModules();
    const { askPaceAi: askWithFreshState } = await import("./paceAi");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({
      error: "PACE_AI_NOT_CONFIGURED", fallback: "local",
    }, { status: 503 }));
    const context: PaceContext = {
      view: "pos", role: "cashier", productCount: 0, cartCount: 0,
      firstRunCompleted: true, online: true, pendingSync: 0, retryingSync: 0, failedSync: 0,
    };
    try {
      await expect(askWithFreshState("Hoe werkt PACE?", context)).rejects.toThrow("niet volledig geconfigureerd op de server");
      await expect(askWithFreshState("Waarom werkt dit niet?", context)).rejects.toThrow("niet volledig geconfigureerd op de server");
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
