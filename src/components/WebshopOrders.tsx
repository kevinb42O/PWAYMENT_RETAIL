import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleDollarSign,
  Clock3,
  MailCheck,
  PackageCheck,
  RefreshCw,
  RotateCcw,
  ShoppingBag,
  Truck,
  XCircle,
} from 'lucide-react';
import { WebshopFulfillmentStatus, WebshopOrder } from '../types';
import { useWebshopOrders } from '../store/useWebshopOrders';

const money = (cents: number) => new Intl.NumberFormat('nl-BE', { style: 'currency', currency: 'EUR' }).format(cents / 100);
const dateTime = (timestamp: number) => new Intl.DateTimeFormat('nl-BE', { dateStyle: 'medium', timeStyle: 'short' }).format(timestamp);

const paymentLabel: Record<string, string> = {
  bancontact: 'Bancontact', ideal: 'iDEAL', creditcard: 'Visa / Mastercard', applepay: 'Apple Pay / Google Pay', klarna: 'Klarna', pickup: 'Betalen bij afhalen',
};
const fulfillmentLabel: Record<WebshopFulfillmentStatus, string> = {
  unfulfilled: 'Nog te verwerken', processing: 'Wordt verwerkt', 'ready-for-pickup': 'Klaar voor afhalen', shipped: 'Verzonden', 'picked-up': 'Afgehaald',
};

