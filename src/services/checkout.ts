import { db } from "../db/db";
import { useAuth } from "../auth/useAuth";
import {
  AuditEntry,
  Customer,
  GiftCard,
  GiftCardEvent,
  OrderItem,
  PaymentTender,
  OutboxEntry,
  PaymentMethod,
  Product,
  SaleDocumentRequest,
  Transaction,
} from "../types";
import { calculateTotals, Totals, UnsupportedVatRateError } from "../utils/vat";
import { isGiftCardExpired } from "../utils/giftCards";
import { getMerchantProfileSnapshot } from "../store/useMerchantProfile";
import { DEFAULT_REGISTER_ID, isGiftCardProduct } from "../utils/financial";
import type { Json } from "../types/database.generated";
import {
  currentMigrationTransactionContext,
  recordMeaningfulActivity,
} from "./migrationActivity";
import { synchronizeMigrationNow } from "./migrationSync";
import { synchronizeFinancialLedgerBeforeReport } from "./outboxWorker";
import { isSupabaseConfigured } from "../lib/supabase";
import { generateReceiptBarcode } from "../utils/receiptBarcode";
import {
  cashRoundingAdjustmentCents,
  MAX_CASH_PAYMENT_CENTS,
  roundCashSettlementCents,
} from "../utils/cashRounding";
import { assertRetailVatServerSupport } from "./retailPlatformCapabilities";

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
  | "insufficient-stock"
  | "product-not-found"
  | "customer-not-found"
  | "not-authenticated"
  | "forbidden"
  | "invalid-request";

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

/**
 * A cashier-composed tender. Gift-card value is deliberately excluded here:
 * it must always be backed by a concrete GiftCardAllocation so balance and
 * ledger events remain atomic with the sale.
 */
export type CheckoutTenderInput = Omit<PaymentTender, "method"> & {
  method: "Cash" | "PIN";
};

export interface CheckoutInput {
  /** Idempotency key — the same key can never produce a second sale. */
  clientRequestId: string;
  cartId: number;
  items: OrderItem[];
  discountCents: number;
  discountReason?: string;
  discountApprovedByUserId?: string;
  /** Server-issued manager approval for a cashier-originated discount. */
  discountApprovalId?: string;
  /** Gift cards applied to this sale, passed explicitly (never read from a store closure). */
  giftCards: GiftCardAllocation[];
  /** Tender used for whatever is left after the gift cards. */
  method: TenderMethod;
  /** Confirmed PSP proof supplied only after the electronic tender succeeded. */
  paymentProvider?: "mollie";
  paymentProviderReference?: string;
  /**
   * Explicit cash/card allocation for a combined payment. When omitted, the
   * legacy `method` covers the remaining amount exactly as before.
   */
  tenders?: CheckoutTenderInput[];
  tenderedCents?: number;
  customerId?: string;
  userId?: string;
  userName?: string;
  documentRequest?: SaleDocumentRequest;
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
  const storeId = useAuth.getState().currentStoreId;
  const promise = runCheckout(input, storeId)
    .then(async (result) => {
      // The sale is already committed locally. When online, wait for its
      // idempotent server acknowledgement too: a refresh must never make a
      // completed checkout appear to vanish while the background outbox waits.
      // A failed acknowledgement deliberately leaves the local sale and its
      // outbox row intact for the retry worker.
      if (
        storeId &&
        !result.duplicate &&
        isSupabaseConfigured &&
        globalThis.navigator?.onLine !== false
      ) {
        try {
          await synchronizeFinancialLedgerBeforeReport(
            storeId,
            [result.transaction],
            [],
          );
        } catch (error) {
          console.warn(
            "Checkout blijft lokaal bewaard; onmiddellijke serverbevestiging mislukt:",
            error,
          );
        }
      }
      // Keep the migration seal in the background; it must not delay checkout.
      if (storeId) void synchronizeMigrationNow(storeId);
      return result;
    })
    .finally(() => {
      inFlight = null;
    });
  inFlight = { clientRequestId: input.clientRequestId, promise };
  return promise;
};

