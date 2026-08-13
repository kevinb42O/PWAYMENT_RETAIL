import React, { useRef, useState } from "react";
import {
  Cable,
  CalendarClock,
  Check,
  CircleAlert,
  FileText,
  History,
  Lightbulb,
  LoaderCircle,
  Monitor,
  ShoppingBag,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "../auth/useAuth";
import type { ConfigurableModule } from "../onboarding/storeConfiguration";
import { useStoreConfiguration } from "../store/useStoreConfiguration";

type SaveState = "idle" | "saving" | "saved" | "error";

interface ModuleOption {
  key: ConfigurableModule;
  title: string;
  navigationLabel: string;
  description: string;
  Icon: LucideIcon;
}

const MODULE_OPTIONS: ModuleOption[] = [
  {
    key: "catalog",
    title: "Integration Hub",
    navigationLabel: "Integration Hub",
    description: "Importeer productlijsten, voorraad en leveranciersdata vanuit één centrale plaats.",
    Icon: Cable,
  },
  {
    key: "customers",
    title: "Klantenbeheer",
    navigationLabel: "Klanten",
    description: "Beheer klantendossiers, aankoophistoriek, prijsafspraken en loyaliteit.",
    Icon: Users,
  },
  {
    key: "service",
    title: "Hersteldienst",
    navigationLabel: "Herstellingen",
    description: "Volg innames, prijzen, statussen, communicatie en afhaling volledig op.",
    Icon: Wrench,
  },
  {
    key: "workforce",
    title: "Personeel & verlof",
    navigationLabel: "Personeel & verlof",
    description: "Beheer werkuren, verlofsaldi, aanvragen en de bezetting van uw team.",
    Icon: CalendarClock,
  },
  {
    key: "webshop",
    title: "Webshop",
    navigationLabel: "Webshop",
    description: "Beheer uw online assortiment en verkoop vanuit dezelfde winkelomgeving.",
    Icon: ShoppingBag,
  },
  {
    key: "insights",
    title: "Inzichten",
    navigationLabel: "Inzichten",
    description: "Zet verkoop-, klant- en voorraadgegevens om in concrete winkelacties.",
    Icon: Lightbulb,
  },
];

const CORE_MODULES = [
  { label: "Kassa", Icon: Monitor },
  { label: "Dagafsluiting", Icon: FileText },
  { label: "Historiek", Icon: History },
];

export const ModuleSettings: React.FC = () => {
  const currentRole = useAuth((state) => state.currentRole);
  const currentStoreId = useAuth((state) => state.currentStoreId);
  const modules = useStoreConfiguration((state) => state.configuration.modules);
  const hydrated = useStoreConfiguration((state) => state.hydrated);
  const saving = useStoreConfiguration((state) => state.saving);
  const storeError = useStoreConfiguration((state) => state.error);
  const setModuleEnabled = useStoreConfiguration((state) => state.setModuleEnabled);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const latestRequest = useRef(0);

  const enabledCount = MODULE_OPTIONS.filter((option) => modules[option.key]).length;

  const toggle = (option: ModuleOption) => {
    if (currentRole !== "owner") return;
    const request = ++latestRequest.current;
    setSaveState("saving");
    void setModuleEnabled(option.key, !modules[option.key], currentStoreId).then(
      (result) => {
        if (request !== latestRequest.current) return;
        setSaveState(result.success ? "saved" : "error");
      },
    );
  };

  if (currentRole !== "owner") {
    return (
      <div className="max-w-3xl rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-900">
        Alleen de zaakvoerder kan modules voor de winkel aan- of uitzetten.
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5">
      <section className="overflow-hidden rounded-3xl border border-sky-200 bg-gradient-to-br from-white via-white to-sky-50 shadow-sm">
        <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[minmax(0,1.4fr)_minmax(260px,0.8fr)] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-extrabold text-sky-700">
              {enabledCount} van {MODULE_OPTIONS.length} extra modules actief
            </div>
            <h2 className="mt-4 text-2xl font-black tracking-tight text-slate-950">
              Uw werkbalk, precies zoals u hem nodig hebt
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Zet een module aan of uit. De bovenste navigatie past onmiddellijk mee aan en uw keuze wordt automatisch voor deze winkel bewaard.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" aria-label="Voorbeeld van de navigatiebalk">
            <div className="mb-3 text-[11px] font-extrabold uppercase tracking-[0.16em] text-slate-400">
              Zichtbaar in de navigatie
            </div>
            <div className="flex flex-wrap gap-2">
              {CORE_MODULES.map(({ label, Icon }) => (
                <span key={label} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-bold text-slate-700">
                  <Icon size={13} /> {label}
                </span>
              ))}
              {MODULE_OPTIONS.filter((option) => modules[option.key]).map(({ key, navigationLabel, Icon }) => (
                <span key={key} className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-xs font-bold text-sky-700">
                  <Icon size={13} /> {navigationLabel}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-3 md:grid-cols-2">
        {MODULE_OPTIONS.map((option) => {
          const enabled = modules[option.key];
          const { Icon } = option;
          return (
            <article
              key={option.key}
              className={`rounded-2xl border bg-white p-4 shadow-sm transition sm:p-5 ${
                enabled ? "border-sky-200 ring-1 ring-sky-100" : "border-slate-200"
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`rounded-xl border p-2.5 ${enabled ? "border-sky-200 bg-sky-50 text-sky-700" : "border-slate-200 bg-slate-50 text-slate-500"}`}>
                  <Icon size={20} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-extrabold text-slate-950">{option.title}</h3>
                      <p className={`mt-0.5 text-xs font-bold ${enabled ? "text-emerald-700" : "text-slate-400"}`}>
                        {enabled ? "Actief in uw navigatie" : "Verborgen uit uw navigatie"}
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={enabled}
                      aria-label={`${option.title} ${enabled ? "uitschakelen" : "inschakelen"}`}
                      onClick={() => toggle(option)}
                      className={`relative h-8 w-14 shrink-0 rounded-full border transition-colors focus:outline-none focus:ring-4 focus:ring-sky-100 ${
                        enabled ? "border-sky-500 bg-sky-500" : "border-slate-300 bg-slate-200"
                      }`}
                    >
                      <span className={`absolute top-1 h-5.5 w-5.5 rounded-full bg-white shadow-sm transition-transform ${enabled ? "translate-x-6" : "translate-x-1"}`} />
                    </button>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-600">{option.description}</p>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-extrabold text-slate-900">Altijd beschikbaar</div>
          <p className="mt-0.5 text-xs leading-5 text-slate-500">
            Kassa, dagafsluiting en historiek zijn kernonderdelen en kunnen niet per ongeluk worden uitgeschakeld.
          </p>
        </div>
        <div className="min-w-fit" aria-live="polite">
          {(saving || saveState === "saving") && (
            <span className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-bold text-sky-700">
              <LoaderCircle size={14} className="animate-spin" /> Automatisch bewaren…
            </span>
          )}
          {!saving && saveState === "saved" && !storeError && (
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700">
              <Check size={14} /> Automatisch bewaard
            </span>
          )}
          {!saving && (saveState === "error" || storeError) && (
            <span role="alert" className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700">
              <CircleAlert size={14} /> Niet bewaard — probeer opnieuw
            </span>
          )}
          {!saving && saveState === "idle" && !storeError && (
            <span className="text-xs font-semibold text-slate-500">Wijzigingen worden automatisch bewaard.</span>
          )}
        </div>
      </section>

      <p className="px-1 text-xs leading-5 text-slate-500">
        Modulezichtbaarheid en abonnementstoegang zijn gescheiden. U kunt uw werkruimte hier opruimen; uw actieve licentie blijft bepalen welke premiumfuncties gebruikt kunnen worden.
      </p>
    </div>
  );
};
