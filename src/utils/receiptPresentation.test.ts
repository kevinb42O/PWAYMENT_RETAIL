import { describe, expect, it } from "vitest";
import type { Transaction } from "../types";
import {
  receiptDiscountLabel,
  receiptDocumentReference,
  receiptFingerprint,
  receiptItemDescription,
  wrapReceiptText,
} from "./receiptPresentation";

const transaction = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: 42,
  tableId: 3,
  items: [],
  subtotalCents: 1000,
  vat12Cents: 0,
  vat21Cents: 174,
  totalCents: 1000,
  discountCents: 0,
  paymentMethod: "PIN",
  timestamp: 0,
  isFinalized: 1,
  ...overrides,
});

describe("receipt presentation", () => {
  it("uses the issued document number instead of the local transaction id", () => {
    expect(receiptDocumentReference(transaction({ documentNumber: "POS-2026-00000042" })))
      .toBe("POS-2026-00000042");
  });

  it("labels old records clearly while retaining a stable lookup", () => {
    const legacy = transaction();
    expect(receiptDocumentReference(legacy)).toBe("LEGACY-00042");
    expect(receiptFingerprint(legacy, "20260822-120000"))
      .toBe("20260822-120000-R3-LEGACY-00042");
  });

  it("keeps private discount reasons out of the customer-facing label", () => {
    expect(receiptDiscountLabel()).toBe("Korting");
  });

  it("preserves variants and every word when descriptions wrap", () => {
    expect(receiptItemDescription({
      lineId: "line-1",
      quantity: 1,
      product: { id: "deck", name: "Deck", category: "Skate", priceCents: 1000, vatRate: 21, variant: "8.25 inch" },
    })).toBe("Deck — 8.25 inch");
    expect(wrapReceiptText("Eén zeer lange productomschrijving", 8).join("").replace(/\s/g, ""))
      .toContain("productomschrijving");
  });
});