const validateDocumentRequest = (
  request: SaleDocumentRequest | undefined,
): SaleDocumentRequest => {
  const normalized: SaleDocumentRequest = request ?? { type: "receipt" };
  if (normalized.type === "receipt") return { type: "receipt" };

  const recipient = normalized.recipient;
  if (!recipient) {
    throw new CheckoutError("invalid-request", "Facturatiegegevens ontbreken.");
  }
  const required = [recipient.name, recipient.addressLine1, recipient.postalCode, recipient.city, recipient.countryCode];
  if (required.some((value) => !value?.trim())) {
    throw new CheckoutError(
      "invalid-request",
      "Vul naam, adres, postcode, plaats en land in voor de factuur.",
    );
  }
  if (normalized.type === "invoice-b2b" && !recipient.vatNumber?.trim()) {
    throw new CheckoutError("invalid-request", "Een btw-nummer is verplicht voor een B2B-factuur.");
  }
  return {
    type: normalized.type,
    recipient: {
      ...recipient,
      name: recipient.name.trim(),
      companyName: recipient.companyName?.trim() || undefined,
      addressLine1: recipient.addressLine1.trim(),
      postalCode: recipient.postalCode.trim(),
      city: recipient.city.trim(),
      countryCode: recipient.countryCode.trim().toUpperCase(),
      vatNumber: recipient.vatNumber?.trim().toUpperCase() || undefined,
      email: recipient.email?.trim().toLocaleLowerCase("nl-BE") || undefined,
      purchaseOrderReference: recipient.purchaseOrderReference?.trim() || undefined,
    },
  };
};



