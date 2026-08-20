import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../db/db";
import { supabase } from "../lib/supabase";
import type { Transaction } from "../types";
import { synchronizeFinancialLedgerBeforeReport } from "./outboxWorker";

const transaction = (requestId = "close-race-1"): Transaction => ({
  id: 1,
  clientRequestId: requestId,
  tableId: 1,
  items: [
    {
      lineId: "line-1",
      product: {
        id: "product-1",
        name: "Testproduct",
        category: "test",
        priceCents: 1210,
        vatRate: 21,
      },
      quantity: 1,
    },
  ],
  subtotalCents: 1210,
  vat12Cents: 0,
  vat21Cents: 210,
  totalCents: 1210,
  discountCents: 0,
  paymentMethod: "PIN",
  tenders: [{ method: "PIN", amountCents: 1210 }],
  timestamp: 1_700_000_000_000,
  isFinalized: 0,
  source: "live",
  kind: "sale",
  registerId: "retail-register-1",
});

beforeEach(async () => {
  if (!db.isOpen()) await db.open();
  await db.outbox.clear();
  vi.restoreAllMocks();
});

describe("synchronizeFinancialLedgerBeforeReport", () => {
  it("pushes the local sale immediately instead of waiting for the outbox timer", async () => {
    const rpc = vi
      .spyOn(supabase, "rpc")
      .mockResolvedValue({ data: { duplicate: false }, error: null } as never);

    await synchronizeFinancialLedgerBeforeReport(
      "00000000-0000-0000-0000-000000000001",
      [transaction()],
      [],
    );

    expect(rpc).toHaveBeenCalledWith(
      "checkout_sale",
      expect.objectContaining({
        target_store_id: "00000000-0000-0000-0000-000000000001",
        payload: expect.objectContaining({ client_request_id: "close-race-1" }),
      }),
    );
  });

  it("sends split Cash/PIN tenders without folding gift-card value into a fake terminal payment", async () => {
    const row: Transaction = {
      ...transaction("split-tender-contract"),
      totalCents: 1402,
      roundingAdjustmentCents: -2,
      paymentMethod: "Split",
      tenders: [
        { method: "Cadeaubon", amountCents: 400 },
        { method: "PIN", amountCents: 200 },
        { method: "Cash", amountCents: 800 },
      ],
      giftCardAllocations: [{
        giftCardId: "gift-1",
        code: "PW-GIFT-1",
        amountCents: 400,
      }],
      tenderedCents: 802,
    };
    const rpc = vi.spyOn(supabase, "rpc").mockResolvedValue({
      data: { duplicate: false },
      error: null,
    } as never);

    await synchronizeFinancialLedgerBeforeReport(
      "00000000-0000-0000-0000-000000000001",
      [row],
      [],
    );

    expect(rpc).toHaveBeenCalledWith(
      "checkout_sale",
      expect.objectContaining({
        payload: expect.objectContaining({
          method: "Split",
          tenders: [
            { method: "PIN", amount_cents: 200 },
            { method: "Cash", amount_cents: 800 },
          ],
          gift_cards: [{ id: "gift-1", code: "PW-GIFT-1", amount_cents: 400 }],
          tendered_cents: 802,
        }),
      }),
    );
  });

  it("does not send a cash-received field for a PIN-only sale", async () => {
    const rpc = vi.spyOn(supabase, "rpc").mockResolvedValue({
      data: { duplicate: false },
      error: null,
    } as never);

    await synchronizeFinancialLedgerBeforeReport(
      "00000000-0000-0000-0000-000000000001",
      [transaction("pin-only-contract")],
      [],
    );

    const [, args] = rpc.mock.calls[0];
    expect((args as { payload: Record<string, unknown> }).payload).not.toHaveProperty("tendered_cents");
    expect((args as { payload: Record<string, unknown> }).payload).toMatchObject({
      tenders: [{ method: "PIN", amount_cents: 1210 }],
    });
  });

  it("removes the matching outbox entry only after server confirmation", async () => {
    const row = transaction("close-race-2");
    await db.outbox.add({
      timestamp: row.timestamp,
      kind: "transaction",
      payload: row,
      attempts: 0,
    });
    vi.spyOn(supabase, "rpc").mockResolvedValue({
      data: { duplicate: false },
      error: null,
    } as never);

    await synchronizeFinancialLedgerBeforeReport(
      "00000000-0000-0000-0000-000000000001",
      [row],
      [],
    );

    expect(await db.outbox.count()).toBe(0);
  });

  it("keeps the outbox retry when server synchronization fails", async () => {
    const row = transaction("close-race-3");
    await db.outbox.add({
      timestamp: row.timestamp,
      kind: "transaction",
      payload: row,
      attempts: 0,
    });
    vi.spyOn(supabase, "rpc").mockResolvedValue({
      data: null,
      error: { message: "checkout:product-not-found:Product ontbreekt." },
    } as never);

    await expect(
      synchronizeFinancialLedgerBeforeReport(
        "00000000-0000-0000-0000-000000000001",
        [row],
        [],
      ),
    ).rejects.toThrow("Product ontbreekt");
    expect(await db.outbox.count()).toBe(1);
  });

  it("does not let a known rejected sale enter a server-authoritative Z-close", async () => {
    const row = transaction("close-race-dead-letter");
    const rpc = vi.spyOn(supabase, "rpc");
    await db.outbox.add({
      timestamp: row.timestamp,
      kind: "transaction",
      payload: row,
      attempts: 5,
      deliveryStatus: "dead_letter",
      requiresManualResolution: true,
      lastError: "checkout:product-not-found:Product ontbreekt.",
    });

    await expect(
      synchronizeFinancialLedgerBeforeReport(
        "00000000-0000-0000-0000-000000000001",
        [row],
        [],
      ),
    ).rejects.toThrow("Herstelwachtrij");
    expect(rpc).not.toHaveBeenCalled();
  });
});
