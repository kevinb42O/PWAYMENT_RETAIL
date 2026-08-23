import { drainOutbox, retryOutboxEntry } from "../db/outbox";
import { supabase, isSupabaseConfigured } from "../lib/supabase";
import { useAuth } from "../auth/useAuth";
import type { Json } from "../types/database.generated";
import type { DailyReport, GiftCardEvent, ManualCatalogBatchPayload, OutboxEntry, Transaction, WebshopOrder } from "../types";
import { db } from "../db/db";
import { upsertSupabaseProducts, upsertSupabaseCustomers, upsertSupabaseCategories, deleteSupabaseCategory, upsertSupabaseCatalogBatch } from "./supabaseMutations";
import { pushMigrationOutboxEntry, type MigrationActivationOutboxPayload } from "./migrationSync";
import { recordIntegrationRun } from "./integrationOperations";
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
import { settlementTotalCents } from "../utils/cashRounding";

/**
 * New checkouts carry an explicit tender ledger.  The fallback keeps historic
 * single-tender rows synchronisable without inventing a split allocation.
 */
const terminalTendersForServer = (tx: Transaction) => {
  const recorded = tx.tenders?.length
    ? tx.tenders
    : tx.splitTenders ?? [];
  const cashOrPin = recorded.filter(
    (tender) => tender.method === "Cash" || tender.method === "PIN",
  );
  if (cashOrPin.length > 0) {
    return cashOrPin.map((tender) => ({
      method: tender.method,
      amount_cents: tender.amountCents,
    }));
  }
  if (tx.paymentMethod === "Cash" || tx.paymentMethod === "PIN") {
    return [{
      method: tx.paymentMethod,
      amount_cents: settlementTotalCents(tx),
    }];
  }
  return [];
};

// The built-in terminal simulator deliberately never creates a Mollie
// payment. Historic local rows did persist its sim_* id as if it were a real
// PSP reference, though. Strip that marker while syncing so those sales can
// be booked normally without weakening validation for genuine Mollie ids.
const isLocalMollieSimulatorReference = (reference?: string): boolean =>
  /^sim_[a-f0-9]{32}$/i.test(reference ?? "");

/**
 * Outbox rows are durable snapshots, but older app versions can leave a
 * partial/stale snapshot behind. The transaction table is the local financial
 * ledger and therefore the canonical recovery source for a queued sale.
 */
const recoverQueuedTransaction = async (payload: unknown): Promise<Transaction> => {
  const queued = payload as Partial<Transaction> | null;
  let recovered: Transaction | undefined;
  if (Number.isInteger(queued?.id)) {
    recovered = await db.transactions.get(queued!.id!);
  }
  if (!recovered && typeof queued?.clientRequestId === "string") {
    recovered = await db.transactions
      .filter((row) => row.clientRequestId === queued.clientRequestId)
      .first();
  }
  const transaction = recovered ?? queued;
  if (!transaction || typeof transaction.clientRequestId !== "string") {
    throw new Error("De lokale verkoop mist haar unieke synchronisatiereferentie.");
  }
  if (!Array.isArray(transaction.items) || transaction.items.length === 0) {
    throw new Error("De lokale verkoop bevat geen herstelbare verkoopregels.");
  }
  return transaction as Transaction;
};

const resolveRemoteOriginalRequestId = async (
  storeId: string,
  refund: Transaction,
): Promise<string> => {
  const lineIds = [...new Set(refund.items.map((line) => line.lineId).filter(Boolean))];
  if (lineIds.length === 0) {
    throw new Error("refund:original-not-found:De oorspronkelijke verkoopregels ontbreken lokaal.");
  }
  const { data: matchingLines, error: lineError } = await supabase
    .from("transaction_lines")
    .select("transaction_id,line_external_id")
    .eq("store_id", storeId)
    .in("line_external_id", lineIds);
  if (lineError) throw new Error(lineError.message);

  const matchesByTransaction = new Map<string, Set<string>>();
  for (const line of matchingLines ?? []) {
    const matches = matchesByTransaction.get(line.transaction_id) ?? new Set<string>();
    matches.add(line.line_external_id);
    matchesByTransaction.set(line.transaction_id, matches);
  }
  const candidateIds = [...matchesByTransaction]
    .filter(([, matches]) => lineIds.every((lineId) => matches.has(lineId)))
    .map(([transactionId]) => transactionId);
  if (candidateIds.length !== 1) {
    throw new Error("refund:original-not-found:De oorspronkelijke verkoop kon niet eenduidig op de server worden teruggevonden.");
  }

  const { data: original, error: originalError } = await supabase
    .from("transactions")
    .select("client_request_id,kind")
    .eq("store_id", storeId)
    .eq("id", candidateIds[0])
    .maybeSingle();
  if (originalError) throw new Error(originalError.message);
  if (!original || original.kind !== "sale" || !original.client_request_id) {
    throw new Error("refund:original-not-found:De oorspronkelijke verkoop staat nog niet op de server.");
  }
  return original.client_request_id;
};

