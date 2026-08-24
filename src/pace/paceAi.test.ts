import { describe, expect, it } from "vitest";
import { toPaceAiContext } from "./paceAi";
import type { PaceContext } from "./paceSignals";

describe("Pace AI privacy boundary", () => {
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
});
