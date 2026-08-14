import React, { useEffect, useState } from "react";
import { AlertTriangle, Check, LockKeyhole, ShieldCheck, X } from "lucide-react";
import { useAuth } from "../auth/useAuth";
import { useWorkforce } from "../store/useWorkforce";
import { formatMinutes, leaveStatusLabel } from "../workforce/format";
import type { LeaveRequest } from "../workforce/types";
import { Modal } from "./Modal";
import { FeedbackBanner } from "./ui/FeedbackBanner";
import { fieldClassName } from "./ui/Field";

const fieldClass = fieldClassName;
const buttonClass = "inline-flex h-9 items-center justify-center gap-2 rounded-xl border px-3.5 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-50";

const riskPresentation = (request: LeaveRequest) => request.coverageRisk === "red"
  ? { label: "Onder minimumbezetting", tone: "border-rose-200 bg-rose-50 text-rose-800" }
  : request.coverageRisk === "amber"
    ? { label: "Planning vraagt aandacht", tone: "border-amber-200 bg-amber-50 text-amber-900" }
    : { label: "Geen conflict voorzien", tone: "border-emerald-200 bg-emerald-50 text-emerald-800" };

export const LeaveApprovalCenter: React.FC = () => {
  const { currentStoreId, currentRole } = useAuth();
  const storeId = currentStoreId ?? (import.meta.env.VITE_E2E_BUILD === "true" ? "fixture-store" : null);
  const workforce = useWorkforce();
  const [selected, setSelected] = useState<{ request: LeaveRequest; decision: "approved" | "rejected" } | null>(null);
  const [note, setNote] = useState("");
  const [pin, setPin] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (storeId) void workforce.load(storeId, true);
  }, [storeId, workforce.load]);

  if (currentRole !== "owner") return null;

  const pending = workforce.requests.filter((request) => request.status === "pending");
  const requiresAttention = pending.filter((request) => request.coverageRisk === "red" || request.coverageRisk === "amber").length;
  const openDecision = (request: LeaveRequest, decision: "approved" | "rejected") => {
    setSelected({ request, decision });
    setNote("");
    setPin("");
  };

  return <div className="mx-auto w-full max-w-6xl space-y-5">
    {(workforce.error || notice) && <FeedbackBanner tone={workforce.error ? "error" : "success"}>{workforce.error ?? notice}</FeedbackBanner>}

    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xs">
      <header className="flex flex-col gap-4 border-b border-slate-100 px-5 py-5 sm:flex-row sm:items-start sm:justify-between">
        <div><p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-cyan-700">Eigenaarstoegang</p><h2 className="mt-1 text-lg font-black tracking-tight text-slate-950">Verlof goedkeuren</h2><p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">Je bekijkt hier uitsluitend aanvragen die een beslissing vereisen. Medewerkers kunnen deze beheerpagina niet openen vanuit Personeel & verlof.</p></div>
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800"><ShieldCheck size={16} /> PIN-toegang bevestigd</div>
      </header>
      <div className="grid gap-px border-b border-slate-100 bg-slate-100 sm:grid-cols-3"><div className="bg-white px-5 py-4"><p className="text-[10px] font-extrabold uppercase tracking-wide text-slate-500">Te beslissen</p><p className="mt-1 text-2xl font-black tabular-nums text-slate-950">{pending.length}</p></div><div className="bg-white px-5 py-4"><p className="text-[10px] font-extrabold uppercase tracking-wide text-slate-500">Planningimpact</p><p className="mt-1 text-2xl font-black tabular-nums text-amber-700">{requiresAttention}</p></div><div className="bg-white px-5 py-4"><p className="text-[10px] font-extrabold uppercase tracking-wide text-slate-500">Beslisregel</p><p className="mt-1 text-xs font-bold leading-5 text-slate-700">Elke definitieve keuze vraagt opnieuw jouw PIN.</p></div></div>

      {!workforce.approvalPinConfigured ? <div className="m-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-950"><AlertTriangle size={18} className="mt-0.5 shrink-0" /><p><strong>Goedkeurings-PIN ontbreekt.</strong> Stel die eerst in via <strong>Instellingen → Personeel & verlof</strong>. Zonder PIN kan geen enkele aanvraag definitief worden beslist.</p></div> : pending.length ? <div className="divide-y divide-slate-100">{pending.map((request) => { const risk = riskPresentation(request); return <article key={request.id} className="grid gap-4 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_210px_auto] lg:items-center"><div><div className="flex flex-wrap items-center gap-x-2 gap-y-1"><h3 className="text-sm font-bold text-slate-950">{request.employeeName}</h3><span className="text-xs text-slate-400">{request.leaveTypeName}</span></div><p className="mt-1 text-xs font-semibold text-slate-700">{request.startDate} – {request.endDate} <span className="font-normal text-slate-400">·</span> {formatMinutes(request.totalMinutes)}</p>{request.employeeNote && <p className="mt-2 text-xs leading-5 text-slate-500"><span className="font-bold text-slate-600">Toelichting: </span>{request.employeeNote}</p>}</div><div><span className={`inline-flex rounded-lg border px-2.5 py-1 text-[11px] font-bold ${risk.tone}`}>{risk.label}</span><p className="mt-1.5 text-[11px] leading-4 text-slate-500">{request.coverageSnapshot.summary}</p></div><div className="flex gap-2 lg:justify-end"><button type="button" onClick={() => openDecision(request, "rejected")} className={`${buttonClass} border-rose-200 bg-white text-rose-700 hover:bg-rose-50`}><X size={15} /> Afwijzen</button><button type="button" onClick={() => openDecision(request, "approved")} className={`${buttonClass} border-cyan-200 bg-cyan-50 text-cyan-800 hover:bg-cyan-100`}><Check size={15} /> Goedkeuren</button></div></article>; })}</div> : <div className="grid min-h-52 place-items-center px-5 text-center"><div><ShieldCheck size={28} className="mx-auto text-emerald-500" /><p className="mt-3 text-sm font-bold text-slate-800">Alles is behandeld.</p><p className="mt-1 text-xs text-slate-500">Er wachten geen verlofaanvragen op een beslissing.</p></div></div>}
    </section>

    {selected && storeId && <Modal open onClose={() => setSelected(null)} title={selected.decision === "approved" ? "Verlof definitief goedkeuren" : "Verlof definitief afwijzen"} subtitle={`${selected.request.employeeName} · ${selected.request.startDate} tot ${selected.request.endDate}`} icon={<LockKeyhole size={18} />} size="2xl" closeOnBackdrop><div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="text-[10px] font-extrabold uppercase tracking-wide text-slate-500">Impact op planning</p><p className="mt-1 text-xs font-bold text-slate-800">{riskPresentation(selected.request).label}</p><p className="mt-1 text-xs leading-5 text-slate-500">{selected.request.coverageSnapshot.summary}</p></div><label className="block text-xs font-bold text-slate-700">Motivatie{selected.decision === "rejected" ? " (verplicht)" : ""}<textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} maxLength={2000} className={fieldClass} placeholder={selected.decision === "approved" ? "Verplicht als je ondanks een tekort goedkeurt." : "Leg kort uit waarom de aanvraag niet kan."} /></label><label className="block text-xs font-bold text-slate-700"><span className="flex items-center gap-1.5"><LockKeyhole size={14} /> Bevestig met je persoonlijke PIN</span><input aria-label="Goedkeurings-PIN" type="password" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))} className={fieldClass} placeholder="6 cijfers" /></label><div className="flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={() => setSelected(null)} className={`${buttonClass} border-slate-200 bg-white text-slate-700 hover:bg-slate-50`}>Annuleren</button><button type="button" disabled={workforce.mutating || pin.length !== 6 || (selected.decision === "rejected" && !note.trim())} onClick={async () => { if (await workforce.decide(storeId, selected.request.id, selected.decision, note, pin)) { setNotice(selected.decision === "approved" ? "Aanvraag goedgekeurd en geregistreerd." : "Aanvraag afgewezen en geregistreerd."); setSelected(null); } }} className={`${buttonClass} ${selected.decision === "approved" ? "border-cyan-200 bg-cyan-50 text-cyan-800 hover:bg-cyan-100" : "border-rose-200 bg-white text-rose-700 hover:bg-rose-50"}`}><LockKeyhole size={14} /> {selected.decision === "approved" ? "Definitief goedkeuren" : "Definitief afwijzen"}</button></div></Modal>}
  </div>;
};