const runCheckout = async (
  input: CheckoutInput,
  storeId: string | null,
): Promise<CheckoutResult> => {
  if (input.items.length === 0) {
    throw new CheckoutError("empty-cart", "Winkelwagen is leeg.");
  }

  const liabilityLine = input.items.find((item) =>
    isGiftCardProduct(item.product),
  );
  if (liabilityLine && !liabilityLine.giftCardOperation) {
    throw new CheckoutError(
      "gift-card-product",
      `“${liabilityLine.product.name}” heeft geen geldige cadeaubonopdracht. Start uitgifte of oplading vanuit Klanten → Cadeaubonnen.`,
    );
  }
  if (input.items.some((item) => item.giftCardOperation && !isGiftCardProduct(item.product))) {
    throw new CheckoutError("invalid-request", "Een cadeaubonopdracht moet een cadeaubonproduct zijn.");
  }
  if (liabilityLine && input.discountCents > 0) {
    throw new CheckoutError("invalid-request", "Geef geen korting op een cadeaubon. Pas het op te laden bedrag aan.");
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
  if (input.tenders?.some(
    (tender) =>
      !["Cash", "PIN"].includes(tender.method) ||
      !Number.isSafeInteger(tender.amountCents) ||
      tender.amountCents <= 0,
  )) {
    throw new CheckoutError(
      "invalid-tender",
      "Elke deelbetaling moet een positief cash- of kaartbedrag hebben.",
    );
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

  try {
    await assertRetailVatServerSupport(
      storeId,
      totals.vatBreakdown.map((line) => line.rate),
    );
  } catch (err) {
    throw new CheckoutError(
      "unsupported-vat",
      err instanceof Error ? err.message : "De centrale retail-btwversie kon niet worden bevestigd.",
    );
  }

  const allocations = dedupeGiftCards(input.giftCards);
  const now = Date.now();
  const documentRequest = validateDocumentRequest(input.documentRequest);
  // Policy objects must be frozen with the sale. A later settings change may
  // never rewrite the commercial deadline that applied at checkout time.
  const merchantSnapshot = structuredClone(getMerchantProfileSnapshot());

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
      db.migration_activations,
      db.migration_activity_locks,
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
      const creditedCards: GiftCard[] = [];
      const creditEvents: GiftCardEvent[] = [];
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

      // Gift-card value is sold through this same checkout, but remains a
      // liability. The card mutation is intentionally staged inside the same
      // Dexie transaction and only persisted after the sale has an ID.
      const giftCardOperations = input.items
        .map((item) => ({ item, operation: item.giftCardOperation }))
        .filter((entry): entry is { item: OrderItem; operation: NonNullable<OrderItem["giftCardOperation"]> } => Boolean(entry.operation));
      if (giftCardOperations.length > 0 && allocations.length > 0) {
        throw new CheckoutError("invalid-request", "Een cadeaubon kan niet met cadeaubonwaarde worden opgeladen.");
      }
      for (const { item, operation } of giftCardOperations) {
        const amountCents = item.product.priceCents * item.quantity;
        if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || item.quantity !== 1) {
          throw new CheckoutError("gift-card-invalid-amount", "Een cadeaubon moet één positief oplaadbedrag hebben.");
        }
        if (operation.action === "issue") {
          const expiresAt = operation.expiresAt ? Date.parse(operation.expiresAt) : NaN;
          if (!Number.isFinite(expiresAt) || expiresAt <= now) {
            throw new CheckoutError("invalid-request", "Een nieuwe cadeaubon heeft een geldige toekomstige vervaldatum nodig.");
          }
          const duplicate = await db.gift_cards
            .filter((card) => card.code.replace(/[\s-]/g, "").toUpperCase() === operation.code.replace(/[\s-]/g, "").toUpperCase())
            .first();
          if (duplicate) throw new CheckoutError("invalid-request", `Cadeauboncode ${operation.code} bestaat al.`);
          const card: GiftCard = {
            id: operation.cardId,
            code: operation.code.trim().toUpperCase(),
            customerId: operation.customerId,
            initialCents: amountCents,
            balanceCents: amountCents,
            issuedAt: new Date(now).toISOString(),
            expiresAt: operation.expiresAt,
            isActive: true,
          };
          creditedCards.push(card);
          creditEvents.push({
            id: `gift-card-issue-${input.clientRequestId}-${card.id}`,
            giftCardId: card.id, giftCardCode: card.code, type: "issue", amountCents,
            balanceBeforeCents: 0, balanceAfterCents: amountCents, timestamp: now,
            clientRequestId: input.clientRequestId, customerId: card.customerId,
            userId: input.userId, userName: input.userName, source: "live",
          });
        } else {
          const card = await db.gift_cards.get(operation.cardId);
          if (!card) throw new CheckoutError("gift-card-not-found", `Cadeaubon ${operation.code} bestaat niet.`);
          if (!card.isActive) throw new CheckoutError("gift-card-inactive", `Cadeaubon ${card.code} is geblokkeerd.`);
          if (isGiftCardExpired(card, now)) throw new CheckoutError("gift-card-expired", `Cadeaubon ${card.code} is verlopen.`);
          const next = { ...card, balanceCents: card.balanceCents + amountCents };
          creditedCards.push(next);
          creditEvents.push({
            id: `gift-card-recharge-${input.clientRequestId}-${card.id}`,
            giftCardId: card.id, giftCardCode: card.code, type: "recharge", amountCents,
            balanceBeforeCents: card.balanceCents, balanceAfterCents: next.balanceCents, timestamp: now,
            clientRequestId: input.clientRequestId, customerId: card.customerId,
            userId: input.userId, userName: input.userName, source: "live",
          });
        }
      }

      if (giftCardTotal > totals.total) {
        throw new CheckoutError(
          "gift-card-exceeds-total",
          "Cadeaubonnen dekken meer dan het totaalbedrag.",
        );
      }

      const remainingCents = totals.total - giftCardTotal;
      const hasExplicitTenders = input.tenders != null;
      const explicitTenders = input.tenders ?? [];
      let requestedTenders: CheckoutTenderInput[] = [];
      let cashPaymentRequested = false;
      let commercialCashDueCents = 0;
      let cashDueCents = 0;
      let roundingAdjustmentCents = 0;

      if (!hasExplicitTenders && input.method === "Cadeaubon" && remainingCents !== 0) {
        throw new CheckoutError(
          "invalid-tender",
          "Cadeaubonnen dekken het totaalbedrag niet volledig; kies een tweede betaalwijze voor het restant.",
        );
      }

      if (hasExplicitTenders) {
        const pinTotalCents = explicitTenders
          .filter((tender) => tender.method === "PIN")
          .reduce((sum, tender) => sum + tender.amountCents, 0);
        const suppliedCashCents = explicitTenders
          .filter((tender) => tender.method === "Cash")
          .reduce((sum, tender) => sum + tender.amountCents, 0);
        cashPaymentRequested = explicitTenders.some(
          (tender) => tender.method === "Cash",
        );

        if (input.method === "Cadeaubon" && remainingCents !== 0) {
          throw new CheckoutError(
            "invalid-tender",
            "Kies Cash of PIN voor het resterende bedrag.",
          );
        }
        if (cashPaymentRequested) {
          commercialCashDueCents = remainingCents - pinTotalCents;
          if (commercialCashDueCents < 0) {
            throw new CheckoutError(
              "invalid-tender",
              "De kaartdeelbetaling is hoger dan het resterende bedrag.",
            );
          }
          cashDueCents = roundCashSettlementCents(commercialCashDueCents);
          roundingAdjustmentCents = cashRoundingAdjustmentCents(
            commercialCashDueCents,
          );
          if (suppliedCashCents !== cashDueCents) {
            throw new CheckoutError(
              "invalid-tender",
              `Het cashdeel moet na 5-centafronding ${cashDueCents}c zijn (niet ${suppliedCashCents}c).`,
            );
          }
          requestedTenders = explicitTenders;
        } else {
          if (pinTotalCents !== remainingCents) {
            throw new CheckoutError(
              "invalid-tender",
              `Deelbetalingen (${pinTotalCents}c) sluiten niet aan op het resterende bedrag (${remainingCents}c).`,
            );
          }
          requestedTenders = explicitTenders;
        }
      } else if (remainingCents > 0 && input.method === "Cash") {
        cashPaymentRequested = true;
        commercialCashDueCents = remainingCents;
        cashDueCents = roundCashSettlementCents(commercialCashDueCents);
        roundingAdjustmentCents = cashRoundingAdjustmentCents(
          commercialCashDueCents,
        );
        requestedTenders = [{ method: "Cash", amountCents: cashDueCents }];
      } else if (remainingCents > 0 && input.method === "PIN") {
        requestedTenders = [{ method: "PIN", amountCents: remainingCents }];
      }

      if (
        cashPaymentRequested &&
        cashDueCents > MAX_CASH_PAYMENT_CENTS
      ) {
        throw new CheckoutError(
          "invalid-tender",
          "Een cashbetaling mag maximaal €3.000,00 bedragen. Kies voor het restant een elektronische betaalwijze.",
        );
      }

      const normalizedTenderedCents = cashPaymentRequested
        ? input.tenderedCents ?? cashDueCents
        : undefined;
      if (!cashPaymentRequested && input.tenderedCents != null) {
        throw new CheckoutError(
          "invalid-tender",
          "Een ontvangen cashbedrag kan alleen bij een cashbetaling worden opgegeven.",
        );
      }
      if (
        normalizedTenderedCents != null &&
        normalizedTenderedCents < cashDueCents
      ) {
        throw new CheckoutError(
          "invalid-tender",
          "Ontvangen cashbedrag is lager dan het afgeronde cashbedrag.",
        );
      }
      if (
        normalizedTenderedCents != null &&
        normalizedTenderedCents > MAX_CASH_PAYMENT_CENTS
      ) {
        throw new CheckoutError(
          "invalid-tender",
          "Een cashbetaling mag maximaal €3.000,00 bedragen. Kies voor het restant een elektronische betaalwijze.",
        );
      }
      const tenders: NonNullable<Transaction["tenders"]> = allocations.map(
        (a) => ({
          method: "Cadeaubon",
          amountCents: a.amountCents,
        }),
      );
      tenders.push(...requestedTenders);
      const tenderSum = tenders.reduce(
        (sum, tender) => sum + tender.amountCents,
        0,
      );
      const settlementTotalCents = totals.total + roundingAdjustmentCents;
      if (
        tenders.length === 0 ||
        tenderSum !== settlementTotalCents
      ) {
        throw new CheckoutError(
          "invalid-tender",
          `Tenders (${tenderSum}c) sluiten niet aan op het te vereffenen bedrag (${settlementTotalCents}c).`,
        );
      }

      const paymentMethod: PaymentMethod =
        cashPaymentRequested &&
        (allocations.length > 0 || requestedTenders.some((tender) => tender.method === "PIN"))
          ? "Split"
          : cashPaymentRequested
            ? "Cash"
            : tenders.length === 1
              ? tenders[0].method
              : "Split";

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
        vatBreakdown: totals.vatBreakdown,
        vat12Cents: totals.vat12,
        vat21Cents: totals.vat21,
        roundingAdjustmentCents,
        totalCents: totals.total,
        discountCents: totals.discount,
        discountReason: input.discountReason,
        discountApprovedByUserId: input.discountApprovedByUserId,
        discountApprovalId: input.discountApprovalId,
        tenderedCents: normalizedTenderedCents,
        paymentMethod,
        paymentProvider: input.paymentProvider,
        paymentProviderReference: input.paymentProviderReference,
        tenders,
        splitTenders: paymentMethod === "Split" ? tenders : undefined,
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
        receiptBarcode: generateReceiptBarcode(),
        receiptBarcodeVersion: 1,
        documentRequest,
        merchantSnapshot,
        registerId: DEFAULT_REGISTER_ID,
        shiftId: openShift?.id,
      };

      const id = (await db.transactions.add(tx)) as number;
      const documentNumber = `POS-${new Date(now).getFullYear()}-${String(id).padStart(8, "0")}`;
      const invoiceNumber = documentRequest.type === "receipt"
        ? undefined
        : `INV-${new Date(now).getFullYear()}-${String(id).padStart(8, "0")}`;
      const persisted: Transaction = {
        ...tx,
        id,
        documentNumber,
        invoiceNumber,
        invoiceIssuedAt: invoiceNumber ? now : undefined,
      };
      await db.transactions.put(persisted);
      await recordMeaningfulActivity(currentMigrationTransactionContext(), {
        storeId,
        activityType: "checkout",
        entityType: "transaction",
        entityId: String(id),
        occurredAt: now,
        actorUserId: input.userId,
        actorName: input.userName,
        correlationId: input.clientRequestId,
      });
      if (redemptionEvents.length > 0) {
        await db.gift_card_events.bulkAdd(
          redemptionEvents.map((event) => ({ ...event, transactionId: id })),
        );
      }
      if (creditEvents.length > 0) {
        // Preserve a reconciliable tender ledger per card even when the
        // cashier sells several cards in one ticket.
        const tenderPool = tenders
          .filter((tender) => tender.method === "Cash" || tender.method === "PIN")
          .map((tender) => ({ ...tender }));
        const tendersForEvent = (amountCents: number): PaymentTender[] => {
          let remaining = amountCents;
          const rows: PaymentTender[] = [];
          for (const tender of tenderPool) {
            if (remaining <= 0) break;
            const amount = Math.min(remaining, tender.amountCents);
            if (amount > 0) {
              rows.push({ method: tender.method, amountCents: amount });
              tender.amountCents -= amount;
              remaining -= amount;
            }
          }
          if (remaining !== 0) throw new CheckoutError("invalid-tender", "Betaalmiddelen sluiten niet aan op de cadeaubonwaarde.");
          return rows;
        };
        await db.gift_card_events.bulkAdd(
          creditEvents.map((event) => ({ ...event, transactionId: id, paymentTenders: tendersForEvent(event.amountCents) })),
        );
      }

      const soldByProductId = new Map<string, number>();
      for (const item of input.items.filter((item) => !isGiftCardProduct(item.product))) {
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
      if (creditedCards.length > 0) await db.gift_cards.bulkPut(creditedCards);

      let updatedCustomer: Customer | undefined;
      if (input.customerId && input.items.some((item) => !isGiftCardProduct(item.product))) {
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
          settlementTotalCents,
          roundingAdjustmentCents,
          commercialCashDueCents: cashPaymentRequested
            ? commercialCashDueCents
            : undefined,
          cashDueCents: cashPaymentRequested ? cashDueCents : undefined,
          discountCents: totals.discount,
          method: paymentMethod,
          paymentProvider: input.paymentProvider,
          paymentProviderReference: input.paymentProviderReference,
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
        updatedGiftCards: [...debitedCards, ...creditedCards],
        updatedCustomer,
      };
    },
  );
};
