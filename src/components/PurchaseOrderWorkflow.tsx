import { useEffect, useMemo, useState } from 'react';
import {
  Archive,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  PackageCheck,
  Truck,
  ScanLine,
  X,
} from 'lucide-react';
import { audit, useAuth } from '../auth/useAuth';
import { db } from '../db/db';
import { saveSupabasePurchaseOrders } from '../services/supabasePurchaseOrders';
import { PurchaseOrder, PurchaseOrderStatus } from '../types';
import { formatEUR } from '../utils/money';
import { findProductByScanCode } from '../utils/productLookup';
import {
  applyPurchaseOrderReceipt,
  cancelPurchaseOrder,
  markPurchaseOrderAsOrdered,
  purchaseOrderOutstandingQty,
  purchaseOrderTotalCents,
  updatePurchaseOrderDraftQuantities,
} from '../utils/purchaseOrders';

interface PurchaseOrderWorkflowProps {
  refreshKey: number;
  onInventoryChanged?: () => Promise<void>;
  view?: 'all' | 'open' | 'overdue';
}

const statusMeta: Record<PurchaseOrderStatus, { label: string; classes: string }> = {
  draft: { label: 'Concept', classes: 'purchase-status purchase-status--draft' },
  ordered: { label: 'Besteld', classes: 'purchase-status purchase-status--ordered' },
  'partially-received': { label: 'Deels ontvangen', classes: 'purchase-status purchase-status--partial' },
  received: { label: 'Ontvangen', classes: 'purchase-status purchase-status--received' },
  cancelled: { label: 'Geannuleerd', classes: 'purchase-status purchase-status--cancelled' },
};

const formatDate = (timestamp?: number) => timestamp == null
  ? '—'
  : new Intl.DateTimeFormat('nl-BE', { day: 'numeric', month: 'short', year: 'numeric' }).format(timestamp);

const parseDateInput = (value: string) => {
  if (!value) return undefined;
  const timestamp = new Date(`${value}T12:00:00`).getTime();
  return Number.isFinite(timestamp) ? timestamp : undefined;
};

