import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Barcode,
  Check,
  CheckCircle2,
  FileSpreadsheet,
  PackagePlus,
  Receipt,
  Store,
  Tags,
  X,
} from "lucide-react";
import { useAuth } from "../auth/useAuth";
import { Modal } from "./Modal";
import { MerchantTicketPreview } from "./MerchantTicketPreview";
import { useMerchantProfile } from "../store/useMerchantProfile";
import { useStoreConfiguration } from "../store/useStoreConfiguration";
import { useCategories } from "../store/useCategories";
import { useProducts } from "../store/useProducts";
import { PaceMark } from "../pace/PaceMark";

type GuideStep = "welcome" | "identity" | "categories" | "catalog" | "labels";
export type SetupGuideTarget = "catalog-categories" | "catalog-products" | "labels";

interface StoreSetupGuideProps {
  open: boolean;
  onClose: () => void;
  onAddCategories: () => void;
  onAddProduct: () => void;
  onImportProducts: () => void;
  onOpenBarcodeLabels: () => void;
  onTargetChange?: (target: SetupGuideTarget | null) => void;
}

const STEPS: GuideStep[] = ["welcome", "identity", "categories", "catalog", "labels"];

const STEP_LABELS: Record<GuideStep, string> = {
  welcome: "Welkom",
  identity: "Kassaticket",
  categories: "Categorieën",
  catalog: "Producten",
  labels: "Barcode-etiketten",
};

const sourceLabel = (source: string): string => {
  const labels: Record<string, string> = {
    spreadsheet: "een Excel- of CSV-bestand",
    pos: "een bestaand kassasysteem",
    ecommerce: "je webshopplatform",
    erp: "je ERP- of boekhoudsoftware",
    supplier: "bestanden van leveranciers",
  };
  return labels[source] ?? "een bestaande productlijst";
};

