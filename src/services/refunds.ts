import { db } from "../db/db";
import { useAuth } from "../auth/useAuth";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import type { Json } from "../types/database.generated";
import {
  GiftCard,
  GiftCardEvent,
  OrderItem,
  PaymentTender,
  ReturnDisposition,
  Transaction,
} from "../types";
import { DEFAULT_REGISTER_ID, transactionTenders } from "../utils/financial";
import { allocateCents } from "../utils/money";
import { calculateTotals } from "../utils/vat";
import { generateReceiptBarcode } from "../utils/receiptBarcode";

export class RefundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RefundError";
  }
}

export interface RefundLineInput {
  lineId: string;
  quantity: number;
}

export interface RefundInput {
  clientRequestId: string;
  originalTransactionId: number;
  lines: RefundLineInput[];
  method: "Cash" | "PIN" | "Cadeaubon";
  reason: string;
  /** Only sellable returns are put back into available POS stock. */
  disposition?: ReturnDisposition;
  userId?: string;
  userName?: string;
}

const returnDispositions: readonly ReturnDisposition[] = [
  "sellable",
  "quarantine",
  "defective",
  "supplier-return",
];

const lineGrossCents = (item: OrderItem) => {
  const modifiers = (item.modifiers ?? []).reduce(
    (sum, modifier) => sum + modifier.deltaCents,
    0,
  );
  return (item.product.priceCents + modifiers) * item.quantity;
};

const refundedQuantities = (rows: Transaction[]) => {
  const quantities = new Map<string, number>();
  for (const row of rows) {
    for (const item of row.items)
      quantities.set(
        item.lineId,
        (quantities.get(item.lineId) ?? 0) + item.quantity,
      );
  }
  return quantities;
};

type RemoteRefundResult = {
  document_number?: string;
  receipt_barcode?: string;
  duplicate?: boolean;
};

/**
 * The legacy transaction outbox cannot carry the newly introduced disposition
 * field. Non-sellable returns therefore go directly through the authoritative
 * RPC while connected; this keeps local and central available stock equal
 * without changing checkout/outbox transport in this hardening change.
 */
const synchronizeNonSellableRefund = async (
  input: RefundInput,
  original: Transaction,
  disposition: Exclude<ReturnDisposition, "sellable">,
  receiptBarcode: string,
): Promise<RemoteRefundResult | null> => {
  const storeId = useAuth.getState().currentStoreId;
  if (!storeId || !isSupabaseConfigured) return null;
  if (globalThis.navigator?.onLine === false) {
    throw new RefundError(
      "Maak verbinding met internet om een retour naar quarantaine, defect of leverancier centraal vast te leggen.",
    );
  }
  if (!original.clientRequestId) {
    throw new RefundError("De oorspronkelijke verkoop mist een centrale synchronisatiereferentie.");
  }

  const { data, error } = await supabase.rpc("refund_sale", {
    target_store_id: storeId,
    payload: {
      client_request_id: input.clientRequestId,
      original_client_request_id: original.clientRequestId,
      lines: input.lines.map((line) => ({
        line_id: line.lineId,
        quantity: line.quantity,
      })),
      method: input.method,
      reason: input.reason.trim(),
      disposition,
      receipt_barcode: receiptBarcode,
    } as unknown as Json,
  });
  if (error) {
    const match = error.message.match(/refund:[a-z-]+:(.+)/s);
    throw new RefundError(match?.[1]?.trim() || error.message);
  }
  return (data ?? {}) as RemoteRefundResult;
};

