import { describe, expect, it } from "vitest";
import type { Transaction } from "../types";
import { receiptPaymentRows } from "./receiptPayments";

const transaction = (over: Partial<Transaction>): Transaction => ({
  tableId: 1,
  items: [],
  subtotalCents: 15485,
  vat12Cents: 0,
  vat21Cents: 2687,
  totalCents: 15485,
  discountCents: 0,
  paymentMethod: "Split",
  timestamp: 0,
  isFinalized: 0,
  ...over,
});

describe("receiptPaymentRows", () => {
  it("prints each gift-card allocation exactly once in a split payment", () => {
    const rows = receiptPaymentRows(
      transaction({
        tenders: [
          { method: "Cadeaubon", amountCents: 910 },
          { method: "Cadeaubon", amountCents: 1250 },
          { method: "Cash", amountCents: 13325 },
        ],
        splitTenders: [
          { method: "Cadeaubon", amountCents: 910 },
          { method: "Cadeaubon", amountCents: 1250 },
          { method: "Cash", amountCents: 13325 },
        ],
        giftCardAllocations: [
          {
            giftCardId: "gc-1",
            code: "DEMO-001-7319",
            amountCents: 910,
            balanceAfterCents: 0,
          },
          {
            giftCardId: "gc-2",
            code: "DEMO-002-7456",
            amountCents: 1250,
            balanceAfterCents: 0,
          },
        ],
      }),
    );

    expect(rows).toEqual([
      { label: "Cadeaubon (DEMO-001-7319)", amountCents: 910, method: "Cadeaubon" },
      { label: "Cadeaubon (DEMO-002-7456)", amountCents: 1250, method: "Cadeaubon" },
      { label: "Cash", amountCents: 13325, method: "Cash" },
    ]);
    expect(rows.reduce((sum, row) => sum + row.amountCents, 0)).toBe(15485);
  });

  it("keeps legacy tender rows when allocation details are unavailable", () => {
    expect(
      receiptPaymentRows(
        transaction({
          tenders: [
            { method: "Cadeaubon", amountCents: 2160 },
            { method: "PIN", amountCents: 13325 },
          ],
        }),
      ),
    ).toEqual([
      { label: "Cadeaubon", amountCents: 2160, method: "Cadeaubon" },
      { label: "Kaart", amountCents: 13325, method: "PIN" },
    ]);
  });
});
