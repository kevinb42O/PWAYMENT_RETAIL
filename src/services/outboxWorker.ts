import { drainOutbox } from "../db/outbox";
import { supabase, isSupabaseConfigured } from "../lib/supabase";
import { useAuth } from "../auth/useAuth";
import type { Json } from "../types/database.generated";
import type { GiftCardEvent, OutboxEntry, Transaction } from "../types";
import { db } from "../db/db";
import { upsertSupabaseProducts, upsertSupabaseCustomers, upsertSupabaseCategories, deleteSupabaseCategory } from "./supabaseMutations";
import {
  mutateSupabaseGiftCard,
  pushSupabaseGiftCardMutation,
  type GiftCardMutation,
} from "./supabaseGiftCards";
import type { Product, Customer, ProductCategory } from "../types";

const pushTransactionToSupabase = async (
  storeId: string,
  tx: Transaction,
): Promise<void> => {
  if (tx.kind === "refund") {
    const originalTx = tx.originalTransactionId 
      ? await db.transactions.get(tx.originalTransactionId)
      : null;
      
    if (!originalTx) {
      throw new Error(`Original transaction ${tx.originalTransactionId} not found in local db`);
    }

    const payload = {
      client_request_id: tx.clientRequestId,
      original_client_request_id: originalTx.clientRequestId,
      lines: tx.items.map((line) => ({
        line_id: line.lineId,
        quantity: line.quantity,
      })),
      method: tx.paymentMethod,
      reason: tx.correctionReason ?? "Retour",
    };

    const { error } = await supabase.rpc("refund_sale", {
      target_store_id: storeId,
      payload: payload as unknown as Json,
    });
    
    if (error && !error.message.includes('duplicate')) {
        throw new Error(error.message);
    }
  } else {
    // Checkout
    const payload = {
      client_request_id: tx.clientRequestId,
      cart_id: tx.tableId,
      items: tx.items.map((item) => ({
        line_id: item.lineId,
        product: { id: item.product.id },
        quantity: item.quantity,
        notes: item.notes,
        modifiers: item.modifiers ?? [],
      })),
      discount_cents: tx.discountCents,
      discount_reason: tx.discountReason,
      discount_approved_by_user_id: tx.discountApprovedByUserId,
      gift_cards: (tx.giftCardAllocations ?? []).map((card) => ({
        id: card.giftCardId,
        code: card.code,
        amount_cents: card.amountCents,
      })),
      method: tx.paymentMethod,
      tendered_cents: tx.tenderedCents,
      customer_id: tx.customerId,
      merchant_snapshot: tx.merchantSnapshot,
    };

    const { error } = await supabase.rpc("checkout_sale", {
      target_store_id: storeId,
      payload: payload as unknown as Json,
    });

    if (error && !error.message.includes('duplicate')) {
      throw new Error(error.message);
    }
  }
};

/**
 * Force the exact financial rows used by a Z-close onto the server ledger.
 *
 * Checkout is intentionally offline-first, while Z reports are intentionally
 * server-authoritative. Without this barrier a user can close faster than the
 * five-second outbox tick, especially in a brand-new store where the server
 * register does not exist until the first checkout arrives.
 */
