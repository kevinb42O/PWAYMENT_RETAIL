import { useEffect, useState, type ReactNode } from "react";
import {
  BellRing, Bot, BrainCircuit, Check, Cloud, Coins, Database, Eye, Gauge,
  HeartHandshake, Palette, ReceiptText, RotateCcw, ShieldCheck, Sparkles, Store, UserRound,
} from "lucide-react";
import { useAuth } from "../auth/useAuth";
import { PaceMark, type PacePerformance } from "../pace/PaceMark";
import { usePace, type PaceMotion, type PaceProactivity, type PaceTone } from "../pace/usePace";
import { usePaceBilling } from "../pace/usePaceBilling";
import { useMerchantProfile } from "../store/useMerchantProfile";
import { supabase } from "../lib/supabase";

type PaceSettingsTab = "overview" | "personal" | "guidance" | "team";

const Switch = ({ label, detail, checked, onChange, icon, disabled = false, badge }: {
  label: string; detail: string; checked: boolean; onChange: (checked: boolean) => void;
  icon: ReactNode; disabled?: boolean; badge?: string;
}) => (
  <label className={`flex items-start gap-4 rounded-2xl border p-4 transition ${disabled ? "cursor-not-allowed border-slate-200 bg-slate-50 opacity-70" : "cursor-pointer border-slate-200 bg-white hover:border-sky-300 hover:shadow-sm"}`}>
    <span className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${checked ? "bg-sky-50 text-sky-700" : "bg-slate-100 text-slate-500"}`}>{icon}</span>
    <span className="min-w-0 flex-1">
      <span className="flex flex-wrap items-center gap-2"><strong className="text-sm font-extrabold text-slate-950">{label}</strong>{badge && <small className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-slate-500">{badge}</small>}</span>
      <span className="mt-1 block max-w-2xl text-xs font-medium leading-5 text-slate-500">{detail}</span>
    </span>
    <span className="relative mt-1 shrink-0">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} className="peer sr-only" />
      <span className="block h-6 w-11 rounded-full bg-slate-300 transition-colors peer-checked:bg-sky-600 peer-focus-visible:ring-2 peer-focus-visible:ring-sky-500 peer-focus-visible:ring-offset-2 peer-disabled:bg-slate-200" />
      <span className="absolute left-1 top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-5" />
    </span>
  </label>
);

const Choice = <T extends string>({ label, value, options, onChange }: { label: string; value: T; options: Array<{ value: T; label: string; detail: string }>; onChange: (value: T) => void }) => (
  <fieldset>
    <legend className="mb-3 text-xs font-black uppercase tracking-[0.12em] text-slate-500">{label}</legend>
    <div className="grid gap-2 sm:grid-cols-3">
      {options.map((option) => <button key={option.value} type="button" onClick={() => onChange(option.value)} className={`rounded-2xl border p-3 text-left transition ${value === option.value ? "border-sky-400 bg-sky-50 ring-2 ring-sky-100" : "border-slate-200 bg-white hover:border-slate-300"}`} aria-pressed={value === option.value}>
        <strong className="block text-xs font-extrabold text-slate-900">{option.label}</strong><span className="mt-1 block text-[11px] leading-4 text-slate-500">{option.detail}</span>
      </button>)}
    </div>
  </fieldset>
);

const Section = ({ icon, eyebrow, title, description, children }: { icon: ReactNode; eyebrow: string; title: string; description: string; children: ReactNode }) => (
  <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
    <div className="flex items-start gap-3 border-b border-slate-100 pb-5">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-sky-700">{icon}</span>
      <div><span className="text-[10px] font-black uppercase tracking-[0.15em] text-sky-700">{eyebrow}</span><h3 className="mt-1 text-lg font-black tracking-tight text-slate-950">{title}</h3><p className="mt-1 max-w-3xl text-xs font-medium leading-5 text-slate-500">{description}</p></div>
    </div>
    <div className="mt-5 space-y-4">{children}</div>
  </section>
);

const PACE_SETTINGS_TABS: Array<{ id: PaceSettingsTab; label: string; detail: string; icon: ReactNode }> = [
  { id: "overview", label: "Overzicht", detail: "Bundel en status", icon: <Gauge size={16} /> },
  { id: "personal", label: "Mijn Pace", detail: "AI, stijl en beleving", icon: <UserRound size={16} /> },
  { id: "guidance", label: "Begeleiding", detail: "Signalen en meldingen", icon: <BellRing size={16} /> },
  { id: "team", label: "Winkel & team", detail: "Klanthulp en rechten", icon: <Store size={16} /> },
];

export const PaceSettings = () => {
  const currentStoreId = useAuth((state) => state.currentStoreId);
  const currentUserId = useAuth((state) => state.currentUserId);
  const currentRole = useAuth((state) => state.currentRole);
  const currentUserName = useAuth((state) => state.currentUserName);
  const profile = useMerchantProfile((state) => state.profile);
  const updateProfile = useMerchantProfile((state) => state.updateProfile);
  const { preferences, syncState, hydrateScope, updatePreferences, resetDismissedSignals } = usePace();
  const customerSettings = profile.customerInsightSettings!;
  const returnPolicy = profile.commercialReturnPolicy!;
  const owner = currentRole === "owner";
  const [preview, setPreview] = useState<PacePerformance | null>(null);
  const { overview, quota, loading: billingLoading, error: billingError, load: loadBilling, saveRolePolicy, setRollover } = usePaceBilling();
  const [buyingCredits, setBuyingCredits] = useState(false);
  const [activeTab, setActiveTab] = useState<PaceSettingsTab>("overview");

  useEffect(() => { void hydrateScope(currentStoreId, currentUserId); }, [currentStoreId, currentUserId, hydrateScope]);
  useEffect(() => { void loadBilling(currentStoreId); }, [currentStoreId, loadBilling]);
  useEffect(() => {
    const purchaseId = new URLSearchParams(window.location.search).get("pacePurchaseId");
    if (!purchaseId || !currentStoreId) return;
    void (async () => {
      const { data } = await supabase.auth.getSession();
      const response = await fetch(`/api/pace/credit-packs?purchaseId=${encodeURIComponent(purchaseId)}`, { headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` } });
      const result = await response.json().catch(() => ({})) as { status?: string; error?: string };
      if (response.ok && result.status === "paid") {
        await loadBilling(currentStoreId);
        const url = new URL(window.location.href); url.searchParams.delete("pacePurchaseId"); window.history.replaceState({}, "", url);
      } else if (!response.ok) usePaceBilling.setState({ error: result.error ?? "De creditbetaling kon niet worden bevestigd." });
    })();
  }, [currentStoreId, loadBilling]);
  useEffect(() => {
    if (!preview) return;
    const timer = window.setTimeout(() => setPreview(null), 3_100);
    return () => window.clearTimeout(timer);
  }, [preview]);

  const updateCustomerSettings = (patch: Partial<typeof customerSettings>) => updateProfile({ customerInsightSettings: { ...customerSettings, ...patch } });
  const playPreview = (performance: PacePerformance) => setPreview(performance);
  const syncLabel = syncState === "loading" ? "Voorkeuren laden" : syncState === "saved" ? "Bewaard voor jou" : syncState === "error" ? "Lokaal bewaard" : syncState === "local" ? "Beschikbaar op dit toestel" : "Wijzigingen worden automatisch bewaard";
  const quotaLimit = quota?.quota ?? (overview?.tier === "pro" ? 250 : overview?.tier === "enterprise" ? 2_500 : 5);
  const quotaUsed = quota ? (quota.tier === "basic" ? quota.daily_count : quota.monthly_count) : 0;
  const quotaRemaining = Math.max(0, quotaLimit - quotaUsed);
  const quotaPercent = quotaLimit > 0 ? Math.min(100, Math.round((quotaUsed / quotaLimit) * 100)) : 0;
  const quotaTone = quotaPercent >= 100 ? "bg-rose-500" : quotaPercent >= 80 ? "bg-amber-500" : "bg-sky-600";
  const quotaPeriod = overview?.tier === "basic" ? "vandaag" : "deze maand";
  const resetLabel = quota?.reset_at
    ? new Intl.DateTimeFormat("nl-BE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(quota.reset_at))
    : overview?.tier === "basic" ? "vannacht om 00:00 UTC" : "bij de volgende facturatieperiode";
  const buyCredits = async () => {
    if (!currentStoreId || buyingCredits) return;
    setBuyingCredits(true);
    try {
      const { data } = await supabase.auth.getSession();
      const response = await fetch("/api/pace/credit-packs", { method: "POST", headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}`, "Content-Type": "application/json" }, body: JSON.stringify({ storeId: currentStoreId, packCode: "pace-50", idempotencyKey: crypto.randomUUID() }) });
      const result = await response.json() as { checkoutUrl?: string; message?: string };
      if (!response.ok || !result.checkoutUrl) throw new Error(result.message ?? "Aankoop kon niet worden gestart.");
      window.location.assign(result.checkoutUrl);
    } catch (error) {
      usePaceBilling.setState({ error: error instanceof Error ? error.message : "Aankoop kon niet worden gestart." });
      setBuyingCredits(false);
    }
  };

  return <div className="mx-auto max-w-6xl space-y-5 pb-10">
    <section className="overflow-hidden rounded-3xl border border-sky-200 bg-gradient-to-br from-white via-sky-50/60 to-cyan-50/40 p-5 shadow-sm md:p-7">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-3xl border border-sky-100 bg-white shadow-sm"><PaceMark size={62} active emotion="attentive" motionMode={preferences.motion} expressive={preferences.expressiveMorphs} /></div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-sky-700"><Sparkles size={13} /> Pace · jouw werkassistent</div>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">{currentUserName ? `${currentUserName}, bepaal hoe Pace met je meewerkt.` : "Bepaal hoe Pace met je meewerkt."}</h2>
          <p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-slate-600">Stel vrije vragen, krijg hulp in de huidige werkruimte en kies zelf wanneer AI of actuele winkelgegevens gebruikt mogen worden.</p>
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:items-end">
          <span className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-extrabold ${preferences.enabled ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" : "bg-slate-100 text-slate-500 ring-1 ring-slate-200"}`}><span className={`h-2 w-2 rounded-full ${preferences.enabled ? "bg-emerald-500" : "bg-slate-400"}`} />{preferences.enabled ? "Pace zichtbaar" : "Pace verborgen"}</span>
          <small className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500"><Cloud size={12} /> {syncLabel}</small>
        </div>
      </div>
    </section>

    <nav className="flex gap-2 overflow-x-auto rounded-3xl border border-slate-200 bg-white p-2 shadow-sm sm:grid sm:grid-cols-2 lg:grid-cols-4" aria-label="PACE-instellingen">
      {PACE_SETTINGS_TABS.map((tab) => <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} aria-current={activeTab === tab.id ? "page" : undefined} className={`flex min-w-[190px] items-center gap-3 rounded-2xl border px-4 py-3 text-left transition sm:min-w-0 ${activeTab === tab.id ? "border-sky-200 bg-sky-50 text-sky-900 shadow-xs" : "border-transparent text-slate-600 hover:border-slate-200 hover:bg-slate-50"}`}><span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${activeTab === tab.id ? "bg-white text-sky-700" : "bg-slate-100 text-slate-500"}`}>{tab.icon}</span><span className="min-w-0"><strong className="block text-xs font-black">{tab.label}</strong><small className="mt-0.5 block truncate text-[10px] font-semibold text-slate-500">{tab.detail}</small></span></button>)}
    </nav>

    {activeTab === "overview" && <>
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6" aria-label="PACE verbruik en credits">
        <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 sm:flex-row sm:items-center sm:justify-between"><div><span className="text-[10px] font-black uppercase tracking-[0.15em] text-sky-700">Verbruik & facturatie</span><h3 className="mt-1 text-lg font-black text-slate-950">Je PACE-bundel</h3><p className="mt-1 text-xs font-medium text-slate-500">In één oogopslag hoeveel vragen je nog kunt stellen.</p></div><div className="flex flex-wrap gap-2"><span className="rounded-full bg-sky-50 px-3 py-2 text-xs font-black uppercase text-sky-800">{overview?.tier ?? "basic"}</span><span className="rounded-full bg-emerald-50 px-3 py-2 text-xs font-extrabold text-emerald-700"><Coins size={13} className="mr-1 inline" /> {overview?.credit_balance ?? 0} losse credits</span></div></div>
        {billingError && <p className="mt-4 rounded-xl bg-rose-50 p-3 text-xs font-bold text-rose-700">{billingError}</p>}
        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5 md:p-6"><div className="flex items-start gap-4"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-sky-100 bg-white text-sky-700 shadow-sm"><Gauge size={21} /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-start justify-between gap-3"><div><span className="text-[10px] font-black uppercase tracking-[0.15em] text-sky-700">Beschikbaar {quotaPeriod}</span><div className="mt-1 flex flex-wrap items-baseline gap-2"><strong className="text-3xl font-black tracking-tight text-slate-950">{billingLoading ? "—" : quotaRemaining}</strong><span className="text-sm font-extrabold text-slate-600">van {quotaLimit} vragen over</span></div></div><span className="pt-1 text-xs font-black text-slate-500">{quotaPercent}% gebruikt</span></div><div className="mt-5 h-2.5 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-label="PACE quotaverbruik" aria-valuemin={0} aria-valuemax={quotaLimit} aria-valuenow={quotaUsed}><span className={`block h-full rounded-full ${quotaTone} transition-[width] duration-500`} style={{ width: `${quotaPercent}%` }} /></div><div className="mt-3 flex flex-wrap justify-between gap-2 text-[11px] font-bold text-slate-500"><span>{quotaUsed} gebruikt</span><span>Reset {resetLabel}</span></div>{(overview?.usage.rollover_balance ?? 0) > 0 && <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-[10px] font-black text-sky-700"><Sparkles size={12} /> +{overview!.usage.rollover_balance} rollovervragen</div>}</div></div></div>
          <div className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-700"><Coins size={19} /></div><div><strong className="block text-sm font-black text-slate-950">Losse credits</strong><span className="text-[11px] font-bold text-emerald-700">{overview?.credit_balance ?? 0} beschikbaar</span></div></div><p className="mt-4 text-xs leading-5 text-slate-500">50 extra vragen voor € 5,00. Vervallen niet en worden pas gebruikt wanneer je bundel leeg is.</p><button type="button" disabled={!owner || buyingCredits} onClick={() => void buyCredits()} className="mt-4 w-full rounded-xl bg-sky-700 px-3 py-2.5 text-xs font-black text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-50">{buyingCredits ? "Aankoop openen…" : "50 credits kopen · €5"}</button>{!owner && <small className="mt-2 block text-[10px] text-slate-500">Alleen de winkeleigenaar kan credits kopen.</small>}</div>
        </div>
        {owner && overview?.tier === "pro" && <label className="mt-4 flex cursor-pointer items-center justify-between gap-4 rounded-2xl border border-slate-200 p-4"><span><strong className="block text-sm text-slate-900">Ongebruikte vragen meenemen</strong><small className="mt-1 block text-xs text-slate-500">Voeg het ongebruikte deel van de maandbundel toe aan je rollover-saldo.</small></span><input type="checkbox" checked={overview.rollover_enabled} onChange={(event) => void setRollover(currentStoreId!, event.target.checked)} className="h-5 w-5 accent-sky-700" /></label>}
      </section>
      <div className="grid gap-4 md:grid-cols-2"><div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><ShieldCheck size={20} className="text-emerald-600" /><strong className="mt-3 block text-sm font-black text-slate-950">Jij houdt de controle</strong><p className="mt-1 text-xs leading-5 text-slate-500">PACE voert nooit zelfstandig betalingen, retouren of wijzigingen uit.</p></div><div className="rounded-2xl border border-sky-200 bg-sky-50/60 p-5"><Database size={20} className="text-sky-700" /><strong className="mt-3 block text-sm font-black text-slate-950">Gerichte winkelcontext</strong><p className="mt-1 text-xs leading-5 text-slate-500">Alleen informatie die relevant is voor je vraag en waarvoor je toegang hebt.</p></div></div>
    </>}

    {activeTab === "personal" && <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]"><div className="space-y-5"><Section icon={<UserRound size={19} />} eyebrow="Persoonlijk" title="Mijn Pace" description="Deze keuzes volgen jou per winkel, ook wanneer je op een andere kassa aanmeldt."><Switch label="Pace tonen" detail="Toon de Pace-knop en persoonlijke hulp in je werkruimte. Dit verandert niets voor andere medewerkers." checked={preferences.enabled} onChange={(enabled) => updatePreferences({ enabled })} icon={<Eye size={18} />} badge="Alleen voor jou" /><Switch label="AI-antwoorden gebruiken" detail="Laat Pace Gemini gebruiken voor vrije vragen en uitgebreidere uitleg. Uit betekent dat er geen AI-aanvraag wordt verstuurd; lokale hulp blijft werken." checked={preferences.aiEnabled} onChange={(aiEnabled) => updatePreferences({ aiEnabled })} icon={<BrainCircuit size={18} />} badge="Alleen voor jou" /><Switch label="Actuele winkelgegevens meenemen" detail="Geef Pace toestemming om bij een AI-vraag relevante gegevens van deze winkel te lezen." checked={preferences.liveStoreContext} disabled={!preferences.aiEnabled} onChange={(liveStoreContext) => updatePreferences({ liveStoreContext })} icon={<Database size={18} />} badge="Alleen voor jou" /><Choice<PaceTone> label="Stijl van antwoorden" value={preferences.tone} onChange={(tone) => updatePreferences({ tone })} options={[{ value: "compact", label: "Kort", detail: "Direct antwoord, weinig uitleg." }, { value: "friendly", label: "Vriendelijk", detail: "Menselijk en praktisch." }, { value: "explanatory", label: "Met uitleg", detail: "Meer stappen en context." }]} /><Choice<PaceProactivity> label="Hoe vaak Pace zelf iets toont" value={preferences.proactivity} onChange={(proactivity) => updatePreferences({ proactivity })} options={[{ value: "quiet", label: "Stil", detail: "Alleen wanneer jij vraagt." }, { value: "balanced", label: "Gebalanceerd", detail: "Alleen relevante momenten." }, { value: "coach", label: "Coach", detail: "Ook tips en vervolgstappen." }]} /></Section><Section icon={<Palette size={19} />} eyebrow="Beleving" title="Beweging en expressie" description="Bepaal hoeveel merkbeweging prettig is."><div className="grid items-center gap-4 rounded-2xl border border-sky-100 bg-sky-50/60 p-4 sm:grid-cols-[130px_minmax(0,1fr)]"><div className="flex min-h-28 items-center justify-center rounded-2xl bg-white"><PaceMark key={preview ?? "idle"} size={92} active emotion="attentive" performance={preview} forceMotion={Boolean(preview)} motionMode={preferences.motion} expressive={preferences.expressiveMorphs} /></div><div><strong className="text-sm font-extrabold text-slate-900">Bekijk een expressie</strong><p className="mt-1 text-xs leading-5 text-slate-500">PACE keert na elke preview terug naar het gewone merkteken.</p><div className="mt-3 flex flex-wrap gap-2">{([["question", "Vraagteken"], ["exclamation", "Uitroepteken"], ["liquid", "Blob"]] as Array<[PacePerformance, string]>).map(([mode, label]) => <button type="button" key={mode} disabled={!preferences.expressiveMorphs} onClick={() => playPreview(mode)} className="rounded-xl border border-sky-200 bg-white px-3 py-2 text-[11px] font-extrabold text-sky-800 hover:bg-sky-50 disabled:opacity-40">{label}</button>)}</div></div></div><Switch label="Expressieve animaties" detail="Gebruik het vraagteken, uitroepteken en de blob tijdens passende momenten." checked={preferences.expressiveMorphs} onChange={(expressiveMorphs) => updatePreferences({ expressiveMorphs })} icon={<Sparkles size={18} />} /><Choice<PaceMotion> label="Hoeveel beweging" value={preferences.motion} onChange={(motion) => updatePreferences({ motion })} options={[{ value: "full", label: "Volledig", detail: "Alle rustige merkbewegingen." }, { value: "subtle", label: "Subtiel", detail: "Alleen functionele beweging." }, { value: "off", label: "Uit", detail: "Statisch, behalve previews." }]} /></Section></div><aside className="space-y-4 lg:sticky lg:top-6 lg:self-start"><div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><ShieldCheck size={22} className="text-emerald-600" /><h3 className="mt-3 text-sm font-black text-slate-950">Privacy per schakelaar</h3><ul className="mt-4 space-y-3 text-xs font-medium leading-5 text-slate-600"><li>AI uit: geen externe AI-aanvraag.</li><li>Winkelgegevens uit: geen actuele winkelcontext.</li><li>Je keuzes gelden alleen voor jou.</li></ul></div></aside></div>}

    {activeTab === "guidance" && <Section icon={<BellRing size={19} />} eyebrow="Begeleiding" title="Wat PACE onder de aandacht brengt" description="Kies welke soorten hulp naast je eigen vragen zichtbaar mogen worden."><Switch label="Operationele meldingen" detail="Waarschuw bij offline status, mislukte synchronisatie en werk dat nog in de wachtrij staat." checked={preferences.operationalSignals} onChange={(operationalSignals) => updatePreferences({ operationalSignals })} icon={<Gauge size={18} />} /><Switch label="Hulp bij winkelsetup" detail="Toon de eerstvolgende nuttige stap zolang belangrijke winkelinstellingen nog ontbreken." checked={preferences.setupGuidance} onChange={(setupGuidance) => updatePreferences({ setupGuidance })} icon={<Check size={18} />} /><Switch label="Inzichten en vervolgstappen" detail="Vertaal patronen en statusinformatie naar een controleerbare volgende stap." checked={preferences.insightGuidance} onChange={(insightGuidance) => updatePreferences({ insightGuidance })} icon={<Bot size={18} />} /><button type="button" onClick={resetDismissedSignals} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-extrabold text-slate-600 hover:border-sky-300 hover:text-sky-700"><RotateCcw size={14} /> Eerder gesloten meldingen opnieuw tonen</button></Section>}

    {activeTab === "team" && <div className="space-y-5"><Section icon={<Store size={19} />} eyebrow="Voor deze winkel" title="Klanthulp voor het hele team" description={owner ? "Deze winkelbrede keuzes gelden voor iedere medewerker." : "Alleen een eigenaar kan deze winkelbrede keuzes aanpassen."}><Switch label="Klantinzichten tonen" detail="Toon relevante aankopen en servicekansen nadat een medewerker bewust een klant heeft gekoppeld." checked={customerSettings.enabled} disabled={!owner} onChange={(enabled) => updateCustomerSettings({ enabled })} icon={<HeartHandshake size={18} />} badge="Hele winkel" /><Switch label="Merkvoorkeuren herkennen" detail="Benoem terugkerende merken alleen wanneer het patroon duidelijk is en er passende artikelen beschikbaar zijn." checked={customerSettings.brandAffinityEnabled} disabled={!owner || !customerSettings.enabled} onChange={(brandAffinityEnabled) => updateCustomerSettings({ brandAffinityEnabled })} icon={<Sparkles size={18} />} badge="Hele winkel" /><Switch label="Retourherinneringen" detail={`Help medewerkers bij servicevragen binnen de ingestelde retourtermijn van ${returnPolicy.windowDays} dagen.`} checked={customerSettings.returnRemindersEnabled && returnPolicy.enabled} disabled={!owner || !customerSettings.enabled} onChange={(enabled) => updateProfile({ customerInsightSettings: { ...customerSettings, returnRemindersEnabled: enabled }, commercialReturnPolicy: { ...returnPolicy, enabled } })} icon={<ReceiptText size={18} />} badge="Hele winkel" /></Section>{owner && overview && <Section icon={<ShieldCheck size={19} />} eyebrow="Teambeheer" title="PACE-toegang per rol" description="Beperk wie PACE mag vragen. Een optionele maandlimiet geldt bovenop de winkelbundel.">{overview.role_policies.map((policy) => <div key={policy.role} className="grid items-center gap-3 rounded-2xl border border-slate-200 p-4 sm:grid-cols-[1fr_150px_auto]"><div><strong className="block text-sm capitalize text-slate-900">{policy.role}</strong><span className="text-xs text-slate-500">{policy.enabled ? "PACE-vragen toegestaan" : "PACE voor deze rol geblokkeerd"}</span></div><input type="number" min="0" placeholder="Geen rollimiet" defaultValue={policy.monthly_limit ?? ""} onBlur={(event) => void saveRolePolicy(currentStoreId!, policy.role, policy.enabled, event.target.value === "" ? null : Number(event.target.value))} className="rounded-xl border border-slate-200 px-3 py-2 text-xs" aria-label={`Maandlimiet ${policy.role}`} /><button type="button" onClick={() => void saveRolePolicy(currentStoreId!, policy.role, !policy.enabled, policy.monthly_limit)} className={`rounded-xl px-3 py-2 text-xs font-black ${policy.enabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{policy.enabled ? "Toegestaan" : "Geblokkeerd"}</button></div>)}</Section>}</div>}
  </div>;
};