const pushTransactionToSupabase = async (
  storeId: string,
  tx: Transaction,
): Promise<void> => {
  if (tx.kind === "refund") {
    const originalTx = tx.originalTransactionId 
      ? await db.transactions.get(tx.originalTransactionId)
      : null;
    const originalRequestId = originalTx?.clientRequestId
      ?? await resolveRemoteOriginalRequestId(storeId, tx);

    const payload = {
      client_request_id: tx.clientRequestId,
      original_client_request_id: originalRequestId,
      lines: tx.items.map((line) => ({
        line_id: line.lineId,
        quantity: line.quantity,
      })),
      method: tx.paymentMethod,
      reason: tx.correctionReason ?? "Retour",
      disposition: tx.returnDisposition ?? "sellable",
      receipt_barcode: tx.receiptBarcode,
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
    const invoiceCustomer = tx.documentRequest?.type !== "receipt" && tx.customerId
      ? await db.customers.get(tx.customerId)
      : undefined;
    const tenders = terminalTendersForServer(tx);
    const hasCashTender = tenders.some((tender) => tender.method === "Cash");
    const items = tx.items.map((item) => ({
      line_id: item.lineId,
      product: { id: item.product.id, priceCents: item.product.priceCents },
      quantity: item.quantity,
      notes: item.notes,
      modifiers: item.modifiers ?? [],
      gift_card_operation: item.giftCardOperation ? {
        action: item.giftCardOperation.action,
        card_id: item.giftCardOperation.cardId,
        code: item.giftCardOperation.code,
        customer_id: item.giftCardOperation.customerId,
        expires_at: item.giftCardOperation.expiresAt,
      } : undefined,
    }));
    const isGiftCardCheckout = tx.items.length > 0 && tx.items.every((item) => Boolean(item.giftCardOperation));
    const isSimulatorPayment = isLocalMollieSimulatorReference(tx.paymentProviderReference);
    const payload = {
      client_request_id: tx.clientRequestId,
      cart_id: tx.tableId,
      items,
      discount_cents: tx.discountCents,
      discount_reason: tx.discountReason,
      discount_approved_by_user_id: tx.discountApprovedByUserId,
      discount_approval_id: tx.discountApprovalId,
      gift_cards: (tx.giftCardAllocations ?? []).map((card) => ({
        id: card.giftCardId,
        code: card.code,
        amount_cents: card.amountCents,
      })),
      method: tx.paymentMethod,
      ...(isSimulatorPayment ? {} : {
        payment_provider: tx.paymentProvider,
        payment_provider_reference: tx.paymentProviderReference,
      }),
      tenders,
      ...(hasCashTender
        ? { tendered_cents: tx.tenderedCents ?? tenders.find((tender) => tender.method === "Cash")?.amount_cents }
        : {}),
      customer_id: tx.customerId,
      merchant_snapshot: tx.merchantSnapshot,
      document_request: tx.documentRequest,
      receipt_barcode: tx.receiptBarcode,
      // Repeated deliberately in the atomic checkout command. It lets the
      // server create/recover a just-added invoice customer even when a retry
      // reaches it before the separate customer outbox item.
      invoice_customer: invoiceCustomer ? {
        external_id: invoiceCustomer.id,
        name: invoiceCustomer.name,
        email: invoiceCustomer.email,
        phone: invoiceCustomer.phone,
        address: invoiceCustomer.address,
        billing_profile: invoiceCustomer.billingProfile,
      } : undefined,
    };

    // Generated database types are refreshed in the next schema-codegen run;
    // the migration is already deployed and the payload is intentionally JSON.
    const rpc = supabase.rpc as unknown as (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
    const { data, error } = await rpc(isGiftCardCheckout ? "checkout_gift_card_sale" : "checkout_sale", {
      target_store_id: storeId,
      payload: payload as unknown as Json,
    });

    if (error && !error.message.includes('duplicate')) {
      throw new Error(error.message);
    }
    if (!isSimulatorPayment && tx.paymentProvider && tx.paymentProviderReference && tx.clientRequestId) {
      const providerResult = await rpc("record_payment_provider_reference", {
        target_store_id: storeId,
        request_id: tx.clientRequestId,
        provider_name: tx.paymentProvider,
        provider_reference: tx.paymentProviderReference,
      });
      if (providerResult.error) throw new Error(providerResult.error.message);
    }
    // The server owns legal document numbering. Reconcile the optimistic local
    // number as soon as the queued command reaches Supabase.
    const issued = data as { document_number?: string; invoice_number?: string; invoice_issued_at?: string; receipt_barcode?: string } | null;
    if (!error && tx.id != null && issued?.document_number) {
      await db.transactions.update(tx.id, {
        documentNumber: issued.document_number,
        invoiceNumber: issued.invoice_number,
        invoiceIssuedAt: issued.invoice_issued_at ? Date.parse(issued.invoice_issued_at) : undefined,
        receiptBarcode: issued.receipt_barcode ?? tx.receiptBarcode,
      });
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
  const permanentlyRejectedFinancialRows: OutboxEntry[] = [];
  for (const entry of pending) {
    if (entry.id == null) continue;
    if (entry.kind === "transaction") {
      const requestId = (entry.payload as Transaction).clientRequestId;
      if (!requestId) continue;
      if (entry.deliveryStatus === "dead_letter") {
        permanentlyRejectedFinancialRows.push(entry);
      }
      transactionOutboxIds.set(requestId, [
        ...(transactionOutboxIds.get(requestId) ?? []),
        entry.id,
      ]);
    } else if (entry.kind === "gift_card_mutation") {
      const eventId = (entry.payload as GiftCardMutation).event?.id;
      if (!eventId) continue;
      if (entry.deliveryStatus === "dead_letter") {
        permanentlyRejectedFinancialRows.push(entry);
      }
      giftCardOutboxIds.set(eventId, [
        ...(giftCardOutboxIds.get(eventId) ?? []),
        entry.id,
      ]);
    }
  }

  const requestedTransactionIds = new Set(
    transactions.map((transaction) => transaction.clientRequestId).filter(Boolean),
  );
  const requestedGiftCardEventIds = new Set(giftCardEvents.map((event) => event.id));
  const blockingDeadLetter = permanentlyRejectedFinancialRows.find((entry) =>
    entry.kind === "transaction"
      ? requestedTransactionIds.has((entry.payload as Transaction).clientRequestId)
      : requestedGiftCardEventIds.has((entry.payload as GiftCardMutation).event?.id),
  );
  if (blockingDeadLetter) {
    throw new Error(
      `De dagafsluiting is geblokkeerd door een afgewezen ${blockingDeadLetter.kind === "transaction" ? "verkoop" : "cadeaubonmutatie"}. Los eerst de synchronisatiefout op in Integraties → Herstelwachtrij: ${blockingDeadLetter.lastError ?? "onbekende fout"}`,
    );
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
    await pushTransactionToSupabase(storeId, await recoverQueuedTransaction(entry.payload));
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
  } else if (entry.kind === "upsert_catalog_batch") {
    await upsertSupabaseCatalogBatch(storeId, entry.payload as ManualCatalogBatchPayload);
  } else if (entry.kind === "upsert_customer") {
    await upsertSupabaseCustomers(storeId, entry.payload as Customer[]);
  } else if (entry.kind === "upsert_category") {
    await upsertSupabaseCategories(storeId, entry.payload as ProductCategory[]);
  } else if (entry.kind === "delete_category") {
    const p = entry.payload as { categoryId: string };
    await deleteSupabaseCategory(storeId, p.categoryId);
  } else if (entry.kind === "gift_card_mutation") {
    await mutateSupabaseGiftCard(storeId, entry.payload as any);
  } else if (
    entry.kind === "migration_activate"
    || entry.kind === "migration_lock"
    || entry.kind === "migration_undo"
  ) {
    await pushMigrationOutboxEntry(storeId, entry);
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

type BrowserLockManager = {
  request: <T>(
    name: string,
    options: { ifAvailable: boolean },
    callback: (lock: unknown | null) => T | Promise<T>,
  ) => Promise<T>;
};

/**
 * The persisted per-row lease in `drainOutbox` is the safety net. Browser
 * Locks avoids even starting duplicate work when a cashier accidentally opens
 * the same tenant in two tabs.
 */
const withOutboxLeader = async (
  storeId: string,
  task: () => Promise<void>,
): Promise<void> => {
  const locks = (globalThis.navigator as Navigator & { locks?: BrowserLockManager } | undefined)?.locks;
  if (!locks) {
    await task();
    return;
  }
  await locks.request(`pwayment:outbox:${storeId}`, { ifAvailable: true }, async (lock) => {
    if (!lock) return;
    await task();
  });
};

export interface OutboxRetryResult {
  delivered: boolean;
  entry?: OutboxEntry;
}

export const isFailedSimulatorSale = (entry: OutboxEntry): boolean => {
  const transaction = entry.kind === "transaction"
    ? entry.payload as Partial<Transaction>
    : undefined;
  return transaction?.kind !== "refund"
    && isLocalMollieSimulatorReference(transaction?.paymentProviderReference);
};

export const isFailedLocalSale = (entry: OutboxEntry): boolean =>
  entry.kind === "transaction"
  && (entry.payload as Partial<Transaction>)?.kind !== "refund";

/**
 * Remove a never-delivered local terminal simulation and reverse only the
 * local projections created by that checkout. Real/server-confirmed sales,
 * finalized rows and gift-card activity are deliberately refused.
 */
export const discardUndeliveredLocalSale = async (id: number): Promise<void> => {
  const storeId = useAuth.getState().currentStoreId;
  if (!storeId) throw new Error("Er is geen actieve winkel geselecteerd.");
  const entry = await db.outbox.get(id);
  if (!entry || !isFailedLocalSale(entry)) {
    throw new Error("Alleen een niet-bevestigde lokale verkoop kan zo worden verwijderd.");
  }
  const transaction = await recoverQueuedTransaction(entry.payload);
  if ((transaction.kind ?? "sale") !== "sale") {
    throw new Error("Een retour kan niet als lokale testverkoop worden verwijderd.");
  }
  if (transaction.id == null || transaction.isFinalized === 1) {
    throw new Error("Deze testverkoop zit al in een dagafsluiting en kan niet automatisch worden verwijderd.");
  }
  if ((transaction.giftCardAllocations?.length ?? 0) > 0) {
    throw new Error("Deze testverkoop bevat cadeaubonactiviteit en vereist handmatige controle.");
  }

  const { data: remote, error: remoteError } = await supabase
    .from("transactions")
    .select("id")
    .eq("store_id", storeId)
    .eq("client_request_id", transaction.clientRequestId)
    .maybeSingle();
  if (remoteError) throw new Error(remoteError.message);
  if (remote) {
    throw new Error("Deze verkoop bestaat al op de server en mag niet lokaal worden verwijderd.");
  }

  await db.transaction(
    "rw",
    [db.outbox, db.transactions, db.products, db.stock_movements, db.customers, db.audit],
    async () => {
      const movements = await db.stock_movements
        .where("transactionId")
        .equals(transaction.id!)
        .toArray();
      const movementByProduct = new Map(
        movements.map((movement) => [movement.productId, movement]),
      );
      for (const item of transaction.items) {
        const product = await db.products.get(item.product.id);
        if (product?.stockQty != null && !movementByProduct.has(item.product.id)) {
          throw new Error(`De voorraadcorrectie voor ${item.product.name} ontbreekt; automatisch verwijderen is niet veilig.`);
        }
      }
      for (const movement of movements) {
        const product = await db.products.get(movement.productId);
        if (product?.stockQty != null) {
          await db.products.update(product.id, {
            stockQty: product.stockQty - movement.quantityDelta,
          });
        }
      }
      if (transaction.customerId) {
        const customer = await db.customers.get(transaction.customerId);
        if (customer) {
          await db.customers.update(customer.id, {
            totalSpentCents: Math.max(0, customer.totalSpentCents - transaction.totalCents),
            visitCount: Math.max(0, customer.visitCount - 1),
          });
        }
      }
      if (movements.length > 0) await db.stock_movements.bulkDelete(movements.map((row) => row.id!).filter(Number.isInteger));
      await db.transactions.delete(transaction.id!);
      await db.outbox.delete(id);
      await db.audit.add({
        timestamp: Date.now(),
        userId: useAuth.getState().currentUserId ?? null,
        userName: useAuth.getState().currentUserName ?? null,
        action: "terminal-simulator.discard",
        detail: {
          transactionId: transaction.id,
          clientRequestId: transaction.clientRequestId,
          reason: isLocalMollieSimulatorReference(transaction.paymentProviderReference)
            ? "Niet-afgeleverde lokale terminalsimulatie verwijderd"
            : "Niet-bevestigde lokale testverkoop na expliciete bevestiging verwijderd",
        },
      });
    },
  );
};

export const discardFailedSimulatorSale = discardUndeliveredLocalSale;

/** Retry one operator-selected row now and wait for its real delivery result. */
export const retryOutboxEntryNow = async (id: number): Promise<OutboxRetryResult> => {
  const storeId = useAuth.getState().currentStoreId;
  if (!storeId) throw new Error("Er is geen actieve winkel geselecteerd.");
  if (!isSupabaseConfigured) throw new Error("De beveiligde serververbinding is niet geconfigureerd.");
  if (globalThis.navigator?.onLine === false) throw new Error("Er is momenteel geen internetverbinding.");
  if (!await retryOutboxEntry(id)) return { delivered: false };

  let outcome: OutboxRetryResult = { delivered: false };
  await withOutboxLeader(storeId, async () => {
    const result = await drainOutbox(
      (entry) => sendOutboxEntry(storeId, entry),
      { maxEntries: 1, shouldProcess: (entry) => entry.id === id },
    );
    if (result.delivered === 1) {
      outcome = { delivered: true };
      return;
    }
    outcome = {
      delivered: false,
      entry: result.failed ?? await db.outbox.get(id),
    };
  });
  return outcome;
};

export const startOutboxWorker = () => {
  if (isWorkerRunning) return;
  isWorkerRunning = true;

  const tick = async () => {
    if (tickInFlight) return;
    tickInFlight = true;
    try {
      const storeId = useAuth.getState().currentStoreId;
      if (!storeId || !isSupabaseConfigured || !navigator.onLine) return;

      await withOutboxLeader(storeId, async () => {
        const result = await drainOutbox(async (entry) => {
          await sendOutboxEntry(storeId, entry);
          if (entry.kind === "migration_activate") {
            const telemetry = (entry.payload as MigrationActivationOutboxPayload).integrationRun;
            if (telemetry) {
              await recordIntegrationRun({
                ...telemetry,
                storeId,
                status: "completed",
                eventType: "delivery.confirmed",
                eventMessage: "Server receipt bevestigd via de achtergrondwachtrij.",
              });
            }
          }
        });
        const metadata = await getOutboxHealthMetadata();
        if (result.deadLettered.length > 0) {
          const failed = result.deadLettered[0];
          void reportPlatformHealth({
            storeId,
            eventType: "sync.failed_permanent",
            severity: failed.kind === "transaction" ? "critical" : "error",
            operation: failed.kind,
            errorFingerprint: safeErrorFingerprint(
              failed.kind,
              failed.lastError ?? "outbox delivery needs manual resolution",
            ),
            metadata: { attempts: failed.attempts, ...metadata },
          });
        } else if (result.retried.length > 0) {
          const failed = result.retried[0];
          void reportPlatformHealth({
            storeId,
            eventType: "sync.retrying",
            severity: "warning",
            operation: failed.kind,
            errorFingerprint: safeErrorFingerprint(
              failed.kind,
              failed.lastError ?? "outbox delivery failed",
            ),
            metadata: { attempts: failed.attempts, ...metadata },
          });
        } else if (result.delivered > 0) {
          void reportPlatformHealth({
            storeId,
            eventType: "sync.completed",
            metadata,
          });
        }
      });
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
