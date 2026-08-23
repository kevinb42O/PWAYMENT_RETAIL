import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../db/db";
import { supabase } from "../lib/supabase";
import { useAuth } from "../auth/useAuth";
import type { Transaction } from "../types";
import { discardUndeliveredLocalSale, recoverKnownOutboxClientDefects, synchronizeFinancialLedgerBeforeReport } from "./outboxWorker";

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
  it("automatically releases sales stopped by the historic detached-rpc defect", async () => {
    const affectedId = await db.outbox.add({
      timestamp: Date.now(),
      kind: "transaction",
      payload: transaction("detached-rpc-recovery"),
      attempts: 5,
      deliveryStatus: "dead_letter",
      requiresManualResolution: true,
      lastError: "Cannot read properties of undefined (reading 'rest')",
    });
    const unrelatedId = await db.outbox.add({
      timestamp: Date.now(),
      kind: "transaction",
      payload: transaction("business-rejection"),
      attempts: 5,
      deliveryStatus: "dead_letter",
      requiresManualResolution: true,
      lastError: "checkout:insufficient-stock",
    });

    await expect(recoverKnownOutboxClientDefects()).resolves.toBe(1);
    await expect(db.outbox.get(affectedId)).resolves.toMatchObject({
      deliveryStatus: "pending",
      requiresManualResolution: false,
    });
    await expect(db.outbox.get(unrelatedId)).resolves.toMatchObject({
      deliveryStatus: "dead_letter",
      requiresManualResolution: true,
    });
  });

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
    // Regression: SupabaseClient.rpc depends on its object receiver (`this`).
    // A detached call never reaches HTTP and used to dead-letter every sale.
    expect(rpc.mock.contexts[0]).toBe(supabase);
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

  it("records the Mollie reconciliation reference after the server sale exists", async () => {
    const row = {
      ...transaction("mollie-reference-contract"),
      paymentProvider: "mollie" as const,
      paymentProviderReference: "tr_terminal123",
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

    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      "checkout_sale",
      "record_payment_provider_reference",
    ]);
    expect(rpc).toHaveBeenLastCalledWith("record_payment_provider_reference", {
      target_store_id: "00000000-0000-0000-0000-000000000001",
      request_id: "mollie-reference-contract",
      provider_name: "mollie",
      provider_reference: "tr_terminal123",
    });
  });

  it("books historic simulator sales without presenting their local id as a Mollie reference", async () => {
    const row = {
      ...transaction("mollie-simulator-contract"),
      paymentProvider: "mollie" as const,
      paymentProviderReference: "sim_12345678123441238123123456789abc",
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

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][0]).toBe("checkout_sale");
    const payload = (rpc.mock.calls[0][1] as { payload: Record<string, unknown> }).payload;
    expect(payload).not.toHaveProperty("payment_provider");
    expect(payload).not.toHaveProperty("payment_provider_reference");
  });

  it("recovers a refund's original server sale when the local parent row is gone", async () => {
    const row: Transaction = {
      ...transaction("orphaned-refund-contract"),
      id: 92,
      kind: "refund",
      originalTransactionId: 999_999,
      totalCents: -1210,
      subtotalCents: -1210,
      vat21Cents: -210,
      tenders: [{ method: "PIN", amountCents: -1210 }],
      correctionReason: "Testretour",
      returnDisposition: "defective",
    };
    vi.spyOn(supabase, "from").mockImplementation(((table: string) => {
      if (table === "transaction_lines") {
        return {
          select: () => ({
            eq: () => ({
              in: async () => ({
                data: [{ transaction_id: "server-sale-id", line_external_id: "line-1" }],
                error: null,
              }),
            }),
          }),
        };
      }
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { client_request_id: "server-original-request", kind: "sale" },
                error: null,
              }),
            }),
          }),
        }),
      };
    }) as unknown as typeof supabase.from);
    const rpc = vi.spyOn(supabase, "rpc").mockResolvedValue({
      data: { duplicate: false },
      error: null,
    } as never);

    await synchronizeFinancialLedgerBeforeReport(
      "00000000-0000-0000-0000-000000000001",
      [row],
      [],
    );

    expect(rpc).toHaveBeenCalledWith("refund_sale", expect.objectContaining({
      payload: expect.objectContaining({
        original_client_request_id: "server-original-request",
        disposition: "defective",
      }),
    }));
  });

  it("recovers a stale queued transaction snapshot from the canonical local ledger", async () => {
    const row = {
      ...transaction("recovered-outbox-contract"),
      id: 91,
      paymentProvider: "mollie" as const,
      paymentProviderReference: "sim_12345678123441238123123456789abc",
    };
    await db.transactions.put(row);
    const outboxId = await db.outbox.add({
      timestamp: row.timestamp,
      kind: "transaction",
      payload: { id: 91, clientRequestId: row.clientRequestId },
      attempts: 5,
      deliveryStatus: "dead_letter",
    });
    const rpc = vi.spyOn(supabase, "rpc").mockResolvedValue({
      data: { duplicate: false },
      error: null,
    } as never);
    useAuth.setState({ currentStoreId: "00000000-0000-0000-0000-000000000001" });

    const { retryOutboxEntryNow } = await import("./outboxWorker");
    const result = await retryOutboxEntryNow(outboxId);

    expect(result.delivered).toBe(true);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(await db.outbox.count()).toBe(0);
  });

  it("safely removes an explicitly confirmed undelivered local test sale and restores its stock", async () => {
    const row = {
      ...transaction("discard-simulator-contract"),
      id: 93,
    };
    await db.transactions.put(row);
    await db.products.put({ ...row.items[0].product, stockQty: 4 });
    await db.stock_movements.add({
      productId: row.items[0].product.id,
      productName: row.items[0].product.name,
      quantityDelta: -1,
      reason: "pos-sale",
      timestamp: row.timestamp,
      transactionId: row.id,
    });
    const outboxId = await db.outbox.add({
      timestamp: row.timestamp,
      kind: "transaction",
      payload: row,
      attempts: 5,
      deliveryStatus: "dead_letter",
    });
    useAuth.setState({
      currentStoreId: "00000000-0000-0000-0000-000000000001",
      currentUserId: "user-1",
      currentUserName: "Eigenaar",
    });
    vi.spyOn(supabase, "from").mockReturnValue({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
      }),
    } as never);

    await discardUndeliveredLocalSale(outboxId);

    expect(await db.transactions.get(row.id)).toBeUndefined();
    expect(await db.outbox.get(outboxId)).toBeUndefined();
    expect((await db.products.get(row.items[0].product.id))?.stockQty).toBe(5);
    expect(await db.stock_movements.where("transactionId").equals(row.id).count()).toBe(0);
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
