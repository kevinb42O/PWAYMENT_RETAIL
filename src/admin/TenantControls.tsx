import { FormEvent, useCallback, useEffect, useState } from "react";
import { AlertTriangle, CreditCard, Database, RefreshCw, ShieldAlert, Trash2 } from "lucide-react";
import { Button } from "../components/ui/Button";
import { FeedbackBanner } from "../components/ui/FeedbackBanner";
import {
  deletePlatformStore,
  listPlatformIntegrationRuns,
  updatePlatformStoreSubscription,
  type PlatformIntegrationRun,
  type PlatformStoreDetail,
} from "./platformApi";

const dateTime = (value: string | null | undefined) => {
  if (!value) return "Nog actief";
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("nl-BE", { dateStyle: "short", timeStyle: "short" }).format(date)
    : "Onbekend moment";
};

const runTone = (status: PlatformIntegrationRun["status"]) =>
  status === "completed" ? "bg-emerald-100 text-emerald-700"
    : status === "completed_with_errors" ? "bg-amber-100 text-amber-800"
      : status === "failed" ? "bg-rose-100 text-rose-700"
        : status === "queued" ? "bg-amber-100 text-amber-800"
        : "bg-slate-100 text-slate-600";

export type TenantControlSection = "plan" | "integrations" | "danger";

