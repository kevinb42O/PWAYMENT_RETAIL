import { useEffect, useMemo, useState } from "react";
import {
  Archive,
  Building2,
  CalendarRange,
  Download,
  Edit3,
  Landmark,
  Plus,
  ReceiptText,
  Save,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import { useAuth } from "../auth/useAuth";
import { useFinancialWorkspace } from "../store/useFinancialWorkspace";
import type { FinancialCost } from "../types";
import {
  FINANCIAL_COST_CATEGORIES,
  allocateFinancialCostCents,
  financialCategoryLabel,
  financialCostVatCents,
  financialManagementCostCents,
} from "../utils/financialManagement";
import {
  centsToDecimalString,
  formatEUR,
  parseDecimalToCents,
} from "../utils/money";
import { Modal } from "./Modal";
import { FeedbackBanner } from "./ui/FeedbackBanner";
import { SelectField, TextField } from "./ui/Field";

type CostDraft = {
  id?: string;
  kind: "recurring" | "one-off";
  name: string;
  category: string;
  customCategory: string;
  supplier: string;
  documentNumber: string;
  amount: string;
  amountMode: "excluding-vat" | "including-vat";
  vatRate: "0" | "6" | "12" | "21";
  vatRecoverablePercent: string;
  behavior: "fixed" | "variable";
  frequency: "once" | "monthly" | "quarterly" | "yearly";
  startDate: string;
  endDate: string;
  createdAt?: string;
};

const today = () => new Date().toISOString().slice(0, 10);
const currentMonthStart = () => `${today().slice(0, 8)}01`;

const emptyDraft = (): CostDraft => ({
  kind: "recurring",
  name: "",
  category: "premises",
  customCategory: "",
  supplier: "",
  documentNumber: "",
  amount: "",
  amountMode: "excluding-vat",
  vatRate: "21",
  vatRecoverablePercent: "100",
  behavior: "fixed",
  frequency: "monthly",
  startDate: currentMonthStart(),
  endDate: "",
});

const draftFromCost = (cost: FinancialCost): CostDraft => ({
  id: cost.id,
  kind: cost.kind,
  name: cost.name,
  category: cost.category,
  customCategory: cost.customCategory ?? "",
  supplier: cost.supplier ?? "",
  documentNumber: cost.documentNumber ?? "",
  amount: centsToDecimalString(cost.amountCents).replace(".", ","),
  amountMode: cost.amountMode,
  vatRate: String(cost.vatRate) as CostDraft["vatRate"],
  vatRecoverablePercent: String(cost.vatRecoverablePercent),
  behavior: cost.behavior,
  frequency: cost.frequency,
  startDate: cost.startDate,
  endDate: cost.endDate ?? "",
  createdAt: cost.createdAt,
});

const frequencyLabel = (cost: FinancialCost) =>
  cost.frequency === "once"
    ? "Eenmalig"
    : cost.frequency === "monthly"
      ? "Maandelijks"
      : cost.frequency === "quarterly"
        ? "Per kwartaal"
        : "Jaarlijks";

const csvCell = (value: string | number) => {
  const raw = String(value);
  const spreadsheetSafe =
    typeof value === "string" && /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${spreadsheetSafe.replaceAll('"', '""')}"`;
};

export const FinancialSettings = () => {
  const currentRole = useAuth((state) => state.currentRole);
  const storeId = useAuth((state) => state.currentStoreId);
  const costs = useFinancialWorkspace((state) => state.costs);
  const settings = useFinancialWorkspace((state) => state.settings);
  const loading = useFinancialWorkspace((state) => state.loading);
  const error = useFinancialWorkspace((state) => state.error);
  const hydrate = useFinancialWorkspace((state) => state.hydrate);
  const saveCost = useFinancialWorkspace((state) => state.saveCost);
  const archiveCost = useFinancialWorkspace((state) => state.archiveCost);
  const saveSettings = useFinancialWorkspace((state) => state.saveSettings);
  const clearError = useFinancialWorkspace((state) => state.clearError);
  const [draft, setDraft] = useState<CostDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [message, setMessage] = useState<{
    text: string;
    tone: "success" | "error";
  } | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [bufferText, setBufferText] = useState("0,00");

  useEffect(() => {
    if (storeId && currentRole === "owner") void hydrate(storeId);
  }, [currentRole, hydrate, storeId]);
  useEffect(() => {
    setBufferText(centsToDecimalString(settings.safetyBufferCents).replace(".", ","));
  }, [settings.safetyBufferCents]);

  const activeCosts = costs.filter((cost) => cost.status === "active");
  const visibleCosts = costs.filter((cost) =>
    showArchived ? cost.status === "archived" : cost.status === "active",
  );
  const currentMonth = useMemo(() => {
    const date = new Date();
    const start = new Date(date.getFullYear(), date.getMonth(), 1).getTime();
    const end = new Date(date.getFullYear(), date.getMonth() + 1, 1).getTime();
    return {
      total: activeCosts.reduce(
        (sum, cost) => sum + allocateFinancialCostCents(cost, start, end),
        0,
      ),
      fixed: activeCosts
        .filter((cost) => cost.behavior === "fixed")
        .reduce((sum, cost) => sum + allocateFinancialCostCents(cost, start, end), 0),
      personnel: activeCosts
        .filter((cost) => cost.category === "personnel")
        .reduce((sum, cost) => sum + allocateFinancialCostCents(cost, start, end), 0),
    };
  }, [activeCosts]);

  if (currentRole !== "owner") {
    return (
      <FeedbackBanner tone="error">
        Financiële kosten en buffers zijn uitsluitend zichtbaar voor de eigenaar.
      </FeedbackBanner>
    );
  }

  const setField = <K extends keyof CostDraft>(key: K, value: CostDraft[K]) =>
    setDraft((current) => (current ? { ...current, [key]: value } : current));

  const submit = async () => {
    if (!draft) return;
    const amount = parseDecimalToCents(draft.amount);
    const recoverable = Number(draft.vatRecoverablePercent);
    if (!draft.name.trim()) return setFormError("Geef deze kost een herkenbare naam.");
    if (!amount.ok) return setFormError("Vul een geldig bedrag in, bijvoorbeeld 1.250,00.");
    if (!Number.isInteger(recoverable) || recoverable < 0 || recoverable > 100) {
      return setFormError("Het recupereerbare btw-aandeel moet tussen 0 en 100% liggen.");
    }
    if (draft.endDate && draft.endDate < draft.startDate) {
      return setFormError("De einddatum kan niet vóór de startdatum liggen.");
    }
    const now = new Date().toISOString();
    const cost: FinancialCost = {
      id: draft.id ?? crypto.randomUUID(),
      kind: draft.kind,
      name: draft.name.trim(),
      category: draft.category,
      customCategory: draft.customCategory.trim() || undefined,
      supplier: draft.supplier.trim() || undefined,
      documentNumber: draft.documentNumber.trim() || undefined,
      amountCents: amount.cents,
      amountMode: draft.amountMode,
      vatRate: Number(draft.vatRate) as FinancialCost["vatRate"],
      vatRecoverablePercent: recoverable,
      behavior: draft.behavior,
      frequency: draft.kind === "one-off" ? "once" : draft.frequency,
      startDate: draft.startDate,
      endDate: draft.kind === "recurring" && draft.endDate ? draft.endDate : undefined,
      status: "active",
      createdAt: draft.createdAt ?? now,
      updatedAt: now,
      source: "live",
    };
    setSaving(true);
    setFormError(null);
    try {
      await saveCost(cost);
      setDraft(null);
      setMessage({
        text: `${cost.name} is veilig bewaard en wordt gesynchroniseerd.`,
        tone: "success",
      });
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "De kost kon niet worden bewaard.");
    } finally {
      setSaving(false);
    }
  };

  const saveBuffer = async () => {
    const parsed = parseDecimalToCents(bufferText);
    if (!parsed.ok) {
      return setMessage({
        text: "Vul een geldige veiligheidsbuffer in.",
        tone: "error",
      });
    }
    try {
      await saveSettings({
        id: "store",
        safetyBufferCents: parsed.cents,
        updatedAt: new Date().toISOString(),
      });
      setMessage({
        text: "De absolute veiligheidsbuffer is bewaard voor de liquiditeitsfase.",
        tone: "success",
      });
    } catch (cause) {
      setMessage({
        text: cause instanceof Error ? cause.message : "De buffer kon niet worden bewaard.",
        tone: "error",
      });
    }
  };

  const confirmArchive = async (cost: FinancialCost) => {
    if (!window.confirm(`${cost.name} archiveren? De historiek blijft bewaard.`)) return;
    try {
      await archiveCost(cost.id);
      setMessage({
        text: `${cost.name} is gearchiveerd. Historische resultaten blijven behouden.`,
        tone: "success",
      });
    } catch (cause) {
      setMessage({
        text: cause instanceof Error ? cause.message : "De kost kon niet worden gearchiveerd.",
        tone: "error",
      });
    }
  };

  const exportCsv = () => {
    const headers = [
      "Naam", "Categorie", "Leverancier", "Documentnummer", "Type", "Frequentie",
      "Invoerbedrag", "Invoerbasis", "Btw-percentage", "Recupereerbare btw (%)",
      "Bedrag excl. btw", "Btw-bedrag", "Recupereerbare btw", "Niet-recupereerbare btw",
      "Managementkost", "Vast/variabel", "Startdatum", "Einddatum", "Status",
    ];
    const rows = costs.map((cost) => {
      const vat = financialCostVatCents(cost);
      const recoverableVat = Math.round((vat * cost.vatRecoverablePercent) / 100);
      const amountExVat = financialManagementCostCents(cost) - (vat - recoverableVat);
      return [
        cost.name,
        financialCategoryLabel(cost),
        cost.supplier ?? "",
        cost.documentNumber ?? "",
        cost.kind === "recurring" ? "Terugkerend" : "Eenmalig",
        frequencyLabel(cost),
        centsToDecimalString(cost.amountCents),
        cost.amountMode === "including-vat" ? "Inclusief btw" : "Exclusief btw",
        cost.vatRate,
        cost.vatRecoverablePercent,
        centsToDecimalString(amountExVat),
        centsToDecimalString(vat),
        centsToDecimalString(recoverableVat),
        centsToDecimalString(vat - recoverableVat),
        centsToDecimalString(financialManagementCostCents(cost)),
        cost.behavior === "fixed" ? "Vast" : "Variabel",
        cost.startDate,
        cost.endDate ?? "",
        cost.status === "active" ? "Actief" : "Gearchiveerd",
      ];
    });
    const csv = [headers, ...rows].map((row) => row.map(csvCell).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `pwayment-kosten-${today()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const previewCost: FinancialCost | null = draft && parseDecimalToCents(draft.amount).ok
    ? {
        id: draft.id ?? "preview",
        kind: draft.kind,
        name: draft.name || "Nieuwe kost",
        category: draft.category,
        amountCents: parseDecimalToCents(draft.amount).cents,
        amountMode: draft.amountMode,
        vatRate: Number(draft.vatRate) as FinancialCost["vatRate"],
        vatRecoverablePercent: Number(draft.vatRecoverablePercent) || 0,
        behavior: draft.behavior,
        frequency: draft.kind === "one-off" ? "once" : draft.frequency,
        startDate: draft.startDate,
        status: "active",
        createdAt: draft.createdAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
    : null;

  return (
    <div className="insights-light -m-4 space-y-5 p-4 md:-m-8 md:p-8">
      {(error || message) && (
        <FeedbackBanner
          tone={error ? "error" : message?.tone ?? "success"}
          onDismiss={() => { clearError(); setMessage(null); }}
        >
          {error ?? message?.text}
        </FeedbackBanner>
      )}

      <section className="overflow-hidden rounded-2xl border border-cyan-200 bg-gradient-to-br from-white via-white to-cyan-50 shadow-sm">
        <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,.8fr)] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-extrabold text-cyan-800">
              <ShieldCheck size={14} /> Alleen zichtbaar voor de eigenaar
            </div>
            <h2 className="mt-4 text-2xl font-black tracking-tight text-slate-950">
              Breng de volledige kost van uw zaak in beeld
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Registreer terugkerende en eenmalige bedrijfskosten. Pwayment verwerkt btw,
              spreidt periodes correct en gebruikt dit uitsluitend als managementinformatie.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <button type="button" onClick={() => setDraft(emptyDraft())} className="insights-primary-action inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-extrabold">
                <Plus size={17} /> Kost toevoegen
              </button>
              <button type="button" onClick={exportCsv} disabled={costs.length === 0} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                <Download size={16} /> Export voor boekhouder
              </button>
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-slate-500">Deze maand ingepland</div>
            <div className="mt-2 text-3xl font-black tracking-tight text-slate-950">{formatEUR(currentMonth.total)}</div>
            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 text-xs">
              <div><span className="block text-slate-500">Vaste kosten</span><strong className="mt-1 block text-slate-900">{formatEUR(currentMonth.fixed)}</strong></div>
              <div><span className="block text-slate-500">Personeel</span><strong className="mt-1 block text-slate-900">{formatEUR(currentMonth.personnel)}</strong></div>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { label: "Actieve kosten", value: String(activeCosts.length), Icon: ReceiptText },
          { label: "Terugkerend", value: String(activeCosts.filter((cost) => cost.kind === "recurring").length), Icon: CalendarRange },
          { label: "Veiligheidsbuffer", value: formatEUR(settings.safetyBufferCents), Icon: Landmark },
        ].map(({ label, value, Icon }) => (
          <div key={label} className="insights-panel p-4">
            <div className="flex items-center justify-between"><span className="text-xs font-semibold text-slate-500">{label}</span><Icon size={17} className="text-cyan-700" /></div>
            <div className="mt-2 text-2xl font-bold text-slate-950">{value}</div>
          </div>
        ))}
      </div>

      <section className="insights-panel overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div><h3 className="font-bold text-slate-950">Kostenregister</h3><p className="mt-1 text-xs text-slate-500">Bedragen blijven historisch bewaard; archiveren verwijdert niets.</p></div>
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1">
            <button type="button" onClick={() => setShowArchived(false)} className={`insights-control rounded-md px-3 py-1.5 text-xs font-bold ${!showArchived ? "insights-control--active" : ""}`}>Actief {activeCosts.length}</button>
            <button type="button" onClick={() => setShowArchived(true)} className={`insights-control rounded-md px-3 py-1.5 text-xs font-bold ${showArchived ? "insights-control--active" : ""}`}>Archief {costs.length - activeCosts.length}</button>
          </div>
        </div>
        {loading && costs.length === 0 ? (
          <div className="p-8 text-center text-sm font-semibold text-slate-500">Financiële gegevens laden…</div>
        ) : visibleCosts.length === 0 ? (
          <div className="grid min-h-56 place-items-center p-8 text-center">
            <div><WalletCards size={28} className="mx-auto text-cyan-700" /><h3 className="mt-3 font-bold text-slate-900">{showArchived ? "Nog niets gearchiveerd" : "Begin met uw grootste vaste kosten"}</h3><p className="mt-1 max-w-md text-sm leading-6 text-slate-500">{showArchived ? "Gearchiveerde kosten verschijnen hier." : "Huur, maandelijkse personeelskost en energie geven meteen een bruikbaar eerste resultaat."}</p></div>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {visibleCosts.map((cost) => (
              <article key={cost.id} className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><h4 className="font-bold text-slate-900">{cost.name}</h4><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-slate-600">{cost.behavior === "fixed" ? "Vast" : "Variabel"}</span></div>
                  <div className="mt-1 text-xs text-slate-500">{financialCategoryLabel(cost)} · {frequencyLabel(cost)} · vanaf {new Intl.DateTimeFormat("nl-BE").format(new Date(`${cost.startDate}T12:00:00`))}{cost.supplier ? ` · ${cost.supplier}` : ""}</div>
                </div>
                <div className="flex items-center justify-between gap-4 sm:justify-end">
                  <div className="text-right"><div className="font-bold tabular-nums text-slate-950">{formatEUR(financialManagementCostCents(cost))}</div><div className="text-[11px] text-slate-500">managementkost · btw {cost.vatRecoverablePercent}% recup.</div></div>
                  {cost.status === "active" && <div className="flex gap-1"><button type="button" onClick={() => setDraft(draftFromCost(cost))} className="rounded-lg p-2 text-slate-500 hover:bg-cyan-50 hover:text-cyan-800" aria-label={`${cost.name} bewerken`}><Edit3 size={16} /></button><button type="button" onClick={() => void confirmArchive(cost)} className="rounded-lg p-2 text-slate-500 hover:bg-amber-50 hover:text-amber-800" aria-label={`${cost.name} archiveren`}><Archive size={16} /></button></div>}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="insights-panel p-5">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-end">
          <div><div className="flex items-center gap-2"><Building2 size={18} className="text-cyan-700" /><h3 className="font-bold text-slate-950">Absolute veiligheidsbuffer</h3></div><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Wordt later gebruikt voor cash-runwaywaarschuwingen. De buffer is nu al veilig bewaard, maar beïnvloedt het operationele resultaat niet.</p></div>
          <div className="flex gap-2"><label className="min-w-0 flex-1 text-xs font-bold text-slate-700">Buffer in euro<TextField value={bufferText} onChange={(event) => setBufferText(event.target.value)} inputMode="decimal" /></label><button type="button" onClick={() => void saveBuffer()} className="mt-[22px] inline-flex h-[42px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50"><Save size={15} /> Bewaar</button></div>
        </div>
      </section>

      <Modal
        open={draft != null}
        onClose={() => { if (!saving) { setDraft(null); setFormError(null); } }}
        title={draft?.id ? "Kost bewerken" : "Kost toevoegen"}
        subtitle="Managementinformatie · geen officiële boeking"
        icon={<ReceiptText size={20} />}
        size="4xl"
        bodyClassName="p-5 sm:p-6 space-y-5"
        footer={<div className="flex justify-end gap-2"><button type="button" onClick={() => setDraft(null)} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700">Annuleren</button><button type="button" onClick={() => void submit()} disabled={saving} className="insights-primary-action inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-extrabold disabled:opacity-50"><Save size={16} /> {saving ? "Bewaren…" : "Veilig bewaren"}</button></div>}
      >
        {draft && <>
          {formError && <FeedbackBanner tone="error">{formError}</FeedbackBanner>}
          <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-1.5">
            {(["recurring", "one-off"] as const).map((kind) => <button key={kind} type="button" onClick={() => { setField("kind", kind); setField("frequency", kind === "one-off" ? "once" : "monthly"); if (!draft.id) setField("startDate", kind === "one-off" ? today() : currentMonthStart()); }} className={`rounded-lg px-3 py-2.5 text-sm font-bold ${draft.kind === kind ? "bg-white text-cyan-800 shadow-sm ring-1 ring-cyan-200" : "text-slate-500"}`}>{kind === "recurring" ? "Terugkerende kost" : "Eenmalige kost"}</button>)}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-xs font-bold text-slate-700">Naam *<TextField value={draft.name} onChange={(event) => setField("name", event.target.value)} placeholder="Bijv. huur winkelpand" maxLength={160} /></label>
            <label className="text-xs font-bold text-slate-700">Categorie<SelectField value={draft.category} onChange={(event) => setField("category", event.target.value)}>{FINANCIAL_COST_CATEGORIES.map((category) => <option key={category.key} value={category.key}>{category.label}</option>)}</SelectField></label>
            {draft.category === "other" && <label className="text-xs font-bold text-slate-700 sm:col-span-2">Eigen categorie<TextField value={draft.customCategory} onChange={(event) => setField("customCategory", event.target.value)} maxLength={80} /></label>}
            <label className="text-xs font-bold text-slate-700">Leverancier<TextField value={draft.supplier} onChange={(event) => setField("supplier", event.target.value)} placeholder="Optioneel" maxLength={160} /></label>
            <label className="text-xs font-bold text-slate-700">Documentnummer<TextField value={draft.documentNumber} onChange={(event) => setField("documentNumber", event.target.value)} placeholder="Factuur- of contractnummer" maxLength={100} /></label>
          </div>
          <div className="rounded-2xl border border-cyan-100 bg-cyan-50/60 p-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <label className="text-xs font-bold text-slate-700">Bedrag *<TextField value={draft.amount} onChange={(event) => setField("amount", event.target.value)} inputMode="decimal" placeholder="0,00" /></label>
              <label className="text-xs font-bold text-slate-700">Bedrag is<SelectField value={draft.amountMode} onChange={(event) => setField("amountMode", event.target.value as CostDraft["amountMode"])}><option value="excluding-vat">Exclusief btw</option><option value="including-vat">Inclusief btw</option></SelectField></label>
              <label className="text-xs font-bold text-slate-700">Btw-tarief<SelectField value={draft.vatRate} onChange={(event) => setField("vatRate", event.target.value as CostDraft["vatRate"])}>{[0, 6, 12, 21].map((rate) => <option key={rate} value={rate}>{rate}%</option>)}</SelectField></label>
              <label className="text-xs font-bold text-slate-700">Btw recupereerbaar<TextField value={draft.vatRecoverablePercent} onChange={(event) => setField("vatRecoverablePercent", event.target.value)} inputMode="numeric" /></label>
            </div>
            {previewCost && <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t border-cyan-100 pt-4 text-xs"><span className="text-slate-600">Btw in deze kost: <strong className="text-slate-900">{formatEUR(financialCostVatCents(previewCost))}</strong></span><span className="text-slate-600">Kost voor resultaat: <strong className="text-cyan-900">{formatEUR(financialManagementCostCents(previewCost))}</strong></span></div>}
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-xs font-bold text-slate-700">Gedrag<SelectField value={draft.behavior} onChange={(event) => setField("behavior", event.target.value as CostDraft["behavior"])}><option value="fixed">Vaste kost</option><option value="variable">Variabele kost</option></SelectField></label>
            {draft.kind === "recurring" && <label className="text-xs font-bold text-slate-700">Herhaling<SelectField value={draft.frequency} onChange={(event) => setField("frequency", event.target.value as CostDraft["frequency"])}><option value="monthly">Maandelijks</option><option value="quarterly">Per kwartaal</option><option value="yearly">Jaarlijks</option></SelectField></label>}
            <label className="text-xs font-bold text-slate-700">{draft.kind === "one-off" ? "Kostdatum" : "Startdatum"}<TextField type="date" value={draft.startDate} onChange={(event) => setField("startDate", event.target.value)} /></label>
            {draft.kind === "recurring" && <label className="text-xs font-bold text-slate-700">Einddatum<TextField type="date" value={draft.endDate} onChange={(event) => setField("endDate", event.target.value)} /></label>}
          </div>
          {draft.category === "personnel" && <FeedbackBanner tone="info">Registreer in deze eerste versie het totale maandbedrag voor personeel. Pwayment bewaart bewust geen individuele lonen.</FeedbackBanner>}
          {draft.category === "inventory" && <FeedbackBanner tone="info">Voer hier alleen voorraadgerelateerde kosten in die niet al in de productkostprijs zitten, zoals opslag of inkomend transport. Zo vermijdt u dubbeltelling van aangekochte handelsgoederen.</FeedbackBanner>}
          {draft.category === "investments" && <FeedbackBanner tone="info">Voor winstgevendheid registreert u hier de afschrijving per maand, niet de volledige aankoopprijs van een investering. De werkelijke betaling hoort later in de cash-runwayplanning.</FeedbackBanner>}
          {draft.category === "financing" && <FeedbackBanner tone="info">Registreer rente en financieringskosten. Kapitaalaflossingen zijn geen winstkost en worden later afzonderlijk meegenomen in cash runway.</FeedbackBanner>}
          {draft.id && draft.startDate < today() && <FeedbackBanner tone="info">Een wijziging aan deze bestaande kost herberekent ook de historische periodes vanaf de startdatum. Archiveer de oude kost en maak een nieuwe aan wanneer het om een tariefwijziging vanaf nu gaat.</FeedbackBanner>}
        </>}
      </Modal>
    </div>
  );
};