export const createRefund = async (
  input: RefundInput,
): Promise<Transaction> => {
  if (!input.reason.trim())
    throw new RefundError("Een retourreden is verplicht.");
  if (input.lines.length === 0)
    throw new RefundError("Selecteer minstens één retourregel.");

  const disposition = input.disposition ?? "sellable";
  if (!returnDispositions.includes(disposition)) {
    throw new RefundError("Kies een geldige bestemming voor de retour.");
  }

  const duplicate = await db.transactions
    .where("clientRequestId")
    .equals(input.clientRequestId)
    .first();
  if (duplicate) return duplicate;

  const receiptBarcode = generateReceiptBarcode();
  let remoteRefund: RemoteRefundResult | null = null;
  if (disposition !== "sellable") {
    const original = await db.transactions.get(input.originalTransactionId);
    if (!original || (original.kind ?? "sale") !== "sale") {
      throw new RefundError("De oorspronkelijke verkoop bestaat niet.");
    }
    if ((original.source ?? "live") === "demo") {
      throw new RefundError("Demo-omzet kan niet als echte retour worden geboekt.");
    }
    remoteRefund = await synchronizeNonSellableRefund(
      input,
      original,
      disposition,
      receiptBarcode,
    );
  }

  return db.transaction(
    "rw",
    [
      db.transactions,
      db.products,
      db.stock_movements,
      db.gift_cards,
      db.gift_card_events,
      db.customers,
      db.audit,
      db.outbox,
      db.shifts,
    ],
    async () => {
      const duplicate = await db.transactions
        .where("clientRequestId")
        .equals(input.clientRequestId)
        .first();
      if (duplicate) return duplicate;

      const original = await db.transactions.get(input.originalTransactionId);
      if (!original || (original.kind ?? "sale") !== "sale")
        throw new RefundError("De oorspronkelijke verkoop bestaat niet.");
      if ((original.source ?? "live") === "demo")
        throw new RefundError(
          "Demo-omzet kan niet als echte retour worden geboekt.",
        );

      const priorRefunds = await db.transactions
        .where("originalTransactionId")
        .equals(input.originalTransactionId)
        .filter((row) => row.kind === "refund")
        .toArray();
      const alreadyRefunded = refundedQuantities(priorRefunds);
      const requested = new Map(
        input.lines.map((line) => [line.lineId, line.quantity]),
      );
      const selectedItems: OrderItem[] = [];
      for (const originalItem of original.items) {
        const quantity = requested.get(originalItem.lineId) ?? 0;
        if (!Number.isSafeInteger(quantity) || quantity < 0)
          throw new RefundError("Ongeldige retourhoeveelheid.");
        const remaining =
          originalItem.quantity -
          (alreadyRefunded.get(originalItem.lineId) ?? 0);
        if (quantity > remaining)
          throw new RefundError(
            `Er kunnen nog maximaal ${remaining} stuks van ${originalItem.product.name} worden geretourneerd.`,
          );
        if (quantity > 0) selectedItems.push({ ...originalItem, quantity });
      }
      if (selectedItems.length === 0)
        throw new RefundError("Geen geldige retourregels geselecteerd.");

      const originalGrossLines = original.items.map(lineGrossCents);
      const originalDiscountByLine = allocateCents(
        original.discountCents,
        originalGrossLines,
      );
      let selectedDiscountCents = 0;
      for (const selected of selectedItems) {
        const index = original.items.findIndex(
          (item) => item.lineId === selected.lineId,
        );
        const originalQuantity = original.items[index].quantity;
        const perUnitDiscount = allocateCents(
          originalDiscountByLine[index],
          Array(originalQuantity).fill(1),
        );
        selectedDiscountCents += perUnitDiscount
          .slice(0, selected.quantity)
          .reduce((sum, cents) => sum + cents, 0);
      }
      const positiveTotals = calculateTotals(
        selectedItems,
        selectedDiscountCents,
      );
      const refundCents = positiveTotals.total;
      if (refundCents <= 0)
        throw new RefundError("Het retourbedrag moet groter zijn dan nul.");

      const now = Date.now();
      const tenders: PaymentTender[] = [
        { method: input.method, amountCents: -refundCents },
      ];
      const openShift = await db.shifts
        .filter(
          (row) =>
            row.registerId === (original.registerId ?? DEFAULT_REGISTER_ID) &&
            row.status === "open",
        )
        .last();
      const row: Transaction = {
        clientRequestId: input.clientRequestId,
        tableId: original.tableId,
        items: selectedItems,
        subtotalCents: -positiveTotals.subtotal,
        discountCents: -positiveTotals.discount,
        totalCents: -positiveTotals.total,
        vatBreakdown: positiveTotals.vatBreakdown.map((line) => ({
          ...line,
          grossCents: -line.grossCents,
          exclCents: -line.exclCents,
          vatCents: -line.vatCents,
        })),
        vat12Cents: -positiveTotals.vat12,
        vat21Cents: -positiveTotals.vat21,
        paymentMethod: input.method,
        tenders,
        timestamp: now,
        isFinalized: 0,
        userId: input.userId,
        userName: input.userName,
        customerId: original.customerId,
        source: "live",
        kind: "refund",
        receiptBarcode: remoteRefund?.receipt_barcode ?? receiptBarcode,
        receiptBarcodeVersion: 1,
        originalTransactionId: original.id,
        correctionReason: input.reason.trim(),
        returnDisposition: disposition,
        merchantSnapshot: original.merchantSnapshot,
        registerId: original.registerId ?? DEFAULT_REGISTER_ID,
        shiftId: openShift?.id,
      };
      const id = await db.transactions.add(row);
      const persisted: Transaction = {
        ...row,
        id,
        documentNumber: remoteRefund?.document_number
          ?? `CR-${new Date(now).getFullYear()}-${String(id).padStart(8, "0")}`,
      };
      await db.transactions.put(persisted);

      if (disposition === "sellable") {
        for (const item of selectedItems) {
          const product = await db.products.get(item.product.id);
          if (product?.stockQty != null) {
            await db.products.put({
              ...product,
              stockQty: product.stockQty + item.quantity,
            });
            await db.stock_movements.add({
              productId: product.id,
              productName: product.name,
              quantityDelta: item.quantity,
              reason: "pos-refund",
              timestamp: now,
              transactionId: id,
              userId: input.userId,
              userName: input.userName,
              returnDisposition: disposition,
            });
          }
        }
      }

      if (input.method === "Cadeaubon") {
        const originalGiftTenders = transactionTenders(original).filter(
          (tender) => tender.method === "Cadeaubon",
        );
        const available = originalGiftTenders.reduce(
          (sum, tender) => sum + tender.amountCents,
          0,
        );
        if (refundCents > available || !original.giftCardAllocations?.length) {
          throw new RefundError(
            "Deze retour kan niet volledig naar de oorspronkelijke cadeaubon worden teruggestort. Kies Cash of PIN.",
          );
        }
        let remaining = refundCents;
        const updatedCards: GiftCard[] = [];
        const events: GiftCardEvent[] = [];
        for (const allocation of original.giftCardAllocations) {
          if (remaining <= 0) break;
          const card = await db.gift_cards.get(allocation.giftCardId);
          if (!card)
            throw new RefundError(
              `Cadeaubon ${allocation.code} bestaat niet meer.`,
            );
          const amountCents = Math.min(remaining, allocation.amountCents);
          updatedCards.push({
            ...card,
            balanceCents: card.balanceCents + amountCents,
          });
          events.push({
            id: `gift-card-refund-${input.clientRequestId}-${card.id}`,
            giftCardId: card.id,
            giftCardCode: card.code,
            type: "refund",
            amountCents,
            balanceBeforeCents: card.balanceCents,
            balanceAfterCents: card.balanceCents + amountCents,
            timestamp: now,
            transactionId: id,
            clientRequestId: input.clientRequestId,
            customerId: card.customerId,
            userId: input.userId,
            userName: input.userName,
            source: "live",
          });
          remaining -= amountCents;
        }
        await db.gift_cards.bulkPut(updatedCards);
        await db.gift_card_events.bulkAdd(events);
      }

      if (original.customerId) {
        const customer = await db.customers.get(original.customerId);
        if (customer)
          await db.customers.put({
            ...customer,
            totalSpentCents: Math.max(
              0,
              customer.totalSpentCents - refundCents,
            ),
          });
      }
      await db.audit.add({
        timestamp: now,
        userId: input.userId ?? null,
        userName: input.userName ?? null,
        action: "refund.create",
        detail: {
          originalTransactionId: original.id,
          refundTransactionId: id,
          amountCents: refundCents,
          reason: input.reason.trim(),
          method: input.method,
          disposition,
        },
      });
      if (!remoteRefund) {
        await db.outbox.add({
          timestamp: now,
          kind: "transaction",
          payload: persisted,
          attempts: 0,
        });
      }
      return persisted;
    },
  );
};
