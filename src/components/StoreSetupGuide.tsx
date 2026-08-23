import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FileSpreadsheet,
  PackagePlus,
  Receipt,
  Store,
  X,
} from "lucide-react";
import { useAuth } from "../auth/useAuth";
import { Modal } from "./Modal";
import { useMerchantProfile } from "../store/useMerchantProfile";
import { useStoreConfiguration } from "../store/useStoreConfiguration";

type GuideStep = "welcome" | "identity" | "catalog" | "ready";

interface StoreSetupGuideProps {
  open: boolean;
  onClose: () => void;
  onAddProduct: () => void;
  onImportProducts: () => void;
}

const STEPS: GuideStep[] = ["welcome", "identity", "catalog", "ready"];

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
  onAddProduct,
  onImportProducts,
}) => {
  const currentStoreName = useAuth((state) => state.currentStoreName);
  const configuration = useStoreConfiguration((state) => state.configuration);
  const profile = useMerchantProfile((state) => state.profile);
  const updateProfile = useMerchantProfile((state) => state.updateProfile);
  const [step, setStep] = useState<GuideStep>("welcome");
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
    setStep("catalog");
  };

  const launch = (action: "product" | "import") => {
    close();
    if (action === "product") onAddProduct();
    else onImportProducts();
  };

  return (
    <Modal
      open={open}
      onClose={close}
      closeOnBackdrop
      size="2xl"
      icon={<Store size={21} />}
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
          <div className="hidden items-center gap-1.5 sm:flex" aria-label={`Stap ${stepIndex + 1} van ${STEPS.length}`}>
            {STEPS.map((item, index) => <span key={item} className={`h-1.5 rounded-full transition-all ${index === stepIndex ? "w-7 bg-sky-600" : index < stepIndex ? "w-1.5 bg-emerald-500" : "w-1.5 bg-slate-200"}`} />)}
          </div>
        </div>
      }
    >
      <div className="relative overflow-hidden px-1 py-1">
        <div className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-sky-100/70 blur-3xl" />
        <div className="relative">
          {step === "welcome" && (
            <div className="space-y-6 py-2">
              <div className="rounded-2xl border border-sky-100 bg-gradient-to-br from-sky-50 to-white p-5 sm:p-6">
                <div className="flex items-start gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-lg shadow-slate-950/15"><Store size={20} /></div>
                  <div>
                    <p className="text-sm font-black text-slate-950">Welkom bij {currentStoreName || form.name || "je winkel"}.</p>
                    <p className="mt-1.5 max-w-lg text-sm leading-6 text-slate-600">Je winkeltype en voorkeuren zijn al ingesteld. We zorgen nu dat je bongegevens kloppen en dat je eerste producten klaarstaan.</p>
                  </div>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <GuideFact label="Type zaak" value={configuration.industry.replaceAll("-", " ")} />
                <GuideFact label="Verkoop" value={configuration.salesModel === "physical" ? "Fysieke winkel" : configuration.salesModel.replaceAll("-", " ")} />
                <GuideFact label="Volgende stap" value={hasExistingCatalog ? "Productlijst klaarzetten" : "Eerste product toevoegen"} />
              </div>
              <button type="button" onClick={() => setStep("identity")} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-extrabold text-white shadow-md transition hover:bg-black sm:w-auto">
                Mijn winkel afwerken <ArrowRight size={17} />
              </button>
            </div>
          )}

          {step === "identity" && (
            <div className="space-y-5 py-2">
              <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-950">
                <Receipt size={18} className="mt-0.5 shrink-0 text-amber-700" />
                <p><strong>Zo verschijnt je zaak op je bon.</strong> Deze gegevens worden rechtstreeks bewaard bij je bestaande bon- en factuurinstellingen.</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:flex sm:items-center sm:justify-between sm:gap-6">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Voorbeeld op je bon</p>
                  <p className="mt-1 text-sm font-black uppercase tracking-wide text-slate-900">{form.name || "Jouw winkelnaam"}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">{form.addressLine1 || "Straat en nummer"}<br />{form.addressLine2 || "Postcode en gemeente"}<br />BTW: {form.vatNumber || "BE…"}</p>
                </div>
                <span className="mt-3 inline-flex rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-sky-700 sm:mt-0">Live voorbeeld</span>
              </div>
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
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                <p className="text-xs text-slate-500">Velden met <span className="font-bold text-rose-600">*</span> zijn nodig voor een correcte bon.</p>
                <button type="button" onClick={saveIdentity} disabled={!canSaveIdentity} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-extrabold text-white shadow-md transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-40">
                  <Check size={17} /> Gegevens bewaren
                </button>
              </div>
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
                <button type="button" onClick={() => launch("product")} className="group rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-slate-400 hover:shadow-md">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-950 text-white"><PackagePlus size={19} /></span>
                  <span className="mt-4 block text-sm font-black text-slate-950">Mijn eerste product toevoegen</span>
                  <span className="mt-1 block text-xs leading-5 text-slate-500">Je hebt alleen een naam, categorie en verkoopprijs nodig om te beginnen.</span>
                  <span className="mt-4 inline-flex items-center gap-1 text-xs font-extrabold text-slate-900">Product toevoegen <ArrowRight size={14} /></span>
                </button>
              </div>
              {savedIdentity && <p className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800">Je zaakgegevens zijn bewaard. Je kunt ze later altijd aanpassen bij Bonteksten & Branding.</p>}
            </div>
          )}

          {step === "ready" && null}
        </div>
      </div>
    </Modal>
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
