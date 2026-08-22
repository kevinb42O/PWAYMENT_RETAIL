import { describe, expect, it } from "vitest";
import {
  customerDisplaySnapshotSchema,
  parseCustomerDisplayMessage,
} from "./protocol";

const validSnapshot = {
  protocolVersion: 1 as const,
  storeId: "store-test",
  registerId: "register-test",
  displaySessionId: "display-session-1234567890",
  cartSessionId: "cart-session-1234567890",
  epochId: "display-epoch-1234567890",
  revision: 4,
  emittedAt: 1_700_000_000_000,
  phase: "cart" as const,
  merchant: {
    displayName: "Testwinkel",
    locale: "nl-BE" as const,
    currency: "EUR" as const,
  },
  presentation: {
    idleHeadline: "Welkom",
    idleMessage: "Fijn dat je er bent.",
    accentColor: "#0891b2",
    showClock: true,
    showVatBreakdown: true,
    showPaymentMethods: true,
  },
  lines: [
    {
      lineId: "line-1",
      name: "Product",
      modifierLabels: [],
      quantity: 2,
      unitPriceCents: 1_000,
      lineTotalCents: 2_000,
    },
  ],
  totals: {
    subtotalCents: 2_000,
    discountCents: 200,
    giftCardCents: 300,
    totalCents: 1_800,
    remainingCents: 1_500,
    vat12Cents: 0,
    vat21Cents: 312,
    vatBreakdown: [{ rate: 21 as const, vatCents: 312 }],
  },
  acceptedPaymentMethods: ["cash" as const, "card" as const],
};

describe("customer display protocol", () => {
  it("accepts a financially consistent cart snapshot", () => {
    expect(customerDisplaySnapshotSchema.safeParse(validSnapshot).success).toBe(true);
  });

  it("rejects a line total that differs from quantity times unit price", () => {
    const snapshot = structuredClone(validSnapshot);
    snapshot.lines[0].lineTotalCents = 1_999;
    snapshot.totals.subtotalCents = 1_999;
    snapshot.totals.totalCents = 1_799;
    snapshot.totals.remainingCents = 1_499;
    expect(customerDisplaySnapshotSchema.safeParse(snapshot).success).toBe(false);
  });

  it("rejects a subtotal that differs from the visible lines", () => {
    const snapshot = structuredClone(validSnapshot);
    snapshot.totals.subtotalCents = 1_500;
    expect(customerDisplaySnapshotSchema.safeParse(snapshot).success).toBe(false);
  });

  it("rejects an incorrect amount still due", () => {
    const snapshot = structuredClone(validSnapshot);
    snapshot.totals.remainingCents = 1_499;
    expect(customerDisplaySnapshotSchema.safeParse(snapshot).success).toBe(false);
  });

  it("rejects malformed ACK messages instead of trusting the type field", () => {
    expect(parseCustomerDisplayMessage({ type: "ACK", revision: -1 })).toBeNull();
  });
});
