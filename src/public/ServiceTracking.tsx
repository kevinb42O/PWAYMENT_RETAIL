import React, { useEffect, useState } from "react";
import {
  CheckCircle2,
  Clock3,
  Mail,
  MapPin,
  PackageCheck,
  Phone,
  RefreshCw,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import {
  getPublicServiceOrder,
  type PublicServiceOrder,
} from "../services/serviceOrders";
import type { ServiceOrderSystemStatus } from "../types";
import { formatEUR } from "../utils/money";

const STATUS: Record<
  ServiceOrderSystemStatus,
  { label: string; description: string; step: number }
> = {
  open: { label: "Ontvangen", description: "Uw dossier is geregistreerd.", step: 1 },
  "in-progress": { label: "In behandeling", description: "Wij werken aan uw dossier.", step: 2 },
  blocked: { label: "Wacht op actie", description: "Wij wachten op een onderdeel, partner of beslissing.", step: 2 },
  ready: { label: "Klaar voor afhaling", description: "Uw product of toestel staat klaar.", step: 3 },
  closed: { label: "Afgehaald", description: "Het dossier is afgerond.", step: 4 },
  cancelled: { label: "Geannuleerd", description: "Dit dossier werd geannuleerd.", step: 0 },
};

const formatDateTime = (timestamp: number): string =>
  new Intl.DateTimeFormat("nl-BE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(timestamp);

const formatDate = (timestamp?: number): string =>
  timestamp
    ? new Intl.DateTimeFormat("nl-BE", { dateStyle: "long" }).format(timestamp)
    : "Nog niet afgesproken";

const tokenFromPath = (): string => {
  const token = window.location.pathname.split("/service/")[1]?.split("/")[0] ?? "";
  try {
    return decodeURIComponent(token);
  } catch {
    return "";
  }
};

const ServiceTracking: React.FC = () => {
  const [order, setOrder] = useState<PublicServiceOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const token = tokenFromPath();

  const load = async () => {
    setLoading(true);
    const result = token ? await getPublicServiceOrder(token) : null;
    setOrder(result);
    setNotFound(!result);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  if (loading) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-slate-100 p-6">
        <div className="text-center"><RefreshCw size={28} className="mx-auto animate-spin text-sky-600" /><div className="mt-4 text-sm font-bold text-slate-600">Dossier veilig ophalen…</div></div>
      </main>
    );
  }

  if (notFound || !order) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-slate-100 p-6">
        <section className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-xl">
          <ShieldCheck size={42} className="mx-auto text-slate-300" />
          <h1 className="mt-5 text-xl font-black text-slate-900">Dossier niet gevonden</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">Controleer of u de volledige persoonlijke link uit uw herstelbon of e-mail hebt geopend.</p>
          <button type="button" onClick={() => void load()} className="mt-5 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white">Opnieuw proberen</button>
        </section>
      </main>
    );
  }

  const status = STATUS[order.status];
  const balance = Math.max(0, order.totalCents - order.paidCents);

  return (
    <main className="min-h-dvh bg-[#f4f6f8] text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-5 sm:px-8">
          <div><div className="text-lg font-black tracking-tight">{order.merchantSnapshot.name}</div><div className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Service & herstellingen</div></div>
          <div className="rounded-full bg-emerald-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-emerald-700"><ShieldCheck size={13} className="mr-1 inline" /> Persoonlijke dossierlink</div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl space-y-5 px-5 py-7 sm:px-8 sm:py-10">
        <section className="overflow-hidden rounded-3xl bg-slate-950 text-white shadow-xl">
          <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[1fr_auto]">
            <div><div className="text-xs font-black uppercase tracking-[0.18em] text-sky-300">Dossier {order.number}</div><h1 className="mt-3 text-2xl font-black sm:text-3xl">{status.label}</h1><p className="mt-2 max-w-xl text-sm leading-6 text-slate-300">{order.substatus || status.description}</p><div className="mt-5 flex flex-wrap gap-2 text-xs font-semibold text-slate-300"><span className="rounded-lg bg-white/10 px-3 py-1.5">{order.assetType}</span>{order.brand && <span className="rounded-lg bg-white/10 px-3 py-1.5">{order.brand}</span>}{order.model && <span className="rounded-lg bg-white/10 px-3 py-1.5">{order.model}</span>}</div></div>
            <div className="flex h-24 w-24 items-center justify-center self-center rounded-3xl bg-sky-500/20 text-sky-300 ring-1 ring-sky-400/30">{order.status === "ready" || order.status === "closed" ? <PackageCheck size={45} /> : <Wrench size={42} />}</div>
          </div>
        </section>

        {order.status !== "cancelled" && (
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
            <div className="grid grid-cols-4 gap-2">
              {["Ontvangen", "Behandeling", "Klaar", "Afgerond"].map((label, index) => {
                const reached = index + 1 <= status.step;
                const active = index + 1 === status.step;
                return <div key={label} className="text-center"><div className={`mx-auto flex h-9 w-9 items-center justify-center rounded-full border-4 border-white text-xs font-black shadow-sm ${reached ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-500"}`}>{reached ? <CheckCircle2 size={17} /> : index + 1}</div><div className={`mt-2 text-[10px] font-black sm:text-xs ${active ? "text-emerald-700" : "text-slate-500"}`}>{label}</div>{index < 3 && <div className={`relative -z-0 -mr-[55%] -mt-[31px] ml-[55%] h-1 ${index + 1 < status.step ? "bg-emerald-400" : "bg-slate-200"}`} />}</div>;
              })}
            </div>
          </section>
        )}

        <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
            <h2 className="text-sm font-black text-slate-900">Laatste updates</h2>
            <div className="mt-5 space-y-0">
              {[...order.events].reverse().map((event, index) => (
                <div key={event.id} className="relative flex gap-4 pb-6 last:pb-0"><div className="relative z-10 mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-700 ring-4 ring-white"><Clock3 size={14} /></div>{index < order.events.length - 1 && <div className="absolute bottom-0 left-4 top-7 w-px bg-slate-200" />}<div><div className="text-sm font-extrabold text-slate-800">{event.label}</div>{event.detail && <div className="mt-1 text-xs leading-5 text-slate-500">{event.detail}</div>}<div className="mt-1 text-[10px] font-semibold text-slate-400">{formatDateTime(event.timestamp)}</div></div></div>
              ))}
            </div>
          </section>

          <aside className="space-y-5">
            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-2"><Clock3 size={16} className="text-sky-600" /><div className="text-xs font-black uppercase tracking-wide text-slate-500">Verwachte datum</div></div><div className="mt-3 text-base font-black text-slate-900">{formatDate(order.promisedAt)}</div></section>
            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="text-xs font-black uppercase tracking-wide text-slate-500">Prijsinformatie</div><div className="mt-3 flex items-end justify-between"><div><div className="text-[10px] font-bold text-slate-400">Totaal</div><div className="text-lg font-black">{formatEUR(order.totalCents)}</div></div><div className="text-right"><div className="text-[10px] font-bold text-slate-400">Openstaand</div><div className={`text-lg font-black ${balance > 0 ? "text-amber-700" : "text-emerald-700"}`}>{formatEUR(balance)}</div></div></div></section>
            <section className="rounded-3xl bg-slate-950 p-5 text-white"><div className="text-xs font-black uppercase tracking-wide text-slate-400">Contact</div><div className="mt-3 text-base font-black">{order.merchantSnapshot.name}</div>{order.merchantSnapshot.addressLine1 && <div className="mt-2 flex gap-2 text-xs leading-5 text-slate-300"><MapPin size={14} className="mt-0.5 shrink-0" /> <span>{order.merchantSnapshot.addressLine1}<br />{order.merchantSnapshot.addressLine2}</span></div>}<div className="mt-4 grid gap-2">{order.merchantSnapshot.phone && <a href={`tel:${order.merchantSnapshot.phone.replace(/[^+\d]/g, "")}`} className="inline-flex items-center justify-center gap-2 rounded-xl bg-white/10 px-3 py-2.5 text-xs font-bold hover:bg-white/20"><Phone size={15} /> Bel de winkel</a>}{order.merchantSnapshot.email && <a href={`mailto:${order.merchantSnapshot.email}?subject=${encodeURIComponent(`Vraag over ${order.number}`)}`} className="inline-flex items-center justify-center gap-2 rounded-xl bg-white/10 px-3 py-2.5 text-xs font-bold hover:bg-white/20"><Mail size={15} /> E-mail de winkel</a>}</div></section>
          </aside>
        </div>

        <p className="pb-6 text-center text-[10px] leading-4 text-slate-400">Deze persoonlijke link bevat alleen informatie die nodig is om uw herstelling te volgen. Deel de link niet publiek.</p>
      </div>
    </main>
  );
};

export default ServiceTracking;
