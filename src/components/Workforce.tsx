import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  Check,
  Clock3,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { useAuth } from "../auth/useAuth";
import { useWorkforce } from "../store/useWorkforce";
import type { CoverageRisk, LeaveRequest } from "../workforce/types";
import { formatMinutes, formatWorkdays, leaveStatusLabel, todayIso } from "../workforce/format";

type WorkforceTab = "overview" | "requests" | "team";

const dateFormatter = new Intl.DateTimeFormat("nl-BE", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const formatDate = (value: string): string => dateFormatter.format(new Date(`${value}T12:00:00`));

const riskStyle: Record<CoverageRisk, string> = {
  green: "border-emerald-200 bg-emerald-50 text-emerald-700",
  amber: "border-amber-200 bg-amber-50 text-amber-700",
  red: "border-rose-200 bg-rose-50 text-rose-700",
  unknown: "border-slate-200 bg-slate-50 text-slate-600",
};

const riskLabel: Record<CoverageRisk, string> = {
  green: "Dekking goed",
  amber: "Minimumbezetting",
  red: "Dekking in gevaar",
  unknown: "Nog te analyseren",
};

const statusStyle: Record<LeaveRequest["status"], string> = {
  pending: "bg-amber-50 text-amber-700 ring-amber-200",
  approved: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  rejected: "bg-rose-50 text-rose-700 ring-rose-200",
  withdrawn: "bg-slate-100 text-slate-600 ring-slate-200",
  cancelled: "bg-slate-100 text-slate-600 ring-slate-200",
};

const EmptyState = ({ title, detail }: { title: string; detail: string }) => (
  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
    <CalendarDays className="mx-auto mb-3 text-slate-400" size={28} />
    <p className="font-bold text-slate-800">{title}</p>
    <p className="mt-1 text-sm text-slate-500">{detail}</p>
  </div>
);

const RequestCard = ({
  request,
  canManage,
  ownEmployeeId,
  busy,
  onDecision,
  onWithdraw,
}: {
  request: LeaveRequest;
  canManage: boolean;
  ownEmployeeId?: string;
  busy: boolean;
  onDecision: (request: LeaveRequest, decision: "approved" | "rejected") => void;
  onWithdraw: (request: LeaveRequest) => void;
}) => {
  const ownRequest = request.employeeId === ownEmployeeId;
  const futureApproved = request.status === "approved" && request.startDate > todayIso();
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${statusStyle[request.status]}`}>
              {leaveStatusLabel[request.status]}
            </span>
            <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${riskStyle[request.coverageRisk]}`}>
              {riskLabel[request.coverageRisk]}
            </span>
          </div>
          <h3 className="mt-3 truncate text-base font-extrabold text-slate-900">
            {canManage ? `${request.employeeName} · ` : ""}{request.leaveTypeName}
          </h3>
          <p className="mt-1 text-sm font-medium text-slate-600">
            {formatDate(request.startDate)} – {formatDate(request.endDate)}
            <span className="mx-2 text-slate-300">•</span>
            {formatMinutes(request.totalMinutes)}
          </p>
          {request.employeeNote && <p className="mt-2 text-sm text-slate-600">“{request.employeeNote}”</p>}
          {request.decisionNote && (
            <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Beslissing: {request.decisionNote}
            </p>
          )}
          <p className="mt-3 flex items-start gap-1.5 text-xs text-slate-500">
            <Sparkles size={14} className="mt-0.5 shrink-0 text-sky-500" />
            {request.coverageSnapshot?.summary ?? "De bezetting wordt bij de beslissing opnieuw berekend."}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {canManage && request.status === "pending" && !ownRequest && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => onDecision(request, "rejected")}
                className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-bold text-rose-700 transition hover:bg-rose-50 disabled:opacity-50"
              >
                <X size={15} /> Afwijzen
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => onDecision(request, "approved")}
                className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50"
              >
                <Check size={15} /> Goedkeuren
              </button>
            </>
          )}
          {ownRequest && (request.status === "pending" || futureApproved) && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onWithdraw(request)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
            >
              Intrekken
            </button>
          )}
        </div>
      </div>
    </article>
  );
};

