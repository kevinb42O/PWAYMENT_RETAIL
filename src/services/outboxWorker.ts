import { drainOutbox } from "../db/outbox";
import { supabase, isSupabaseConfigured } from "../lib/supabase";
import { useAuth } from "../auth/useAuth";
import type { Json } from "../types/database.generated";
import type { DailyReport, GiftCardEvent, OutboxEntry, Transaction, WebshopOrder } from "../types";
import { db } from "../db/db";
import { upsertSupabaseProducts, upsertSupabaseCustomers, upsertSupabaseCategories, deleteSupabaseCategory } from "./supabaseMutations";
import {
  mutateSupabaseGiftCard,
  pushSupabaseGiftCardMutation,
  type GiftCardMutation,
} from "./supabaseGiftCards";
import type { Product, Customer, ProductCategory } from "../types";
import {
  getOutboxHealthMetadata,
  reportPlatformHealth,
  safeErrorFingerprint,
} from "./platformTelemetry";

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
 * Reports created before a store was connected to Supabase are legacy local
 * records.  They are closed against the same server-authoritative RPC as a
 * live report, only after every included financial row is confirmed.
 */
const pushLegacyDailyReportToSupabase = async (
  storeId: string,
  payload: unknown,
): Promise<void> => {
  const report = payload as DailyReport;
  if (!Array.isArray(report.transactionIds) || !Array.isArray(report.giftCardEventIds)) {
    throw new Error("Invalid daily report outbox payload");
  }
  const transactionIds = report.transactionIds.filter((id): id is number => Number.isInteger(id));
  const transactions = transactionIds.length
    ? await db.transactions.where("id").anyOf(transactionIds).toArray()
    : [];
  if (transactions.length !== transactionIds.length) {
    throw new Error("Een Z-rapport verwijst naar ontbrekende lokale verkopen.");
  }
  const eventIds = report.giftCardEventIds.filter((id): id is string => typeof id === "string" && id.length > 0);
  const giftCardEvents = eventIds.length
    ? await db.gift_card_events.where("id").anyOf(eventIds).toArray()
    : [];
  if (giftCardEvents.length !== eventIds.length) {
    throw new Error("Een Z-rapport verwijst naar ontbrekende lokale cadeaubongebeurtenissen.");
  }
  await synchronizeFinancialLedgerBeforeReport(storeId, transactions, giftCardEvents);
  const { error } = await supabase.rpc("finalize_daily_report", {
    target_store_id: storeId,
    payload: {
      register_id: report.registerId,
      report: {
        openingFloatCents: report.openingFloatCents ?? 0,
        countedCashCents: report.countedCashCents,
        cashDifferenceReason: report.cashDifferenceReason,
      },
      transaction_request_ids: transactions.map((transaction) => transaction.clientRequestId),
      gift_card_event_ids: giftCardEvents.map((event) => event.id),
    } as unknown as Json,
  });
  if (error) throw new Error(error.message);
};

const pushLegacyWebshopOrderToSupabase = async (
  storeId: string,
  payload: unknown,
): Promise<void> => {
  const queued = payload as { event?: string; order?: WebshopOrder };
  const order = queued.order;
  if (!order?.clientRequestId || !Array.isArray(order.lines)) {
    throw new Error("Invalid webshop order outbox payload");
  }

  if (queued.event === "webshop.order.created") {
    const { error } = await supabase.rpc("place_public_webshop_order", {
      store_identifier: storeId,
      payload: {
        clientRequestId: order.clientRequestId,
        lines: order.lines.map((line) => ({
          productId: line.productId,
          productName: line.productName,
          variant: line.variant,
          sku: line.sku,
          quantity: line.quantity,
          unitPriceCents: line.unitPriceCents,
        })),
        customer: order.customer,
        deliveryMode: order.deliveryMode,
        shippingAddress: order.shippingAddress,
        pickupAddress: order.pickupAddress,
        paymentMethod: order.paymentMethod,
        note: order.note,
        couponCode: order.couponCode,
        subtotalCents: order.subtotalCents,
        discountCents: order.discountCents,
        shippingCents: order.shippingCents,
        totalCents: order.totalCents,
        autoConfirm: order.status === "confirmed",
        shopName: "Pwayment Webshop",
      } as unknown as Json,
    });
    if (error) throw new Error(error.message);
    return;
  }

  const { data: remoteOrder, error: lookupError } = await supabase
    .from("webshop_orders")
    .select("id")
    .eq("store_id", storeId)
    .eq("client_request_id", order.clientRequestId)
    .maybeSingle();
  if (lookupError) throw new Error(lookupError.message);
  if (!remoteOrder) throw new Error("De centrale webshoporder bestaat nog niet; de creatie wordt eerst opnieuw geprobeerd.");
  const { error } = await supabase.rpc("update_webshop_order", {
    target_store_id: storeId,
    target_order_id: remoteOrder.id,
    payload: {
      status: order.status,
      paymentStatus: order.paymentStatus,
      fulfillmentStatus: order.fulfillmentStatus,
    } as unknown as Json,
  });
  if (error) throw new Error(error.message);
};