export const TenantControls = ({ storeId, detail, onDeleted, section }: {
  storeId: string;
  detail: PlatformStoreDetail;
  onDeleted: () => void;
  section?: TenantControlSection;
}) => {
  const [runs, setRuns] = useState<PlatformIntegrationRun[]>([]);
  const [runsLoading, setRunsLoading] = useState(true);
  const [plan, setPlan] = useState<"basic" | "pro" | "enterprise">(
    (detail.subscription.plan_code as "basic" | "pro" | "enterprise" | undefined) ?? "basic",
  );
  const [status, setStatus] = useState<"trialing" | "active" | "past_due" | "canceled" | "expired">(
    (detail.subscription.status as "trialing" | "active" | "past_due" | "canceled" | "expired" | undefined) ?? "active",
  );
  const [reason, setReason] = useState("");
  const [savingPlan, setSavingPlan] = useState(false);
  const [deleteName, setDeleteName] = useState("");
  const [deleteReason, setDeleteReason] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadRuns = useCallback(async () => {
    setRunsLoading(true);
    try { setRuns((await listPlatformIntegrationRuns(storeId)).items ?? []); }
    catch (err) { setError(err instanceof Error ? err.message : "Integratieacties konden niet geladen worden."); }
    finally { setRunsLoading(false); }
  }, [storeId]);

  useEffect(() => { if (!section || section === "integrations") void loadRuns(); }, [loadRuns, section]);
  useEffect(() => {
    setPlan((detail.subscription.plan_code as "basic" | "pro" | "enterprise" | undefined) ?? "basic");
    setStatus((detail.subscription.status as "trialing" | "active" | "past_due" | "canceled" | "expired" | undefined) ?? "active");
  }, [detail.subscription.plan_code, detail.subscription.status]);

  const submitPlan = async (event: FormEvent) => {
    event.preventDefault(); setSavingPlan(true); setError(null); setMessage(null);
    try {
      await updatePlatformStoreSubscription(storeId, plan, status, reason);
      setMessage(`Plan gewijzigd naar ${plan}; de volgende entitlementcontrole gebruikt meteen de nieuwe serverstatus.`);
      setReason("");
    } catch (err) { setError(err instanceof Error ? err.message : "Plan kon niet worden bijgewerkt."); }
    finally { setSavingPlan(false); }
  };

  const submitDelete = async (event: FormEvent) => {
    event.preventDefault(); setDeleting(true); setError(null); setMessage(null);
    try {
      const result = await deletePlatformStore(storeId, deleteName, deleteReason);
      setMessage(`${result.deleted_store_name} is volledig verwijderd. ${result.deleted_orphan_users} losstaande gebruikersaccount(s) zijn eveneens verwijderd.`);
      onDeleted();
    } catch (err) { setError(err instanceof Error ? err.message : "Winkel kon niet worden verwijderd."); }
    finally { setDeleting(false); }
  };

  const showPlan = !section || section === "plan";
  const showIntegrations = !section || section === "integrations";
  const showDanger = !section || section === "danger";

  return <section className="space-y-5">
    {!section && <div><p className="text-[11px] font-bold uppercase tracking-[0.12em] text-cyan-700">Tenant control center</p><h2 className="mt-1 text-xl font-extrabold tracking-tight text-slate-950">Commercieel, integraties & levenscyclus</h2><p className="mt-1 text-sm text-slate-500">Gevoelige acties zijn server-side, MFA-beveiligd en worden permanent geaudit.</p></div>}
    {error && <FeedbackBanner tone="error">{error}</FeedbackBanner>}
    {message && <FeedbackBanner tone="success" onDismiss={() => setMessage(null)}>{message}</FeedbackBanner>}
    {showPlan && <form onSubmit={submitPlan} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-2"><CreditCard size={19} className="text-cyan-700" /><h3 className="text-sm font-extrabold text-slate-900">Plan & entitlement</h3></div><p className="mt-2 text-xs leading-5 text-slate-500">Wijzig de tenantbron, niet alleen het scherm. De wijziging schrijft een abonnementsevent én platformauditrecord.</p><div className="mt-4 grid grid-cols-2 gap-3"><label className="text-xs font-bold text-slate-700">Plan<select value={plan} onChange={(event) => setPlan(event.target.value as typeof plan)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"><option value="basic">Basis / Free</option><option value="pro">Retail Professional</option><option value="enterprise">Enterprise</option></select></label><label className="text-xs font-bold text-slate-700">Status<select value={status} onChange={(event) => setStatus(event.target.value as typeof status)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"><option value="active">Actief</option><option value="trialing">Trial</option><option value="past_due">Achterstallig</option><option value="canceled">Geannuleerd</option><option value="expired">Verlopen</option></select></label></div><label className="mt-3 block text-xs font-bold text-slate-700">Waarom is deze wijziging nodig?<textarea required minLength={8} value={reason} onChange={(event) => setReason(event.target.value)} rows={3} className="mt-1.5 w-full resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-sm" placeholder="Bijv. testaccount terug naar Free-plan" /></label><Button type="submit" variant="primary" className="mt-4" disabled={savingPlan}>{savingPlan ? "Opslaan…" : "Plan veilig wijzigen"}</Button></form>}
    {showIntegrations && <article className="rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex items-start justify-between gap-3 border-b border-slate-100 p-5"><div className="flex gap-2"><Database size={19} className="mt-0.5 text-cyan-700" /><div><h3 className="text-sm font-extrabold text-slate-900">Integration operations</h3><p className="mt-1 text-xs leading-5 text-slate-500">Acties per tenant, van lokale start tot serverbevestiging. Geen ruwe klantpayloads.</p></div></div><Button size="sm" variant="quiet" onClick={() => void loadRuns()} disabled={runsLoading}><RefreshCw size={14} /> Vernieuwen</Button></div>{runsLoading ? <p className="px-5 py-10 text-center text-sm font-semibold text-slate-500">Acties laden…</p> : runs.length ? <ul>{runs.map((run) => <li key={run.id} className="border-b border-slate-100 px-5 py-4 last:border-0"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-extrabold text-slate-800">{run.operation} · {run.source_name}</p><p className="mt-1 text-[11px] text-slate-500">{run.actor_name ?? run.actor_email ?? "Systeem"} · {dateTime(run.started_at)}</p></div><span className={`rounded-lg px-2 py-1 text-[9px] font-extrabold uppercase ${runTone(run.status)}`}>{run.status.replaceAll("_", " ")}</span></div><p className="mt-2 text-[11px] text-slate-600">{run.row_count} rijen · {run.created_count} nieuw · {run.updated_count} bijgewerkt · {run.skipped_count} over · {run.error_count} fouten{run.error_code ? ` · ${run.error_code}` : ""}</p>{run.events?.length > 0 && <ol className="mt-3 space-y-1 border-l-2 border-slate-100 pl-3">{run.events.map((event, index) => <li key={`${event.occurred_at}-${index}`} className="text-[11px] leading-5 text-slate-500"><span className="font-bold text-slate-700">{event.event_type}</span> · {dateTime(event.occurred_at)}{event.message ? ` · ${event.message}` : ""}</li>)}</ol>}</li>)}</ul> : <p className="px-5 py-10 text-center text-xs leading-5 text-slate-500">Nog geen server-side integratieacties. Nieuwe imports tonen hier hun volledige afleverstatus.</p>}</article>}
    {showDanger && <form onSubmit={submitDelete} className="rounded-2xl border border-rose-200 bg-rose-50 p-5"><div className="flex gap-3"><ShieldAlert className="mt-0.5 text-rose-700" size={21} /><div><h3 className="text-sm font-extrabold text-rose-950">Tenant volledig verwijderen</h3><p className="mt-1 max-w-3xl text-xs leading-5 text-rose-900">Dit verwijdert de winkel, alle tenantdata, koppelingen, wachtrijen en lidmaatschappen direct. Een gebruikersaccount wordt alleen verwijderd wanneer die persoon geen andere winkel of platformrol heeft. Dit is niet herstelbaar.</p></div></div><div className="mt-4 grid gap-3 md:grid-cols-2"><label className="text-xs font-bold text-rose-950">Typ exact: {detail.store.name}<input required value={deleteName} onChange={(event) => setDeleteName(event.target.value)} className="mt-1.5 w-full rounded-xl border border-rose-200 bg-white px-3 py-2.5 text-sm" /></label><label className="text-xs font-bold text-rose-950">Reden voor volledige verwijdering<textarea required minLength={8} value={deleteReason} onChange={(event) => setDeleteReason(event.target.value)} rows={2} className="mt-1.5 w-full resize-none rounded-xl border border-rose-200 bg-white px-3 py-2.5 text-sm" /></label></div><Button type="submit" variant="danger" className="mt-4" disabled={deleting || deleteName !== detail.store.name}>{deleting ? "Definitief verwijderen…" : <><Trash2 size={15} /> Verwijder tenant definitief</>}</Button></form>}
  </section>;
};
