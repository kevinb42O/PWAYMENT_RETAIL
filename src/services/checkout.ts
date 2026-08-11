import { db } from "../db/db";
import {
  AuditEntry,
  Customer,
  GiftCard,
  GiftCardEvent,
  OrderItem,
  OutboxEntry,
  PaymentMethod,
  Product,
  Transaction,
} from "../types";
import { calculateTotals, Totals, UnsupportedVatRateError } from "../utils/vat";
import { isGiftCardExpired } from "../utils/giftCards";
import { getMerchantProfileSnapshot } from "../store/useMerchantProfile";
import { DEFAULT_REGISTER_ID, isGiftCardProduct } from "../utils/financial";

export type CheckoutErrorCode =
  | "empty-cart"
  | "busy"
  | "unsupported-vat"
  | "invalid-tender"
  | "gift-card-not-found"
  | "gift-card-inactive"
  | "gift-card-expired"
  | "gift-card-invalid-amount"
  | "gift-card-insufficient-balance"
  | "gift-card-exceeds-total"
  | "gift-card-product"
  | "insufficient-stock";

export class CheckoutError extends Error {
  readonly code: CheckoutErrorCode;

  constructor(code: CheckoutErrorCode, message: string) {
    super(message);
    this.name = "CheckoutError";
    this.code = code;
  }
}

export interface GiftCardAllocation {
  id: string;
  code: string;
  amountCents: number;
}

/** 'Split' is derived by the service, never accepted as input. */
export type TenderMethod = Exclude<PaymentMethod, "Split">;

const TENDER_METHODS: readonly TenderMethod[] = ["Cash", "PIN", "Cadeaubon"];

export interface CheckoutInput {
  /** Idempotency key — the same key can never produce a second sale. */
  clientRequestId: string;
  cartId: number;
  items: OrderItem[];
  discountCents: number;
  discountReason?: string;
  discountApprovedByUserId?: string;
  /** Gift cards applied to this sale, passed explicitly (never read from a store closure). */
  giftCards: GiftCardAllocation[];
  /** Tender used for whatever is left after the gift cards. */
  method: TenderMethod;
  tenderedCents?: number;
  customerId?: string;
  userId?: string;
  userName?: string;
}

export interface CheckoutResult {
  transaction: Transaction;
  /** True when the idempotency key already had a committed sale. */
  duplicate: boolean;
  updatedProducts: Product[];
  updatedGiftCards: GiftCard[];
  updatedCustomer?: Customer;
}

/** Merge repeated entries for the same card so one card can only be applied once. */
export const dedupeGiftCards = (
  allocations: GiftCardAllocation[],
): GiftCardAllocation[] => {
  const byId = new Map<string, GiftCardAllocation>();
  for (const alloc of allocations) {
    const existing = byId.get(alloc.id);
    if (existing) existing.amountCents += alloc.amountCents;
    else byId.set(alloc.id, { ...alloc });
  }
  return [...byId.values()];
};

let inFlight: {
  clientRequestId: string;
  promise: Promise<CheckoutResult>;
} | null = null;

/**
 * Commit a sale. Transaction, stock, gift-card debits, customer visit, audit
 * and outbox are written in one Dexie transaction: it either all lands or
 * nothing does. Printing is deliberately not part of this — call it only
 * after this resolves.
 */
export const finalizeCheckout = (
  input: CheckoutInput,
): Promise<CheckoutResult> => {
  if (inFlight) {
    if (inFlight.clientRequestId === input.clientRequestId)
      return inFlight.promise;
    return Promise.reject(
      new CheckoutError("busy", "Er loopt al een afrekening."),
    );
  }
  const promise = runCheckout(input).finally(() => {
    inFlight = null;
  });
  inFlight = { clientRequestId: input.clientRequestId, promise };
  return promise;
};

