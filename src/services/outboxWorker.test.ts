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
});
