import { describe, expect, it, vi } from "vitest";
import { askPaceAi, normalizePaceAiAnswer, toPaceAiContext } from "./paceAi";
import type { PaceContext } from "./paceSignals";

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

  it("removes all live store and cart values when store context is disabled", () => {
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
    expect(serialized).not.toContain("store-secret");
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
});