export const synchronizeFinancialLedgerBeforeReport = async (
  storeId: string,
  transactions: Transaction[],
  giftCardEvents: GiftCardEvent[],
): Promise<void> => {
  if (!isSupabaseConfigured) {
    throw new Error("De beveiligde serververbinding is niet geconfigureerd.");
  }
  if (globalThis.navigator?.onLine === false) {
    throw new Error(
      "Maak verbinding met internet om de server-side dagafsluiting te voltooien.",
    );
  }

  const pending = await db.outbox.orderBy("id").toArray();
  const transactionOutboxIds = new Map<string, number[]>();
  const giftCardOutboxIds = new Map<string, number[]>();
  for (const entry of pending) {
    if (entry.id == null) continue;
    if (entry.kind === "transaction") {
      const requestId = (entry.payload as Transaction).clientRequestId;
      if (!requestId) continue;
      transactionOutboxIds.set(requestId, [
        ...(transactionOutboxIds.get(requestId) ?? []),
        entry.id,
      ]);
    } else if (entry.kind === "gift_card_mutation") {
      const eventId = (entry.payload as GiftCardMutation).event?.id;
      if (!eventId) continue;
      giftCardOutboxIds.set(eventId, [
        ...(giftCardOutboxIds.get(eventId) ?? []),
        entry.id,
      ]);
    }
  }

  const operations: Array<
    | { kind: "transaction"; timestamp: number; transaction: Transaction }
    | { kind: "gift-card"; timestamp: number; event: GiftCardEvent }
  > = [
    ...transactions.map((transaction) => ({
      kind: "transaction" as const,
      timestamp: transaction.timestamp,
      transaction,
    })),
    ...giftCardEvents
      .filter((event) => event.type === "issue" || event.type === "recharge")
      .map((event) => ({
        kind: "gift-card" as const,
        timestamp: event.timestamp,
        event,
      })),
  ].sort((left, right) => {
    const chronological = left.timestamp - right.timestamp;
    if (chronological !== 0) return chronological;
    return left.kind === "gift-card" ? -1 : 1;
  });

  for (const operation of operations) {
    if (operation.kind === "transaction") {
      const requestId = operation.transaction.clientRequestId;
      if (!requestId) {
        throw new Error("Een lokale verkoop mist zijn synchronisatiereferentie.");
      }
      await pushTransactionToSupabase(storeId, operation.transaction);
      const ids = transactionOutboxIds.get(requestId) ?? [];
      if (ids.length > 0) await db.outbox.bulkDelete(ids);
      continue;
    }

    const card = await db.gift_cards.get(operation.event.giftCardId);
    if (!card) {
      throw new Error(
        `Cadeaubon ${operation.event.giftCardCode} ontbreekt in de lokale administratie.`,
      );
    }
    await pushSupabaseGiftCardMutation(storeId, {
      action: operation.event.type === "issue" ? "issue" : "recharge",
      card,
      event: operation.event,
      paymentTenders: operation.event.paymentTenders,
    });
    const ids = giftCardOutboxIds.get(operation.event.id) ?? [];
    if (ids.length > 0) await db.outbox.bulkDelete(ids);
  }
};

const sendOutboxEntry = async (storeId: string, entry: OutboxEntry) => {
  if (entry.kind === "transaction") {
    await pushTransactionToSupabase(storeId, entry.payload as Transaction);
  } else if (entry.kind === "daily_report") {
    // To implement later if daily report is pushed to outbox
    console.warn("daily_report outbox sync not fully implemented yet");
  } else if (entry.kind === "upsert_product") {
    await upsertSupabaseProducts(storeId, entry.payload as Product[]);
  } else if (entry.kind === "upsert_customer") {
    await upsertSupabaseCustomers(storeId, entry.payload as Customer[]);
  } else if (entry.kind === "upsert_category") {
    await upsertSupabaseCategories(storeId, entry.payload as ProductCategory[]);
  } else if (entry.kind === "delete_category") {
    const p = entry.payload as { categoryId: string };
    await deleteSupabaseCategory(storeId, p.categoryId);
  } else if (entry.kind === "gift_card_mutation") {
    await mutateSupabaseGiftCard(storeId, entry.payload as any);
  } else {
    console.warn("outbox worker: unhandled kind:", entry.kind);
  }
};

let isWorkerRunning = false;
let workerInterval: ReturnType<typeof setInterval> | null = null;

export const startOutboxWorker = () => {
  if (isWorkerRunning) return;
  isWorkerRunning = true;

  const tick = async () => {
    const storeId = useAuth.getState().currentStoreId;
    if (!storeId || !isSupabaseConfigured || !navigator.onLine) return;

    await drainOutbox(async (entry) => {
      await sendOutboxEntry(storeId, entry);
    });
  };

  workerInterval = setInterval(tick, 5000);
  
  window.addEventListener('online', () => {
      tick();
  });
};

export const stopOutboxWorker = () => {
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
  }
  isWorkerRunning = false;
};