export const StoreSetupGuide: React.FC<StoreSetupGuideProps> = ({
  open,
  onClose,
  onAddCategories,
  onAddProduct,
  onImportProducts,
  onOpenBarcodeLabels,
  onTargetChange,
}) => {
  const currentStoreName = useAuth((state) => state.currentStoreName);
  const configuration = useStoreConfiguration((state) => state.configuration);
  const profile = useMerchantProfile((state) => state.profile);
  const updateProfile = useMerchantProfile((state) => state.updateProfile);
  const categories = useCategories((state) => state.list);
  const products = useProducts((state) => state.list);
  const [step, setStep] = useState<GuideStep>("welcome");
  const [compact, setCompact] = useState(false);
  const [savedIdentity, setSavedIdentity] = useState(false);
  const [form, setForm] = useState(() => ({
    name: profile.name === "PWAYMENT" && currentStoreName ? currentStoreName : profile.name,
    legalName: profile.legalName === "PWAYMENT" && currentStoreName ? currentStoreName : profile.legalName ?? "",
    addressLine1: profile.addressLine1,
    addressLine2: profile.addressLine2,
    vatNumber: profile.vatNumber,
    phone: profile.phone ?? "",
    email: profile.email ?? "",
    website: profile.website ?? "",
  }));

  useEffect(() => {
    if (!open) return;
    setForm({
      name: profile.name === "PWAYMENT" && currentStoreName ? currentStoreName : profile.name,
      legalName: profile.legalName === "PWAYMENT" && currentStoreName ? currentStoreName : profile.legalName ?? "",
      addressLine1: profile.addressLine1,
      addressLine2: profile.addressLine2,
      vatNumber: profile.vatNumber,
      phone: profile.phone ?? "",
      email: profile.email ?? "",
      website: profile.website ?? "",
    });
  }, [currentStoreName, open, profile]);

  const stepIndex = STEPS.indexOf(step);
  const hasExistingCatalog = configuration.catalogSource !== "none";
  const canSaveIdentity = useMemo(
    () => Boolean(form.name.trim() && form.addressLine1.trim() && form.addressLine2.trim() && form.vatNumber.trim()),
    [form],
  );

  const close = () => {
    setStep("welcome");
    setCompact(false);
    setSavedIdentity(false);
    onClose();
  };

  const saveIdentity = () => {
    if (!canSaveIdentity) return;
    updateProfile({
      name: form.name.trim(),
      legalName: form.legalName.trim() || undefined,
      addressLine1: form.addressLine1.trim(),
      addressLine2: form.addressLine2.trim(),
      vatNumber: form.vatNumber.trim().toUpperCase(),
      phone: form.phone.trim() || undefined,
      email: form.email.trim() || undefined,
      website: form.website.trim() || undefined,
    });
    setSavedIdentity(true);
    setStep("categories");
  };

  const launch = (action: "product" | "import") => {
    setCompact(true);
    if (action === "product") onAddProduct();
    else onImportProducts();
  };

  const launchCategories = () => {
    setCompact(true);
    onAddCategories();
  };

  const continueToCatalog = () => {
    setStep("catalog");
    setCompact(false);
  };

  const continueToLabels = () => {
    setStep("labels");
    setCompact(true);
    onOpenBarcodeLabels();
  };

  const previewMerchant = {
    ...profile,
    ...form,
    legalName: form.legalName || undefined,
    phone: form.phone || undefined,
    email: form.email || undefined,
    website: form.website || undefined,
  };

  useEffect(() => {
    if (!open || !compact) {
      onTargetChange?.(null);
      return;
    }

    const target: SetupGuideTarget = step === "categories"
      ? "catalog-categories"
      : step === "catalog"
        ? "catalog-products"
        : "labels";
    onTargetChange?.(target);

    return () => onTargetChange?.(null);
  }, [compact, onTargetChange, open, step]);

  if (open && compact) {
    return (
      <SetupCompanion
        step={step}
        categoryCount={categories.length}
        productCount={products.filter((product) => product.isActive !== false).length}
        onClose={close}
        onContinueCatalog={continueToCatalog}
        onContinueLabels={continueToLabels}
        onOpenCategories={onAddCategories}
        onOpenProducts={onAddProduct}
        onOpenLabels={onOpenBarcodeLabels}
      />
    );
  }

  return (
    <Modal
      open={open}
      onClose={close}
      closeOnBackdrop
      size="4xl"
      icon={<PaceMark size={30} active emotion={step === "welcome" ? "attentive" : step === "labels" ? "celebrating" : "guiding"} tone={step === "labels" ? "success" : "flow"} motionMode="subtle" />}
      title="Je winkel starten"
      subtitle="Een paar heldere stappen, daarna ben je klaar om te verkopen."
      className="store-setup-guide"
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <button
            type="button"
            onClick={stepIndex === 0 ? close : () => setStep(STEPS[stepIndex - 1])}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-xs font-bold text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          >
            {stepIndex === 0 ? <><X size={15} /> Later</> : <><ArrowLeft size={15} /> Vorige</>}
          </button>
          <div className="flex items-center gap-3">
            {step === "identity" && <button type="button" onClick={saveIdentity} disabled={!canSaveIdentity} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#0e7490] px-4 text-xs font-extrabold text-white shadow-sm shadow-cyan-900/15 transition hover:bg-[#155e75] disabled:cursor-not-allowed disabled:opacity-40"><Check size={15} /> Gegevens bewaren</button>}
            <SetupProgress step={step} />
          </div>
        </div>
      }
    >
      <div className="relative overflow-hidden px-1 py-1">
        <div className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-sky-100/70 blur-3xl" />
        <div className="relative">
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-cyan-100 bg-cyan-50/70 px-3 py-2 text-xs font-semibold leading-5 text-cyan-950">
            <span className="h-2 w-2 shrink-0 rounded-full bg-cyan-500 shadow-[0_0_0_4px_rgba(6,182,212,0.1)]" />
            {step === "welcome" && "Pace volgt de echte winkelstatus en brengt je telkens naar de eerstvolgende onvoltooide stap."}
            {step === "identity" && "Deze gegevens worden door de bestaande ticketinstellingen bewaard; Pace leest geen betaal- of inloggegevens."}
            {step === "categories" && "Categorieën structureren de kassa en rapportage. Pace controleert alleen of er minstens één actieve categorie bestaat."}
            {step === "catalog" && "Je kiest zelf tussen import en handmatig productbeheer. Pace voert geen activatie zonder jouw bevestiging uit."}
            {step === "labels" && "Barcodes zijn aanbevolen, niet verplicht om de basisopzet af te ronden. Je kunt dit bewust later doen."}
          </div>
          {step === "welcome" && (
            <div className="space-y-6 py-2">
              <div className="rounded-2xl border border-sky-100 bg-gradient-to-br from-sky-50 to-white p-5 sm:p-6">
                <div className="flex items-start gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#0e7490] text-white shadow-lg shadow-cyan-900/15"><Store size={20} /></div>
                  <div>
                    <p className="text-sm font-black text-slate-950">Welkom bij {currentStoreName || form.name || "je winkel"}.</p>
                    <p className="mt-1.5 max-w-lg text-sm leading-6 text-slate-600">Je winkeltype en voorkeuren zijn al ingesteld. We zorgen nu dat je kassaticketgegevens kloppen, je categorieën logisch zijn en je eerste producten klaarstaan.</p>
                  </div>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <GuideFact label="Type zaak" value={configuration.industry.replaceAll("-", " ")} />
                <GuideFact label="Verkoop" value={configuration.salesModel === "physical" ? "Fysieke winkel" : configuration.salesModel.replaceAll("-", " ")} />
                <GuideFact label="Volgende stap" value="Eerste categorieën toevoegen" />
              </div>
              <button type="button" onClick={() => setStep("identity")} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#0e7490] px-4 text-sm font-extrabold text-white shadow-md shadow-cyan-900/15 transition hover:bg-[#155e75] sm:w-auto">
                Mijn winkel afwerken <ArrowRight size={17} />
              </button>
            </div>
          )}

          {step === "identity" && (
            <div className="space-y-5 py-2">
              <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-950">
                <Receipt size={18} className="mt-0.5 shrink-0 text-amber-700" />
                <p><strong>Zo verschijnt je zaak op je kassaticket.</strong> Deze gegevens worden rechtstreeks bewaard bij je bestaande kassaticket- en factuurinstellingen.</p>
              </div>
              <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Winkelnaam" required><input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} className="guide-input" autoComplete="organization" /></Field>
                  <Field label="Officiële bedrijfsnaam"><input value={form.legalName} onChange={(event) => setForm((current) => ({ ...current, legalName: event.target.value }))} className="guide-input" /></Field>
                  <Field label="Straat en nummer" required><input value={form.addressLine1} onChange={(event) => setForm((current) => ({ ...current, addressLine1: event.target.value }))} className="guide-input" autoComplete="street-address" /></Field>
                  <Field label="Postcode en gemeente" required><input value={form.addressLine2} onChange={(event) => setForm((current) => ({ ...current, addressLine2: event.target.value }))} className="guide-input" autoComplete="postal-code" /></Field>
                  <Field label="BTW-nummer" required><input value={form.vatNumber} onChange={(event) => setForm((current) => ({ ...current, vatNumber: event.target.value }))} className="guide-input" placeholder="BE0123.456.789" /></Field>
                  <Field label="Telefoon"><input value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} className="guide-input" autoComplete="tel" /></Field>
                  <Field label="E-mailadres"><input type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} className="guide-input" autoComplete="email" /></Field>
                  <Field label="Website"><input value={form.website} onChange={(event) => setForm((current) => ({ ...current, website: event.target.value }))} className="guide-input" placeholder="www.jewinkel.be" /></Field>
                </div>
                <aside className="rounded-2xl border border-cyan-100 bg-cyan-50/50 p-3 shadow-sm">
                  <div className="mb-3 flex items-center justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#0e7490]">Live preview</p><p className="mt-0.5 text-xs font-bold text-slate-700">Je kassaticket</p></div><Receipt size={17} className="text-[#0e7490]" /></div>
                  <div className="max-h-[480px] overflow-y-auto overflow-x-hidden rounded-xl bg-slate-900 p-2"><MerchantTicketPreview merchant={previewMerchant} /></div>
                </aside>
              </div>
              <p className="border-t border-slate-100 pt-4 text-xs text-slate-500">Velden met <span className="font-bold text-rose-600">*</span> zijn nodig voor een correct kassaticket. Je bewaart de gegevens via de vaste balk onderaan.</p>
            </div>
          )}

          {step === "categories" && (
            <div className="space-y-5 py-2">
              <div className="rounded-2xl border border-cyan-100 bg-gradient-to-br from-cyan-50 to-white p-5 sm:p-6">
                <div className="flex items-start gap-4"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#0e7490] text-white shadow-lg shadow-cyan-900/15"><Tags size={20} /></span><div><p className="text-sm font-black text-slate-950">Orden eerst je assortiment.</p><p className="mt-1.5 max-w-xl text-sm leading-6 text-slate-600">Maak één of meerdere hoofdcategorieën aan, zoals Dames, Accessoires of Services. Daarna voeg je producten sneller en consistenter toe.</p></div></div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2"><GuideFact label="Stap 1" value="Categorieën toevoegen" /><GuideFact label="Daarna" value="Eerste product toevoegen" /></div>
              <div className="flex flex-wrap gap-3"><button type="button" onClick={launchCategories} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#0e7490] px-4 text-sm font-extrabold text-white shadow-md shadow-cyan-900/15 transition hover:bg-[#155e75]"><Tags size={17} /> Categorieën beheren</button><button type="button" onClick={() => setStep("catalog")} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-cyan-200 bg-white px-4 text-sm font-extrabold text-[#0e7490] transition hover:bg-cyan-50">Ik heb al categorieën <ArrowRight size={17} /></button></div>
            </div>
          )}

          {step === "catalog" && (
            <div className="space-y-5 py-2">
              <div>
                <p className="text-lg font-black tracking-tight text-slate-950">Hoe wil je je assortiment starten?</p>
                <p className="mt-1 text-sm leading-6 text-slate-500">{hasExistingCatalog ? `Je gaf bij registratie aan dat je al werkt met ${sourceLabel(configuration.catalogSource)}.` : "Je gaf aan dat je zonder bestaande productlijst start."}</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <button type="button" onClick={() => launch("import")} className="group rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-md">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 text-sky-700"><FileSpreadsheet size={19} /></span>
                  <span className="mt-4 block text-sm font-black text-slate-950">Mijn productlijst importeren</span>
                  <span className="mt-1 block text-xs leading-5 text-slate-500">Upload Excel of CSV, controleer de kolommen en activeer pas wanneer alles klopt.</span>
                  <span className="mt-4 inline-flex items-center gap-1 text-xs font-extrabold text-sky-700">Naar import <ArrowRight size={14} /></span>
                </button>
                <button type="button" onClick={() => launch("product")} className="group rounded-2xl border border-cyan-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-cyan-400 hover:shadow-md">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0e7490] text-white"><PackagePlus size={19} /></span>
                  <span className="mt-4 block text-sm font-black text-slate-950">Mijn eerste product toevoegen</span>
                  <span className="mt-1 block text-xs leading-5 text-slate-500">Je hebt alleen een naam, categorie en verkoopprijs nodig om te beginnen.</span>
                  <span className="mt-4 inline-flex items-center gap-1 text-xs font-extrabold text-[#0e7490]">Product toevoegen <ArrowRight size={14} /></span>
                </button>
              </div>
              {savedIdentity && <p className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800">Je zaakgegevens zijn bewaard. Je kunt ze later altijd aanpassen bij Kassaticket & Branding.</p>}
            </div>
          )}

          {step === "labels" && (
            <div className="space-y-5 py-2">
              <div className="rounded-2xl border border-cyan-100 bg-gradient-to-br from-cyan-50 to-white p-5 sm:p-6">
                <div className="flex items-start gap-4"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#0e7490] text-white shadow-lg shadow-cyan-900/15"><Barcode size={20} /></span><div><p className="text-sm font-black text-slate-950">Maak je producten klaar voor de winkelvloer.</p><p className="mt-1.5 max-w-xl text-sm leading-6 text-slate-600">Controleer je barcodes en druk meteen je eerste etiketten af. Daarna is de basisopzet van je winkel compleet.</p></div></div>
              </div>
              <button type="button" onClick={() => { setCompact(true); onOpenBarcodeLabels(); }} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#0e7490] px-4 text-sm font-extrabold text-white shadow-md shadow-cyan-900/15 transition hover:bg-[#155e75]"><Barcode size={17} /> Barcode-etiketten openen</button>
            </div>
          )}

        </div>
      </div>
    </Modal>
  );
};