export const Workforce: React.FC = () => {
  const { currentStoreId, currentRole } = useAuth();
  const workforceStoreId = currentStoreId ?? (import.meta.env.VITE_E2E_BUILD === "true" ? "fixture-store" : null);
  const workforce = useWorkforce();
  const [tab, setTab] = useState<WorkforceTab>("overview");
  const [requestOpen, setRequestOpen] = useState(false);
  const [decision, setDecision] = useState<{ request: LeaveRequest; type: "approved" | "rejected" } | null>(null);
  const [decisionNote, setDecisionNote] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState({ leaveTypeId: "", startDate: todayIso(), endDate: todayIso(), note: "" });

  useEffect(() => {
    if (workforceStoreId) void workforce.load(workforceStoreId);
  }, [workforceStoreId, workforce.load]);

  useEffect(() => {
    if (!form.leaveTypeId && workforce.leaveTypes[0]) {
      setForm((current) => ({ ...current, leaveTypeId: workforce.leaveTypes[0].id }));
    }
  }, [form.leaveTypeId, workforce.leaveTypes]);

  const ownBalances = useMemo(
    () => workforce.balances.filter((balance) => balance.employeeId === workforce.employee?.id),
    [workforce.balances, workforce.employee?.id],
  );
  const ownRequests = useMemo(
    () => workforce.requests.filter((request) => request.employeeId === workforce.employee?.id),
    [workforce.requests, workforce.employee?.id],
  );
  const pendingTeam = useMemo(
    () => workforce.requests.filter((request) => request.status === "pending"),
    [workforce.requests],
  );

  const submitRequest = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!workforceStoreId) return;
    const fields = new FormData(event.currentTarget as HTMLFormElement);
    const submitted = {
      leaveTypeId: String(fields.get("leaveTypeId") ?? form.leaveTypeId),
      startDate: String(fields.get("startDate") ?? form.startDate),
      endDate: String(fields.get("endDate") ?? form.endDate),
      note: String(fields.get("note") ?? form.note),
    };
    if (submitted.endDate < submitted.startDate) return;
    const success = await workforce.submit(workforceStoreId, submitted);
    if (success) {
      setRequestOpen(false);
      setNotice("Je verlofaanvraag is veilig ingediend en het saldo is gereserveerd.");
      setForm((current) => ({ ...current, note: "" }));
    }
  };

  const completeDecision = async () => {
    if (!workforceStoreId || !decision) return;
    const success = await workforce.decide(workforceStoreId, decision.request.id, decision.type, decisionNote);
    if (success) {
      setNotice(decision.type === "approved" ? "De aanvraag is goedgekeurd." : "De aanvraag is afgewezen en het saldo is vrijgegeven.");
      setDecision(null);
      setDecisionNote("");
    }
  };

  const withdrawRequest = async (request: LeaveRequest) => {
    if (!workforceStoreId || !window.confirm("Deze verlofaanvraag intrekken?")) return;
    if (await workforce.withdraw(workforceStoreId, request.id)) setNotice("De aanvraag is ingetrokken.");
  };

  if (workforce.loading && !workforce.hydrated) {
    return <div className="flex flex-1 items-center justify-center bg-slate-50 text-sm font-semibold text-slate-500">Personeelsplanning laden…</div>;
  }

  return (
    <main className="flex-1 overflow-y-auto bg-slate-50">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-sky-600">Personeel & verlof</p>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950">
              {currentRole === "cashier" ? "Mijn werk" : "Team"}
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">
              Uren, verlofsaldi en bezetting in één controleerbare flow. Voorspellingen adviseren; een mens beslist.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => workforceStoreId && void workforce.load(workforceStoreId, true)}
              className="rounded-xl border border-slate-200 bg-white p-2.5 text-slate-600 shadow-sm transition hover:border-sky-200 hover:text-sky-700"
              aria-label="Personeelsgegevens vernieuwen"
            >
              <RefreshCw size={18} className={workforce.loading ? "animate-spin" : ""} />
            </button>
            <button
              type="button"
              onClick={() => setRequestOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-extrabold text-white shadow-sm transition hover:bg-sky-700"
            >
              <Plus size={18} /> Verlof aanvragen
            </button>
          </div>
        </div>

        {(workforce.error || notice) && (
          <div className={`mt-5 flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${workforce.error ? "border-rose-200 bg-rose-50 text-rose-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`} role={workforce.error ? "alert" : "status"}>
            <span>{workforce.error ?? notice}</span>
            <button type="button" onClick={() => { workforce.clearError(); setNotice(null); }} aria-label="Melding sluiten"><X size={16} /></button>
          </div>
        )}

        <div className="mt-6 flex gap-1 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm" role="tablist">
          {([
            ["overview", "Overzicht"],
            ["requests", `Mijn aanvragen${ownRequests.length ? ` (${ownRequests.length})` : ""}`],
            ...(workforce.canManage ? [["team", `Te beoordelen${pendingTeam.length ? ` (${pendingTeam.length})` : ""}`]] : []),
          ] as [WorkforceTab, string][]).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`flex-1 rounded-xl px-3 py-2 text-sm font-bold transition ${tab === key ? "bg-sky-50 text-sky-700 ring-1 ring-sky-200" : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"}`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "overview" && (
          <div className="mt-6 space-y-6">
            <section>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-extrabold text-slate-900">Mijn verlofsaldi</h2>
                <span className="text-xs text-slate-500">Minuten zijn de juridische bronwaarde</span>
              </div>
              {ownBalances.length ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {ownBalances.map((balance) => {
                    const percentage = balance.grantedMinutes > 0 ? Math.max(0, Math.min(100, balance.availableMinutes / balance.grantedMinutes * 100)) : 0;
                    return (
                      <div key={balance.accountId} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{balance.year}</p>
                            <h3 className="mt-1 font-extrabold text-slate-900">{balance.leaveTypeName}</h3>
                          </div>
                          <span className={`rounded-full px-2 py-1 text-[11px] font-bold ${balance.status === "estimated" ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>
                            {balance.status === "estimated" ? "Raming" : "Bevestigd"}
                          </span>
                        </div>
                        <p className="mt-5 text-3xl font-black tracking-tight text-slate-950">{formatWorkdays(balance.availableMinutes)}</p>
                        <p className="mt-1 text-xs text-slate-500">{formatMinutes(balance.availableMinutes)} beschikbaar</p>
                        <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
                          <div className="h-full rounded-full bg-sky-500" style={{ width: `${percentage}%` }} />
                        </div>
                        {balance.status === "estimated" && <p className="mt-3 text-xs leading-5 text-amber-700">Automatische raming van vier werkweken. De zaakvoerder moet het officiële recht nog bevestigen.</p>}
                      </div>
                    );
                  })}
                </div>
              ) : <EmptyState title="Nog geen verlofsaldo" detail="De zaakvoerder kan je officiële saldo in de personeelsinstellingen toevoegen." />}
            </section>

            <section className="grid gap-4 lg:grid-cols-3">
              <div className="rounded-2xl border border-sky-200 bg-sky-50 p-5 lg:col-span-2">
                <div className="flex gap-3">
                  <div className="rounded-xl bg-white p-2 text-sky-600 shadow-sm"><Sparkles size={20} /></div>
                  <div>
                    <h2 className="font-extrabold text-sky-950">Slimme bezettingscontrole</h2>
                    <p className="mt-1 text-sm leading-6 text-sky-800">Bij elke aanvraag controleren we werkpatronen, goedgekeurde afwezigheden, minimumbezetting en vereiste competenties. De analyse wordt bewaard zodat achteraf duidelijk blijft waarop de beslissing steunde.</p>
                  </div>
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-2 text-slate-900"><Clock3 size={18} className="text-sky-600" /><h2 className="font-extrabold">Mijn standaardweek</h2></div>
                <p className="mt-3 text-2xl font-black text-slate-950">{workforce.employee?.weeklyMinutes ? formatMinutes(workforce.employee.weeklyMinutes) : "Nog niet ingesteld"}</p>
                <p className="mt-1 text-xs text-slate-500">{workforce.employee?.scheduledDays ? `${workforce.employee.scheduledDays} geplande werkdagen · ${formatMinutes(Math.round((workforce.employee.weeklyMinutes ?? 0) / workforce.employee.scheduledDays))} gemiddeld/dag` : "Vraag je manager om je werkpatroon in te stellen."}</p>
              </div>
            </section>
          </div>
        )}

        {tab === "requests" && (
          <section className="mt-6 space-y-3">
            {ownRequests.length ? ownRequests.map((request) => (
              <RequestCard key={request.id} request={request} canManage={false} ownEmployeeId={workforce.employee?.id} busy={workforce.mutating} onDecision={() => undefined} onWithdraw={withdrawRequest} />
            )) : <EmptyState title="Nog geen aanvragen" detail="Je ingediende en besliste verlofaanvragen verschijnen hier." />}
          </section>
        )}

        {tab === "team" && workforce.canManage && (
          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)]">
            <section className="space-y-3">
              {pendingTeam.length ? pendingTeam.map((request) => (
                <RequestCard key={request.id} request={request} canManage ownEmployeeId={workforce.employee?.id} busy={workforce.mutating} onDecision={(item, type) => { setDecision({ request: item, type }); setDecisionNote(""); }} onWithdraw={withdrawRequest} />
              )) : <EmptyState title="Alles is bijgewerkt" detail="Er zijn momenteel geen openstaande verlofaanvragen." />}
            </section>
            <aside className="space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-2"><Users size={18} className="text-sky-600" /><h2 className="font-extrabold text-slate-900">Actief team</h2></div>
                <p className="mt-3 text-3xl font-black text-slate-950">{workforce.team.filter((member) => member.status === "active").length}</p>
                <p className="text-xs text-slate-500">medewerkers gekoppeld aan deze winkel</p>
              </div>
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
                <div className="flex items-center gap-2 text-emerald-800"><ShieldCheck size={18} /><h2 className="font-extrabold">Vier-ogenprincipe</h2></div>
                <p className="mt-2 text-sm leading-6 text-emerald-800">Niemand kan zijn eigen aanvraag goedkeuren. Een rode dekkingsscore vereist altijd een expliciete motivatie.</p>
              </div>
            </aside>
          </div>
        )}
      </div>

      {requestOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/20 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setRequestOpen(false)}>
          <form onSubmit={submitRequest} className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="leave-request-title">
            <div className="flex items-start justify-between gap-4">
              <div><p className="text-xs font-extrabold uppercase tracking-wider text-sky-600">Nieuwe aanvraag</p><h2 id="leave-request-title" className="mt-1 text-xl font-black text-slate-950">Wanneer wil je verlof?</h2></div>
              <button type="button" onClick={() => setRequestOpen(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Sluiten"><X size={19} /></button>
            </div>
            <div className="mt-6 space-y-4">
              <label className="block text-sm font-bold text-slate-700">Type verlof
                <select name="leaveTypeId" required value={form.leaveTypeId} onChange={(event) => setForm((current) => ({ ...current, leaveTypeId: event.target.value }))} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 font-medium text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100">
                  {workforce.leaveTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm font-bold text-slate-700">Van
                  <input name="startDate" type="date" required min={todayIso()} value={form.startDate} onChange={(event) => setForm((current) => ({ ...current, startDate: event.target.value, endDate: event.target.value > current.endDate ? event.target.value : current.endDate }))} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100" />
                </label>
                <label className="block text-sm font-bold text-slate-700">Tot en met
                  <input name="endDate" type="date" required min={form.startDate} value={form.endDate} onChange={(event) => setForm((current) => ({ ...current, endDate: event.target.value }))} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100" />
                </label>
              </div>
              <label className="block text-sm font-bold text-slate-700">Toelichting <span className="font-normal text-slate-400">(optioneel)</span>
                <textarea name="note" maxLength={2000} rows={3} value={form.note} onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} placeholder="Wat moet je manager weten?" className="mt-1.5 w-full resize-none rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-900 outline-none placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-100" />
              </label>
              <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-xs leading-5 text-sky-800"><Sparkles size={15} className="mr-1.5 inline text-sky-600" />Na indienen berekent de server je exacte werkminuten, feestdagen, saldo en teamdekking. Je manager ziet dezelfde analyse.</div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setRequestOpen(false)} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50">Annuleren</button>
              <button type="submit" disabled={workforce.mutating || !form.leaveTypeId} className="rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-extrabold text-white hover:bg-sky-700 disabled:opacity-50">{workforce.mutating ? "Indienen…" : "Aanvraag indienen"}</button>
            </div>
          </form>
        </div>
      )}

      {decision && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/20 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="decision-title">
            <div className="flex gap-3">
              <div className={`rounded-xl p-2.5 ${decision.type === "approved" ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"}`}>{decision.type === "approved" ? <Check size={22} /> : <AlertTriangle size={22} />}</div>
              <div><h2 id="decision-title" className="text-lg font-black text-slate-950">{decision.type === "approved" ? "Aanvraag goedkeuren" : "Aanvraag afwijzen"}</h2><p className="mt-1 text-sm text-slate-500">{decision.request.employeeName} · {formatDate(decision.request.startDate)} – {formatDate(decision.request.endDate)}</p></div>
            </div>
            <div className={`mt-5 rounded-xl border p-4 text-sm ${riskStyle[decision.request.coverageRisk]}`}><strong>{riskLabel[decision.request.coverageRisk]}</strong><p className="mt-1 leading-5">{decision.request.coverageSnapshot?.summary}</p></div>
            <label className="mt-5 block text-sm font-bold text-slate-700">Motivatie {(decision.type === "rejected" || decision.request.coverageRisk === "red") && <span className="text-rose-600">verplicht</span>}
              <textarea autoFocus rows={3} maxLength={2000} value={decisionNote} onChange={(event) => setDecisionNote(event.target.value)} className="mt-1.5 w-full resize-none rounded-xl border border-slate-300 bg-white px-3 py-2.5 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100" />
            </label>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setDecision(null)} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50">Terug</button>
              <button type="button" disabled={workforce.mutating || ((decision.type === "rejected" || decision.request.coverageRisk === "red") && !decisionNote.trim())} onClick={() => void completeDecision()} className={`rounded-xl px-4 py-2.5 text-sm font-extrabold text-white disabled:opacity-50 ${decision.type === "approved" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-rose-600 hover:bg-rose-700"}`}>{workforce.mutating ? "Verwerken…" : decision.type === "approved" ? "Definitief goedkeuren" : "Definitief afwijzen"}</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
};