const StatusPill = ({ tone, children }: { tone: 'green' | 'amber' | 'slate' | 'rose' | 'blue'; children: React.ReactNode }) => {
  const colors = {
    green: 'border-emerald-200 bg-emerald-50 text-emerald-700', amber: 'border-amber-200 bg-amber-50 text-amber-700', slate: 'border-slate-200 bg-slate-50 text-slate-600', rose: 'border-rose-200 bg-rose-50 text-rose-700', blue: 'border-sky-200 bg-sky-50 text-sky-700',
  };
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-black ${colors[tone]}`}>{children}</span>;
};

export const WebshopOrders: React.FC = () => {
  const { orders, loading, error, refresh, updateOrder } = useWebshopOrders();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filter, setFilter] = useState<'open' | 'completed' | 'cancelled' | 'all'>('open');
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => {
    void refresh();
    const onChange = () => void refresh();
    window.addEventListener('pwayment:webshop-orders-changed', onChange);
    const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('pwayment-webshop-orders') : null;
    if (channel) channel.onmessage = onChange;
    return () => {
      window.removeEventListener('pwayment:webshop-orders-changed', onChange);
      channel?.close();
    };
  }, [refresh]);

  const visibleOrders = useMemo(() => orders.filter((order) => {
    if (filter === 'open') return order.status !== 'completed' && order.status !== 'cancelled';
    return filter === 'all' || order.status === filter;
  }), [filter, orders]);
  const open = orders.filter((order) => order.status !== 'completed' && order.status !== 'cancelled').length;
  const revenue = orders.filter((order) => order.paymentStatus === 'paid').reduce((sum, order) => sum + order.totalCents, 0);
  const pendingPayment = orders.filter((order) => order.paymentStatus === 'pending' && order.status !== 'cancelled').length;

  const mutate = async (order: WebshopOrder, update: Parameters<typeof updateOrder>[1]) => {
    setUpdating(order.id);
    try { await updateOrder(order.id, update); } finally { setUpdating(null); }
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Demo-orders', value: orders.length, detail: 'Duurzaam lokaal opgeslagen', icon: ShoppingBag },
          { label: 'Te verwerken', value: open, detail: 'Actieve werkvoorraad', icon: Box },
          { label: 'Betaalde omzet', value: money(revenue), detail: 'Gesimuleerde betalingen', icon: CircleDollarSign },
          { label: 'Betaling open', value: pendingPayment, detail: 'Meestal betalen bij afhalen', icon: Clock3 },
        ].map(({ label, value, detail, icon: Icon }) => (
          <div key={label} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between"><span className="text-[10px] font-black uppercase tracking-wider text-slate-500">{label}</span><Icon size={17} className="text-slate-400" /></div>
            <div className="mt-2 text-2xl font-black tracking-tight text-slate-950">{value}</div>
            <div className="mt-1 text-[10px] font-semibold text-slate-500">{detail}</div>
          </div>
        ))}
      </div>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-base font-black text-slate-950">Webshopbestellingen</h3>
            <p className="mt-0.5 text-xs font-medium text-slate-500">Order, betaling, voorraadreservering en demo-e-mail blijven als één flow traceerbaar.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg bg-slate-100 p-1">
              {([['open', 'Open'], ['completed', 'Afgerond'], ['cancelled', 'Geannuleerd'], ['all', 'Alle']] as const).map(([id, label]) => (
                <button key={id} type="button" onClick={() => setFilter(id)} className={`rounded-md px-2.5 py-1.5 text-[10px] font-black ${filter === id ? 'bg-white text-slate-950 shadow-xs' : 'text-slate-500'}`}>{label}</button>
              ))}
            </div>
            <button type="button" onClick={() => void refresh()} aria-label="Bestellingen vernieuwen" className="grid h-10 w-10 place-items-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /></button>
          </div>
        </div>

        {error && <div className="border-b border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700">{error}</div>}
        {!loading && visibleOrders.length === 0 && (
          <div className="px-6 py-16 text-center"><ShoppingBag size={30} className="mx-auto text-slate-300" /><div className="mt-3 text-sm font-black text-slate-700">Nog geen bestellingen in deze weergave</div><p className="mt-1 text-xs text-slate-500">Plaats een bestelling via de webshoppreview om de volledige demo-flow te zien.</p></div>
        )}

        <div className="divide-y divide-slate-200">
          {visibleOrders.map((order) => {
            const isExpanded = expanded === order.id;
            const busy = updating === order.id;
            return (
              <article key={order.id} className="p-4 sm:p-5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-center">
                  <button type="button" onClick={() => setExpanded(isExpanded ? null : order.id)} className="flex min-w-0 flex-1 items-start gap-3 text-left">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600"><PackageCheck size={18} /></span>
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2"><strong className="font-mono text-sm text-slate-950">{order.number}</strong><StatusPill tone="blue">DEMO</StatusPill></span>
                      <span className="mt-1 block truncate text-xs font-bold text-slate-700">{order.customer.firstName} {order.customer.lastName} · {order.customer.email}</span>
                      <span className="mt-1 block text-[10px] font-semibold text-slate-500">{dateTime(order.createdAt)} · {order.lines.reduce((sum, line) => sum + line.quantity, 0)} artikelen</span>
                    </span>
                  </button>
                  <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                    <StatusPill tone={order.paymentStatus === 'paid' ? 'green' : order.paymentStatus === 'refunded' ? 'slate' : 'amber'}>{order.paymentStatus === 'paid' ? 'Betaald' : order.paymentStatus === 'refunded' ? 'Terugbetaald' : 'Betaling open'}</StatusPill>
                    <StatusPill tone={order.status === 'cancelled' ? 'rose' : order.status === 'completed' ? 'green' : 'slate'}>{order.status === 'cancelled' ? 'Geannuleerd' : order.status === 'completed' ? 'Afgerond' : fulfillmentLabel[order.fulfillmentStatus]}</StatusPill>
                    <strong className="min-w-20 text-right text-sm font-black text-slate-950">{money(order.totalCents)}</strong>
                    <button type="button" onClick={() => setExpanded(isExpanded ? null : order.id)} aria-label="Bestellingdetails tonen" className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-500">{isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}</button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="mt-5 grid gap-5 border-t border-slate-200 pt-5 lg:grid-cols-[minmax(0,1fr)_300px]">
                    <div className="space-y-4">
                      <div className="overflow-hidden rounded-xl border border-slate-200">
                        {order.lines.map((line) => <div key={`${order.id}-${line.productId}`} className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 last:border-0"><div className="min-w-0"><div className="truncate text-xs font-black text-slate-800">{line.productName}</div><div className="text-[10px] text-slate-500">{line.variant || 'Standaard'} · {line.quantity} × {money(line.unitPriceCents)}</div></div><strong className="text-xs text-slate-900">{money(line.lineTotalCents)}</strong></div>)}
                      </div>
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="rounded-xl bg-slate-50 p-3"><div className="text-[9px] font-black uppercase text-slate-400">Voorraad</div><div className="mt-1 text-xs font-black text-slate-800">{order.inventoryStatus === 'reserved' ? 'Gereserveerd' : order.inventoryStatus === 'committed' ? 'Definitief afgeboekt' : 'Vrijgegeven'}</div></div>
                        <div className="rounded-xl bg-slate-50 p-3"><div className="text-[9px] font-black uppercase text-slate-400">Betaling</div><div className="mt-1 text-xs font-black text-slate-800">{paymentLabel[order.paymentMethod] || order.paymentMethod}</div><div className="mt-0.5 truncate font-mono text-[9px] text-slate-400">{order.paymentReference}</div></div>
                        <div className="rounded-xl bg-slate-50 p-3"><div className="flex items-center gap-1 text-[9px] font-black uppercase text-slate-400"><MailCheck size={11} /> E-mail</div><div className="mt-1 text-xs font-black text-emerald-700">Demo verzonden</div><div className="mt-0.5 truncate text-[9px] text-slate-400">{order.confirmationEmail.to}</div></div>
                      </div>
                      {(order.shippingAddress || order.pickupAddress || order.note) && <div className="rounded-xl border border-slate-200 p-4 text-xs"><strong className="text-slate-900">{order.deliveryMode === 'pickup' ? 'Afhalen' : 'Levering'}</strong><div className="mt-1 text-slate-600">{order.deliveryMode === 'pickup' ? order.pickupAddress : `${order.shippingAddress?.street} ${order.shippingAddress?.number}, ${order.shippingAddress?.postal} ${order.shippingAddress?.city}`}</div>{order.note && <div className="mt-2 border-t border-slate-100 pt-2 text-slate-500">Opmerking: {order.note}</div>}</div>}
                    </div>

                    <aside className="space-y-3">
                      <div className="rounded-xl border border-slate-200 p-4">
                        <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">Orderverwerking</div>
                        <div className="mt-3 space-y-2">
                          {order.status === 'pending' && <button disabled={busy} onClick={() => void mutate(order, { status: 'confirmed' })} className="flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-slate-950 px-3 text-xs font-black text-white disabled:opacity-50"><CheckCircle2 size={14} /> Bevestigen</button>}
                          {order.status !== 'cancelled' && order.status !== 'completed' && (
                            <>
                              {order.fulfillmentStatus === 'unfulfilled' && <button disabled={busy} onClick={() => void mutate(order, { status: 'confirmed', fulfillmentStatus: 'processing' })} className="flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-slate-300 text-xs font-black text-slate-700 disabled:opacity-50"><Box size={14} /> Verwerking starten</button>}
                              {order.fulfillmentStatus === 'processing' && <button disabled={busy} onClick={() => void mutate(order, { fulfillmentStatus: order.deliveryMode === 'pickup' ? 'ready-for-pickup' : 'shipped' })} className="flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-slate-300 text-xs font-black text-slate-700 disabled:opacity-50">{order.deliveryMode === 'pickup' ? <PackageCheck size={14} /> : <Truck size={14} />}{order.deliveryMode === 'pickup' ? 'Klaar voor afhalen' : 'Markeer verzonden'}</button>}
                              {order.fulfillmentStatus === 'ready-for-pickup' && <button disabled={busy} onClick={() => void mutate(order, { paymentStatus: 'paid', fulfillmentStatus: 'picked-up' })} className="flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-slate-300 text-xs font-black text-slate-700 disabled:opacity-50"><CheckCircle2 size={14} /> Afgehaald en betaald</button>}
                              <button disabled={busy} onClick={() => void mutate(order, { status: 'cancelled' })} className="flex min-h-10 w-full items-center justify-center gap-2 rounded-lg text-xs font-black text-rose-600 hover:bg-rose-50 disabled:opacity-50"><XCircle size={14} /> Annuleren en voorraad vrijgeven</button>
                            </>
                          )}
                          {order.status === 'cancelled' && <div className="flex items-center gap-2 rounded-lg bg-slate-50 p-3 text-[10px] font-bold text-slate-500"><RotateCcw size={14} /> Voorraad werd automatisch hersteld.</div>}
                        </div>
                      </div>
                      <div className="space-y-1 px-1 text-xs"><div className="flex justify-between text-slate-500"><span>Subtotaal</span><strong>{money(order.subtotalCents)}</strong></div>{order.discountCents > 0 && <div className="flex justify-between text-emerald-700"><span>Korting</span><strong>− {money(order.discountCents)}</strong></div>}<div className="flex justify-between text-slate-500"><span>Verzending</span><strong>{order.shippingCents ? money(order.shippingCents) : 'Gratis'}</strong></div><div className="mt-2 flex justify-between border-t border-slate-200 pt-2 text-base font-black text-slate-950"><span>Totaal</span><span>{money(order.totalCents)}</span></div></div>
                    </aside>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
};