const SetupProgress = ({ step, compact = false }: { step: GuideStep; compact?: boolean }) => {
  const activeIndex = STEPS.indexOf(step);
  return (
    <div className="flex items-center gap-2" aria-label={`Stap ${activeIndex + 1} van ${STEPS.length}: ${STEP_LABELS[step]}`}>
      {!compact && <span className="hidden text-[10px] font-black uppercase tracking-[0.12em] text-slate-400 md:inline">{STEP_LABELS[step]}</span>}
      <div className="flex items-center gap-1.5">
        {STEPS.map((item, index) => <span key={item} title={STEP_LABELS[item]} className={`h-1.5 rounded-full transition-all ${index === activeIndex ? "w-7 bg-[#0e7490]" : index < activeIndex ? "w-1.5 bg-emerald-500" : "w-1.5 bg-slate-200"}`} />)}
      </div>
    </div>
  );
};

const SetupCompanion = ({
  step,
  categoryCount,
  productCount,
  onClose,
  onContinueCatalog,
  onContinueLabels,
  onOpenCategories,
  onOpenProducts,
  onOpenLabels,
}: {
  step: GuideStep;
  categoryCount: number;
  productCount: number;
  onClose: () => void;
  onContinueCatalog: () => void;
  onContinueLabels: () => void;
  onOpenCategories: () => void;
  onOpenProducts: () => void;
  onOpenLabels: () => void;
}) => {
  const isCategories = step === "categories";
  const isCatalog = step === "catalog";
  const isLabels = step === "labels";
  const Icon = isCategories ? Tags : isCatalog ? PackagePlus : Barcode;
  const title = isCategories ? "Categorieën opbouwen" : isCatalog ? "Producten toevoegen" : "Barcode-etiketten";
  const detail = isCategories
    ? categoryCount === 0 ? "Voeg minstens één categorie toe om verder te gaan." : `${categoryCount} ${categoryCount === 1 ? "categorie" : "categorieën"} klaar. Je kunt verder naar je producten.`
    : isCatalog
      ? productCount === 0 ? "Voeg je eerste product toe of importeer je assortiment." : `${productCount} ${productCount === 1 ? "product" : "producten"} klaar. Tijd voor je etiketten.`
      : "Controleer barcodes, kies je etiketformaat en druk een testetiket af.";
  const primaryDisabled = isCategories ? categoryCount === 0 : isCatalog ? productCount === 0 : false;
  const primaryLabel = isCategories ? "Verder naar producten" : isCatalog ? "Verder naar barcode-etiketten" : "Winkelsetup afronden";
  const primaryAction = isCategories ? onContinueCatalog : isCatalog ? onContinueLabels : onClose;
  const reopenAction = isCategories ? onOpenCategories : isCatalog ? onOpenProducts : onOpenLabels;
  const reopenLabel = isCategories ? "Categoriebeheer openen" : isCatalog ? "Productbeheer openen" : "Barcode-tab openen";

  return (
    <aside className="setup-companion fixed bottom-5 right-5 z-40 w-[calc(100vw-2.5rem)] max-w-sm overflow-hidden rounded-2xl border border-cyan-200 bg-white shadow-[0_22px_55px_rgba(15,23,42,0.22)]" aria-label="Winkelsetup begeleiden">
      <div className="flex items-start gap-3 border-b border-slate-100 bg-gradient-to-br from-cyan-50 to-white p-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#0e7490] text-white"><Icon size={18} /></span>
        <div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#0e7490]">Je winkel starten</p><button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Setup-assistent sluiten"><X size={15} /></button></div><h2 className="mt-0.5 text-sm font-black text-slate-950">{title}</h2><p className="mt-1 text-xs leading-5 text-slate-600">{detail}</p></div>
      </div>
      <div className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-3"><span className="text-[10px] font-bold text-slate-400">Stap {STEPS.indexOf(step) + 1} van {STEPS.length}</span><SetupProgress step={step} compact /></div>
        <button type="button" onClick={primaryAction} disabled={primaryDisabled} className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#0e7490] px-4 text-xs font-extrabold text-white shadow-sm transition hover:bg-[#155e75] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none">{isLabels && <CheckCircle2 size={15} />}{primaryLabel}{!isLabels && <ArrowRight size={15} />}</button>
        <button type="button" onClick={reopenAction} className="group inline-flex w-full items-center justify-center gap-1.5 text-center text-[11px] font-bold text-slate-500 transition hover:text-[#0e7490]"><span className="setup-companion-pointer" aria-hidden="true"><ArrowRight size={13} /></span>{reopenLabel}</button>
      </div>
    </aside>
  );
};

const GuideFact = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-3 shadow-sm">
    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">{label}</p>
    <p className="mt-1 truncate text-xs font-extrabold capitalize text-slate-800">{value}</p>
  </div>
);

const Field = ({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) => (
  <label className="block text-xs font-bold text-slate-700">
    {label}{required && <span className="text-rose-600"> *</span>}
    {children}
  </label>
);
