import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../db/db";
import { Customer, Product, Transaction } from "../types";
import { createRefund, RefundError } from "./refunds";

const product: Product = {
  id: "deck-refund",
  name: "Deck",
  category: "decks",
  priceCents: 1210,
  costPriceCents: 500,
  vatRate: 21,
  stockQty: 3,
  productType: "merchandise",
};
const customer: Customer = {
  id: "customer-refund",
  name: "Retourklant",
  totalSpentCents: 2420,
  visitCount: 1,
  createdAt: new Date().toISOString(),
  isActive: true,
};

beforeEach(async () => {
  if (!db.isOpen()) await db.open();
  await Promise.all([
    db.transactions.clear(),
    db.products.clear(),
    db.stock_movements.clear(),
    db.gift_cards.clear(),
    db.gift_card_events.clear(),
    db.customers.clear(),
    db.audit.clear(),
    db.outbox.clear(),
    db.shifts.clear(),
  ]);
  await db.products.put(product);
  await db.customers.put(customer);
});

describe("createRefund", () => {
  it("creates a linked partial correction and restores stock and customer value atomically", async () => {
    const original: Transaction = {
      clientRequestId: "sale-refund-source",
      tableId: 1,
      items: [{ lineId: "line-1", product, quantity: 2 }],
      subtotalCents: 2420,
      discountCents: 0,
      totalCents: 2420,
      vat12Cents: 0,
      vat21Cents: 420,
      paymentMethod: "PIN",
      tenders: [{ method: "PIN", amountCents: 2420 }],
      timestamp: Date.now() - 1000,
      isFinalized: 1,
      source: "live",
      kind: "sale",
      customerId: customer.id,
      registerId: "retail-register-1",
    };
    const originalId = await db.transactions.add(original);
    const refund = await createRefund({
      clientRequestId: "refund-1",
      originalTransactionId: originalId,
      lines: [{ lineId: "line-1", quantity: 1 }],
      method: "PIN",
      reason: "Ongebruikt geretourneerd",
    });
    expect(refund).toMatchObject({
      kind: "refund",
      originalTransactionId: originalId,
      totalCents: -1210,
      vat21Cents: -210,
      paymentMethod: "PIN",
    });
    expect((await db.products.get(product.id))?.stockQty).toBe(4);
    expect((await db.customers.get(customer.id))?.totalSpentCents).toBe(1210);
    expect(
      await db.stock_movements
        .where("transactionId")
        .equals(refund.id!)
        .first(),
    ).toMatchObject({ quantityDelta: 1, reason: "pos-refund" });
  });

  it("prevents refunding more than the quantity still available", async () => {
    const originalId = await db.transactions.add({
      clientRequestId: "sale-refund-limit",
      tableId: 1,
      items: [{ lineId: "line-1", product, quantity: 1 }],
      subtotalCents: 1210,
      discountCents: 0,
      totalCents: 1210,
      vat12Cents: 0,
      vat21Cents: 210,
      paymentMethod: "Cash",
      tenders: [{ method: "Cash", amountCents: 1210 }],
      timestamp: Date.now(),
      isFinalized: 1,
      source: "live",
      kind: "sale",
    });
    await createRefund({
      clientRequestId: "refund-limit-1",
      originalTransactionId: originalId,
      lines: [{ lineId: "line-1", quantity: 1 }],
      method: "Cash",
      reason: "Eerste retour",
    });
    await expect(
      createRefund({
        clientRequestId: "refund-limit-2",
        originalTransactionId: originalId,
        lines: [{ lineId: "line-1", quantity: 1 }],
        method: "Cash",
        reason: "Tweede retour",
      }),
    ).rejects.toBeInstanceOf(RefundError);
  });

  it("keeps a quarantined return out of sellable stock while preserving the financial credit", async () => {
    const originalId = await db.transactions.add({
      clientRequestId: "sale-refund-quarantine",
      tableId: 1,
      items: [{ lineId: "line-1", product, quantity: 1 }],
      subtotalCents: 1210,
      discountCents: 0,
      totalCents: 1210,
      vat12Cents: 0,
      vat21Cents: 210,
      paymentMethod: "PIN",
      tenders: [{ method: "PIN", amountCents: 1210 }],
      timestamp: Date.now(),
      isFinalized: 1,
      source: "live",
      kind: "sale",
    });

    const refund = await createRefund({
      clientRequestId: "refund-quarantine",
      originalTransactionId: originalId,
      lines: [{ lineId: "line-1", quantity: 1 }],
      method: "PIN",
      reason: "Inspectie vereist",
      disposition: "quarantine",
    });

    expect(refund).toMatchObject({
      kind: "refund",
      totalCents: -1210,
      returnDisposition: "quarantine",
    });
    expect((await db.products.get(product.id))?.stockQty).toBe(3);
    expect(await db.stock_movements.count()).toBe(0);
    expect(await db.audit.orderBy("id").last()).toMatchObject({
      action: "refund.create",
      detail: expect.objectContaining({ disposition: "quarantine" }),
    });
  });
});