const runCheckout = async (input: CheckoutInput): Promise<CheckoutResult> => {
  if (input.items.length === 0) {
    throw new CheckoutError("empty-cart", "Winkelwagen is leeg.");
  }

  const liabilityLine = input.items.find((item) =>
    isGiftCardProduct(item.product),
  );
  if (liabilityLine) {
    throw new CheckoutError(
      "gift-card-product",
      `“${liabilityLine.product.name}” moet via Klanten → Cadeaubonnen worden uitgegeven; cadeaubonwaarde is geen productomzet.`,
    );
  }

  // tsconfig is not strict, so the TenderMethod type alone does not protect us.
  if (!TENDER_METHODS.includes(input.method)) {
    throw new CheckoutError(
      "invalid-tender",
      `Ongeldige betaalwijze "${input.method}".`,
    );
  }
  if (
    input.tenderedCents != null &&
    (!Number.isSafeInteger(input.tenderedCents) || input.tenderedCents < 0)
  ) {
    throw new CheckoutError("invalid-tender", "Ongeldig ontvangen bedrag.");
  }

  let totals: Totals;
  try {
    totals = calculateTotals(input.items, input.discountCents);
  } catch (err) {
    if (err instanceof UnsupportedVatRateError) {
      throw new CheckoutError("unsupported-vat", err.message);
    }
    throw err;
  }

  const allocations = dedupeGiftCards(input.giftCards);
  const now = Date.now();
  const merchantSnapshot = { ...getMerchantProfileSnapshot() };

  return db.transaction(
    "rw",
    [
      db.transactions,
      db.products,
      db.gift_cards,
      db.gift_card_events,
      db.customers,
      db.audit,
      db.outbox,
      db.shifts,
      db.stock_movements,
    ],
    async (): Promise<CheckoutResult> => {
      const existing = await db.transactions
        .where("clientRequestId")
        .equals(input.clientRequestId)
        .first();
      if (existing) {
        return {
          transaction: existing,
          duplicate: true,
          updatedProducts: [],
          updatedGiftCards: [],
        };
      }

      // Gift cards are re-read and re-validated here, inside the transaction,
      // against their live balance — never against a cached store copy.
      const debitedCards: GiftCard[] = [];
      const redemptionEvents: GiftCardEvent[] = [];
      let giftCardTotal = 0;
      for (const alloc of allocations) {
        const card = await db.gift_cards.get(alloc.id);
        if (!card) {
          throw new CheckoutError(
            "gift-card-not-found",
            `Cadeaubon ${alloc.code} bestaat niet.`,
          );
        }
        if (!card.isActive) {
          throw new CheckoutError(
            "gift-card-inactive",
            `Cadeaubon ${card.code} is geblokkeerd.`,
          );
        }
        if (isGiftCardExpired(card, now)) {
          throw new CheckoutError(
            "gift-card-expired",
            `Cadeaubon ${card.code} is verlopen.`,
          );
        }
        if (
          !Number.isSafeInteger(alloc.amountCents) ||
          alloc.amountCents <= 0
        ) {
          throw new CheckoutError(
            "gift-card-invalid-amount",
            `Ongeldig bedrag voor cadeaubon ${card.code}.`,
          );
        }
        if (alloc.amountCents > card.balanceCents) {
          throw new CheckoutError(
            "gift-card-insufficient-balance",
            `Cadeaubon ${card.code} heeft onvoldoende saldo.`,
          );
        }
        giftCardTotal += alloc.amountCents;
        const balanceAfterCents = card.balanceCents - alloc.amountCents;
        debitedCards.push({ ...card, balanceCents: balanceAfterCents });
        redemptionEvents.push({
          id: `gift-card-redeem-${input.clientRequestId}-${card.id}`,
          giftCardId: card.id,
          giftCardCode: card.code,
          type: "redeem",
          amountCents: alloc.amountCents,
          balanceBeforeCents: card.balanceCents,
          balanceAfterCents,
          timestamp: now,
          clientRequestId: input.clientRequestId,
          customerId: card.customerId,
          userId: input.userId,
          userName: input.userName,
          source: "live",
        });
      }

      if (giftCardTotal > totals.total) {
        throw new CheckoutError(
          "gift-card-exceeds-total",
          "Cadeaubonnen dekken meer dan het totaalbedrag.",
        );
      }

      const remainingCents = totals.total - giftCardTotal;
      if (input.method === "Cadeaubon" && remainingCents !== 0) {
        throw new CheckoutError(
          "invalid-tender",
          "Cadeaubonnen dekken het totaalbedrag niet volledig; kies een tweede betaalwijze voor het restant.",
        );
      }
      if (
        input.method === "Cash" &&
        input.tenderedCents != null &&
        input.tenderedCents < remainingCents
      ) {
        throw new CheckoutError(
          "invalid-tender",
          "Ontvangen bedrag is lager dan het te betalen restant.",
        );
      }

      const tenders: NonNullable<Transaction["tenders"]> = allocations.map(
        (a) => ({
          method: "Cadeaubon",
          amountCents: a.amountCents,
        }),
      );
      if (remainingCents > 0) {
        if (input.method === "Cadeaubon") {
          throw new CheckoutError(
            "invalid-tender",
            "Het resterende bedrag vereist Cash of PIN.",
          );
        }
        tenders.push({ method: input.method, amountCents: remainingCents });
      }
      const tenderSum = tenders.reduce(
        (sum, tender) => sum + tender.amountCents,
        0,
      );
      if (tenders.length === 0 || tenderSum !== totals.total) {
        throw new CheckoutError(
          "invalid-tender",
          `Tenders (${tenderSum}c) sluiten niet aan op het totaal (${totals.total}c).`,
        );
      }

      const paymentMethod: PaymentMethod =
        tenders.length === 1 ? tenders[0].method : "Split";

      let openShift = await db.shifts
        .filter(
          (row) =>
            row.registerId === DEFAULT_REGISTER_ID && row.status === "open",
        )
        .last();
      if (!openShift) {
        const lastShift = await db.shifts.orderBy("shiftNumber").last();
        const shiftId = await db.shifts.add({
          shiftNumber: (lastShift?.shiftNumber ?? 0) + 1,
          registerId: DEFAULT_REGISTER_ID,
          openedAt: now,
          openedByUserId: input.userId,
          openedByUserName: input.userName,
          openingFloatCents: 0,
          status: "open",
        });
        openShift = await db.shifts.get(shiftId);
      }

      const tx: Transaction = {
        clientRequestId: input.clientRequestId,
        tableId: input.cartId,
        items: input.items,
        subtotalCents: totals.subtotal,
        vat12Cents: totals.vat12,
        vat21Cents: totals.vat21,
        totalCents: totals.total,
        discountCents: totals.discount,
        discountReason: input.discountReason,
        discountApprovedByUserId: input.discountApprovedByUserId,
        tenderedCents: input.tenderedCents,
        paymentMethod,
        tenders,
        splitTenders: tenders.length > 1 ? tenders : undefined,
        giftCardAllocations: redemptionEvents.map((event) => ({
          giftCardId: event.giftCardId,
          code: event.giftCardCode,
          amountCents: event.amountCents,
          balanceAfterCents: event.balanceAfterCents,
        })),
        timestamp: now,
        isFinalized: 0,
        userId: input.userId,
        userName: input.userName,
        customerId: input.customerId,
        source: "live",
        kind: "sale",
        merchantSnapshot,
        registerId: DEFAULT_REGISTER_ID,
        shiftId: openShift?.id,
      };

      const id = (await db.transactions.add(tx)) as number;
      const documentNumber = `POS-${new Date(now).getFullYear()}-${String(id).padStart(8, "0")}`;
      const persisted: Transaction = { ...tx, id, documentNumber };
      await db.transactions.put(persisted);
      if (redemptionEvents.length > 0) {
        await db.gift_card_events.bulkAdd(
          redemptionEvents.map((event) => ({ ...event, transactionId: id })),
        );
      }

      const soldByProductId = new Map<string, number>();
      for (const item of input.items) {
        soldByProductId.set(
          item.product.id,
          (soldByProductId.get(item.product.id) ?? 0) + item.quantity,
        );
      }
      const updatedProducts: Product[] = [];
      for (const [productId, soldQty] of soldByProductId) {
        const current = await db.products.get(productId);
        if (!current || current.stockQty == null) continue;
        if (soldQty > current.stockQty) {
          throw new CheckoutError(
            "insufficient-stock",
            `Onvoldoende voorraad voor ${current.name}: ${current.stockQty} beschikbaar, ${soldQty} gevraagd.`,
          );
        }
        updatedProducts.push({
          ...current,
          stockQty: current.stockQty - soldQty,
        });
      }
      if (updatedProducts.length > 0)
        await db.products.bulkPut(updatedProducts);
      if (updatedProducts.length > 0) {
        await db.stock_movements.bulkAdd(
          updatedProducts.map((product) => ({
            productId: product.id,
            productName: product.name,
            quantityDelta: -(soldByProductId.get(product.id) ?? 0),
            reason: "pos-sale" as const,
            timestamp: now,
            transactionId: id,
            userId: input.userId,
            userName: input.userName,
          })),
        );
      }

      if (debitedCards.length > 0) await db.gift_cards.bulkPut(debitedCards);

      let updatedCustomer: Customer | undefined;
      if (input.customerId) {
        const customer = await db.customers.get(input.customerId);
        if (customer) {
          updatedCustomer = {
            ...customer,
            visitCount: customer.visitCount + 1,
            totalSpentCents: customer.totalSpentCents + totals.total,
            lastVisitAt: new Date(now).toISOString(),
          };
          await db.customers.put(updatedCustomer);
        }
      }

      const auditEntry: AuditEntry = {
        timestamp: now,
        userId: input.userId ?? null,
        userName: input.userName ?? null,
        action: "checkout",
        detail: {
          cartId: input.cartId,
          transactionId: id,
          clientRequestId: input.clientRequestId,
          totalCents: totals.total,
          discountCents: totals.discount,
          method: paymentMethod,
          giftCardCents: giftCardTotal,
          giftCards: allocations.map((allocation) => ({
            giftCardId: allocation.id,
            code: allocation.code,
            amountCents: allocation.amountCents,
          })),
          remainingCents,
        },
      };
      await db.audit.add(auditEntry);

      const outboxEntry: OutboxEntry = {
        timestamp: now,
        kind: "transaction",
        payload: persisted,
        attempts: 0,
      };
      await db.outbox.add(outboxEntry);

      return {
        transaction: persisted,
        duplicate: false,
        updatedProducts,
        updatedGiftCards: debitedCards,
        updatedCustomer,
      };
    },
  );
};