const pushLegacyAuditToSupabase = async (storeId: string, payload: unknown): Promise<void> => {
  const entry = payload as { action?: string; detail?: unknown };
  if (!entry.action || entry.action.length > 120) throw new Error("Invalid audit outbox payload");
  const { error } = await supabase.rpc("append_audit", {
    target_store_id: storeId,
    event_action: entry.action,
    event_detail: entry.detail == null ? null : entry.detail as Json,
  });
  if (error) throw new Error(error.message);
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
    await pushLegacyDailyReportToSupabase(storeId, entry.payload);
  } else if (entry.kind === "webshop_order") {
    await pushLegacyWebshopOrderToSupabase(storeId, entry.payload);
  } else if (entry.kind === "audit") {
    await pushLegacyAuditToSupabase(storeId, entry.payload);
  } else if (entry.kind === "webshop_email") {
    // There is intentionally no pretend delivery path. Until an audited mail
    // provider is configured, this stays retryable and is surfaced as a sync
    // issue instead of being silently discarded.
    throw new Error("Webshop e-mail delivery is not configured");
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
    // An unknown kind must remain in the queue and become visible as a failed
    // sync. Silently deleting it would lose business data.
    throw new Error(`Unsupported outbox entry kind: ${String(entry.kind)}`);
  }
};

let isWorkerRunning = false;
let workerInterval: ReturnType<typeof setInterval> | null = null;
let onlineListener: (() => void) | null = null;
let tickInFlight = false;

export const startOutboxWorker = () => {
  if (isWorkerRunning) return;
  isWorkerRunning = true;

  const tick = async () => {
    if (tickInFlight) return;
    tickInFlight = true;
    try {
      const storeId = useAuth.getState().currentStoreId;
      if (!storeId || !isSupabaseConfigured || !navigator.onLine) return;

      const result = await drainOutbox(async (entry) => {
        await sendOutboxEntry(storeId, entry);
      });
      const metadata = await getOutboxHealthMetadata();
      if (result.failed) {
        void reportPlatformHealth({
          storeId,
          eventType: result.failed.attempts >= 4 ? "sync.failed_permanent" : "sync.retrying",
          severity: result.failed.attempts >= 4 ? "error" : "warning",
          operation: result.failed.kind,
          errorFingerprint: safeErrorFingerprint(
            result.failed.kind,
            result.failed.lastError ?? "outbox delivery failed",
          ),
          metadata: {
            attempts: result.failed.attempts + 1,
            ...metadata,
          },
        });
      } else if (result.delivered > 0) {
        void reportPlatformHealth({
          storeId,
          eventType: "sync.completed",
          metadata,
        });
      }
    } finally {
      tickInFlight = false;
    }
  };

  void tick();
  workerInterval = setInterval(tick, 5000);
  
  onlineListener = () => void tick();
  window.addEventListener('online', onlineListener);
};

export const stopOutboxWorker = () => {
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
  }
  if (onlineListener) {
    window.removeEventListener('online', onlineListener);
    onlineListener = null;
  }
  tickInFlight = false;
  isWorkerRunning = false;
};