export const PurchaseOrderWorkflow = ({ refreshKey, onInventoryChanged, view = 'all' }: PurchaseOrderWorkflowProps) => {
  const auth = useAuth();
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [references, setReferences] = useState<Record<string, string>>({});
  const [deliveryDates, setDeliveryDates] = useState<Record<string, string>>({});
  const [draftQuantities, setDraftQuantities] = useState<Record<string, Record<string, number>>>({});
  const [receipts, setReceipts] = useState<Record<string, Record<string, number>>>({});
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [receiptScan, setReceiptScan] = useState('');

  const loadOrders = async () => {
    const stored = await db.purchase_orders.orderBy('createdAt').reverse().toArray();
    setOrders(stored);
    setReferences((current) => Object.fromEntries(stored.map((order) => [order.id, current[order.id] ?? order.reference ?? ''])));
    setDeliveryDates((current) => Object.fromEntries(stored.map((order) => [
      order.id,
      current[order.id] ?? (order.expectedDeliveryAt ? new Date(order.expectedDeliveryAt).toISOString().slice(0, 10) : ''),
    ])));
    setDraftQuantities((current) => Object.fromEntries(stored.map((order) => [
      order.id,
      Object.fromEntries(order.items.map((item) => [item.productId, current[order.id]?.[item.productId] ?? item.orderedQty])),
    ])));
  };

  useEffect(() => {
    void loadOrders();
  }, [refreshKey]);

  const activeOrders = useMemo(
    () => orders.filter((order) => order.status === 'draft' || order.status === 'ordered' || order.status === 'partially-received'),
    [orders],
  );
  const visibleOrders = useMemo(() => {
    if (view === 'open') return activeOrders;
    if (view === 'overdue') {
      const now = Date.now();
      return activeOrders.filter((order) => order.status !== 'draft'
        && order.expectedDeliveryAt != null
        && order.expectedDeliveryAt < now);
    }
    return orders;
  }, [activeOrders, orders, view]);
  const completedCount = orders.filter((order) => order.status === 'received').length;

  const runOrderAction = async (orderId: string, action: () => Promise<void>) => {
    setBusyOrderId(orderId);
    setFeedback(null);
    try {
      await action();
      await loadOrders();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'De wijziging kon niet worden bewaard.');
    } finally {
      setBusyOrderId(null);
    }
  };

  const markAsOrdered = (order: PurchaseOrder) => runOrderAction(order.id, async () => {
    const adjustedDraft = updatePurchaseOrderDraftQuantities(order, draftQuantities[order.id] ?? {});
    const updated = markPurchaseOrderAsOrdered(adjustedDraft, {
      reference: references[order.id],
      expectedDeliveryAt: parseDateInput(deliveryDates[order.id] ?? ''),
    });
    if (auth.currentStoreId) await saveSupabasePurchaseOrders(auth.currentStoreId, [updated]);
    else {
      await db.purchase_orders.put(updated);
      await audit('purchase_order.update', { orderId: order.id, status: updated.status, supplier: order.supplier });
    }
    setFeedback(`De bestelling bij ${order.supplier} staat nu als besteld. Er is niets automatisch verzonden.`);
  });

  const saveDraft = (order: PurchaseOrder) => runOrderAction(order.id, async () => {
    const updated = updatePurchaseOrderDraftQuantities(order, draftQuantities[order.id] ?? {});
    if (auth.currentStoreId) await saveSupabasePurchaseOrders(auth.currentStoreId, [updated]);
    else {
      await db.purchase_orders.put(updated);
      await audit('purchase_order.update', { orderId: order.id, status: updated.status, supplier: order.supplier, quantitiesUpdated: true });
    }
    setFeedback(`Het concept voor ${order.supplier} is bijgewerkt.`);
  });

  const cancelDraft = (order: PurchaseOrder) => runOrderAction(order.id, async () => {
    const updated = cancelPurchaseOrder(order);
    if (auth.currentStoreId) await saveSupabasePurchaseOrders(auth.currentStoreId, [updated]);
    else {
      await db.purchase_orders.put(updated);
      await audit('purchase_order.cancel', { orderId: order.id, supplier: order.supplier });
    }
    setExpandedOrderId(null);
    setFeedback(`Het concept voor ${order.supplier} is geannuleerd en blijft in de historiek bewaard.`);
  });

  const receiveOrder = (order: PurchaseOrder) => runOrderAction(order.id, async () => {
    const products = (await db.products.bulkGet(order.items.map((item) => item.productId)))
      .filter((product): product is NonNullable<typeof product> => product != null);
    const result = applyPurchaseOrderReceipt(order, receipts[order.id] ?? {}, products, {
      userId: auth.currentUserId ?? undefined,
      userName: auth.currentUserName ?? undefined,
    });
    if (auth.currentStoreId) {
      await saveSupabasePurchaseOrders(auth.currentStoreId, [result.order]);
    } else {
      await db.transaction('rw', db.purchase_orders, db.products, db.stock_movements, async () => {
        await db.purchase_orders.put(result.order);
        await db.products.bulkPut(result.updatedProducts);
        await db.stock_movements.bulkAdd(result.movements);
      });
      await audit('purchase_order.receive', {
        orderId: order.id,
        supplier: order.supplier,
        status: result.order.status,
        received: result.movements.map((movement) => ({ productId: movement.productId, quantity: movement.quantityDelta })),
      });
    }
    setReceipts((current) => ({ ...current, [order.id]: {} }));
    setFeedback(result.order.status === 'received'
      ? `De bestelling van ${order.supplier} is volledig ontvangen en de voorraad is bijgewerkt.`
      : `De deellevering van ${order.supplier} is verwerkt. Alleen de ontvangen aantallen zijn toegevoegd.`);
    await onInventoryChanged?.();
  });

  const updateReceipt = (orderId: string, productId: string, value: number, maximum: number) => {
    const safeValue = Number.isFinite(value) ? Math.max(0, Math.min(maximum, Math.floor(value))) : 0;
    setReceipts((current) => ({
      ...current,
      [orderId]: { ...(current[orderId] ?? {}), [productId]: safeValue },
    }));
    setFeedback(null);
  };

  const receiveAllOutstanding = (order: PurchaseOrder) => {
    setReceipts((current) => ({
      ...current,
      [order.id]: Object.fromEntries(order.items.map((item) => [
        item.productId,
        Math.max(0, item.orderedQty - item.receivedQty),
      ])),
    }));
    setFeedback(`Alle openstaande aantallen van ${order.supplier} staan klaar voor controle.`);
  };

  const scanOpenReceiptLine = async () => {
    const code = receiptScan.trim();
    if (!code) return;
    const products = await db.products.toArray();
    const product = findProductByScanCode(products, code)?.product;
    const match = product ? activeOrders.flatMap((order) => order.items.map((item) => ({ order, item })))
      .find(({ order, item }) => (order.status === 'ordered' || order.status === 'partially-received') && item.productId === product.id && item.receivedQty < item.orderedQty) : undefined;
    if (!match) {
      setFeedback(`${code}: geen openstaande inkooporderlijn gevonden.`);
      return;
    }
    const outstanding = match.item.orderedQty - match.item.receivedQty;
    const current = receipts[match.order.id]?.[match.item.productId] ?? 0;
    updateReceipt(match.order.id, match.item.productId, current + 1, outstanding);
    setExpandedOrderId(match.order.id);
    setReceiptScan('');
    setFeedback(`${match.item.productName}: één stuk klaargezet voor ontvangst bij ${match.order.supplier}.`);
  };

  const updateReference = (orderId: string, value: string) => {
    setReferences((current) => ({ ...current, [orderId]: value }));
  };

  const updateDeliveryDate = (orderId: string, value: string) => {
    setDeliveryDates((current) => ({ ...current, [orderId]: value }));
  };

  const updateDraftQuantity = (orderId: string, productId: string, value: number) => {
    const safeValue = Number.isFinite(value) ? Math.max(1, Math.min(99_999, Math.floor(value))) : 1;
    setDraftQuantities((current) => ({
      ...current,
      [orderId]: { ...(current[orderId] ?? {}), [productId]: safeValue },
    }));
    setFeedback(null);
  };

  if (orders.length === 0) return (
    <section className="purchase-workflow purchase-workflow-enter mt-1">
      <div className="purchase-workflow__empty rounded-2xl border border-zinc-800 px-6 py-12 text-center">
        <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-zinc-900 text-sky-300"><PackageCheck size={22} /></span>
        <h3 className="mt-4 text-base font-semibold text-white">Geen inkooporders</h3>
        <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-zinc-500">Zodra er een bestelling wordt aangemaakt, volgt u hier elke stap van concept tot ontvangst.</p>
      </div>
    </section>
  );

  return (
    <section className="purchase-workflow-enter purchase-workflow mt-6 border-t border-zinc-800 pt-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-zinc-300">
            <ClipboardList size={17} className="text-sky-300" />
            <h3 className="text-base font-semibold text-white">Inkooporders</h3>
          </div>
          <p className="mt-1 text-sm text-zinc-500">Van concept tot ontvangst, gegroepeerd per leverancier.</p>
        </div>
        <div className="text-xs font-medium text-zinc-500">{activeOrders.length} actief · {completedCount} volledig ontvangen</div>
      </div>

      {feedback && <div role="status" aria-live="polite" className="purchase-feedback-enter mt-4 flex items-start gap-2 rounded-lg border border-sky-400/20 bg-sky-400/[0.06] px-3 py-2.5 text-sm text-sky-100"><Check size={16} className="mt-0.5 shrink-0" />{feedback}</div>}

      {activeOrders.some((order) => order.status === 'ordered' || order.status === 'partially-received') && <div className="mt-4 flex flex-col gap-2 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 sm:flex-row sm:items-center"><label className="flex min-w-0 flex-1 items-center gap-2 text-xs font-bold text-zinc-300"><ScanLine size={16} className="shrink-0 text-emerald-300" /><input value={receiptScan} onChange={(event) => setReceiptScan(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void scanOpenReceiptLine(); } }} placeholder="Scan barcode of SKU tegen open order" className="h-10 min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-white outline-none focus:border-emerald-400" /></label><button type="button" onClick={() => void scanOpenReceiptLine()} className="h-10 rounded-lg bg-emerald-400 px-4 text-sm font-bold text-zinc-950">Ontvang scan</button></div>}

      <div className="mt-4 space-y-3">
        {visibleOrders.length === 0 && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-950/55 px-4 py-8 text-center text-sm font-medium text-zinc-500">
            {view === 'overdue' ? 'Geen achterstallige inkooporders.' : 'Geen openstaande inkooporders.'}
          </div>
        )}
        {visibleOrders.slice(0, 12).map((order) => {
          const expanded = expandedOrderId === order.id;
          const meta = statusMeta[order.status];
          const outstandingQty = purchaseOrderOutstandingQty(order);
          const isBusy = busyOrderId === order.id;
          return (
            <article key={order.id} className={`overflow-hidden rounded-xl border ${order.status === 'cancelled' ? 'border-zinc-800/60 opacity-65' : 'border-zinc-800'} bg-zinc-950/55`}>
              <button
                type="button"
                onClick={() => setExpandedOrderId(expanded ? null : order.id)}
                className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition hover:bg-zinc-900/60"
                aria-expanded={expanded}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-semibold text-white">{order.supplier}</span>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${meta.classes}`}>{meta.label}</span>
                  </div>
                  <div className="mt-1 text-xs text-zinc-500">
                    {order.items.length} {order.items.length === 1 ? 'product' : 'producten'} · {order.items.reduce((sum, item) => sum + item.orderedQty, 0)} stuks · {formatEUR(purchaseOrderTotalCents(order))} excl. btw
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  {order.status !== 'draft' && order.status !== 'cancelled' && <span className="hidden text-xs text-zinc-500 sm:inline">{outstandingQty} nog te ontvangen</span>}
                  {expanded ? <ChevronUp size={17} className="text-zinc-500" /> : <ChevronDown size={17} className="text-zinc-500" />}
                </div>
              </button>

              {expanded && (
                <div className="border-t border-zinc-800 px-4 py-4">
                  <div className="grid gap-2">
                    {order.items.map((item) => {
                      const outstanding = Math.max(0, item.orderedQty - item.receivedQty);
                      const receivingEnabled = order.status === 'ordered' || order.status === 'partially-received';
                      const receiptValue = receipts[order.id]?.[item.productId] ?? 0;
                      const draftQuantity = draftQuantities[order.id]?.[item.productId] ?? item.orderedQty;
                      return (
                        <div key={item.productId} className="grid gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_110px_190px] sm:items-center">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-white">{item.productName}</div>
                            <div className="mt-0.5 text-xs text-zinc-500">{item.sku ? `SKU ${item.sku} · ` : ''}{formatEUR(item.unitCostCents ?? 0)} per stuk</div>
                          </div>
                          <div className="text-sm text-zinc-300">{order.status === 'draft' ? <><strong className="text-white">{draftQuantity}</strong> stuks in concept</> : <><strong className="text-white">{item.receivedQty}</strong> / {item.orderedQty} ontvangen</>}</div>
                          {order.status === 'draft' ? (
                            <div className="flex items-center justify-between gap-2 sm:justify-end">
                              <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Bestelaantal</span>
                              <input type="number" min="1" max="99999" value={draftQuantity} onChange={(event) => updateDraftQuantity(order.id, item.productId, Number(event.currentTarget.value))} aria-label={`Bestelaantal in concept voor ${item.productName}`} className="h-9 w-20 rounded-md border border-zinc-700 bg-zinc-950 px-2 text-center font-mono text-sm font-bold text-white shadow-sm outline-none focus:border-sky-400" />
                            </div>
                          ) : receivingEnabled ? (
                            <div className="flex items-center justify-between gap-2 sm:justify-end">
                              <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Nu ontvangen</span>
                              <input
                                type="number"
                                min="0"
                                max={outstanding}
                                value={receiptValue}
                                onChange={(event) => updateReceipt(order.id, item.productId, Number(event.target.value), outstanding)}
                                aria-label={`Ontvangen aantal voor ${item.productName}`}
                                className="h-9 w-20 rounded-md border border-zinc-700 bg-zinc-950 px-2 text-center font-mono text-sm font-bold text-white shadow-sm outline-none focus:border-sky-400"
                              />
                            </div>
                          ) : <div className="text-right text-xs text-zinc-600">{outstanding === 0 ? 'Volledig ontvangen' : `${outstanding} openstaand`}</div>}
                        </div>
                      );
                    })}
                  </div>

                  {order.status === 'draft' && (
                    <div className="mt-4 grid gap-3 rounded-xl border border-sky-400/15 bg-sky-400/[0.04] p-4 lg:grid-cols-[1fr_210px_auto] lg:items-end">
                      <label className="block text-xs font-semibold text-zinc-400">Bestelreferentie
                        <input value={references[order.id] ?? ''} onChange={(event) => updateReference(order.id, event.currentTarget.value)} placeholder="Bijv. PO-2026-0042" className="mt-1.5 h-10 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-white shadow-sm outline-none focus:border-sky-400" />
                      </label>
                      <label className="block text-xs font-semibold text-zinc-400">Verwachte levering
                        <input
                          type="date"
                          value={deliveryDates[order.id] ?? ''}
                          onChange={(event) => updateDeliveryDate(order.id, event.currentTarget.value)}
                          onInput={(event) => updateDeliveryDate(order.id, event.currentTarget.value)}
                          className="mt-1.5 h-10 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-white shadow-sm outline-none focus:border-sky-400"
                        />
                      </label>
                      <div className="flex gap-2">
                        <button type="button" disabled={isBusy} onClick={() => void saveDraft(order)} className="h-10 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-xs font-bold text-zinc-300 transition hover:text-white disabled:opacity-50">Bewaar concept</button>
                        <button type="button" disabled={isBusy} onClick={() => void markAsOrdered(order)} className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-md bg-sky-400 px-4 text-sm font-bold text-zinc-950 transition hover:bg-sky-300 disabled:opacity-50"><Truck size={16} />Markeer als besteld</button>
                      </div>
                      <div className="lg:col-span-3 flex flex-col gap-2 border-t border-sky-400/10 pt-3 sm:flex-row sm:items-center sm:justify-between">
                        <span className="text-xs text-zinc-500">Deze knop registreert de bestelling. Pwayment verstuurt niets automatisch.</span>
                        <button type="button" disabled={isBusy} onClick={() => void cancelDraft(order)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-500 hover:text-rose-300"><X size={14} />Annuleer concept</button>
                      </div>
                    </div>
                  )}

                  {(order.status === 'ordered' || order.status === 'partially-received') && (
                    <div className="mt-4 flex flex-col gap-3 rounded-xl border border-emerald-400/15 bg-emerald-400/[0.04] p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="flex items-center gap-2 text-sm font-semibold text-white"><CalendarDays size={15} className="text-emerald-300" />{order.reference || 'Geen bestelreferentie'}</div>
                        <div className="mt-1 text-xs text-zinc-500">Besteld op {formatDate(order.orderedAt)} · verwachte levering {formatDate(order.expectedDeliveryAt)}</div>
                      </div>
                      <div className="flex flex-col gap-2 sm:flex-row"><button type="button" disabled={isBusy || outstandingQty <= 0} onClick={() => receiveAllOutstanding(order)} className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-emerald-400/30 px-4 text-sm font-bold text-emerald-200 hover:bg-emerald-400/10 disabled:opacity-40"><PackageCheck size={16} />Ontvang alles</button><button type="button" disabled={isBusy || Object.values(receipts[order.id] ?? {}).every((quantity) => quantity <= 0)} onClick={() => void receiveOrder(order)} className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-emerald-400 px-4 text-sm font-bold text-zinc-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"><PackageCheck size={16} />Verwerk ontvangst</button></div>
                    </div>
                  )}

                  {order.status === 'received' && <div className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-400/15 bg-emerald-400/[0.04] px-3 py-2.5 text-sm text-emerald-200"><PackageCheck size={16} />Volledig ontvangen op {formatDate(order.receivedAt)}. Alle voorraadbewegingen zijn geregistreerd.</div>}
                  {order.status === 'cancelled' && <div className="mt-4 flex items-center gap-2 text-xs text-zinc-500"><Archive size={14} />Dit geannuleerde concept blijft beschikbaar voor de auditgeschiedenis.</div>}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
};
