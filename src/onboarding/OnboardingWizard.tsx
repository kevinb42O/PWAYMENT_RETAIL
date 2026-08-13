import React, { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Boxes,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  LoaderCircle,
  Monitor,
  RotateCcw,
  ShoppingBag,
  Sparkles,
  Store,
  Users,
  Wrench,
  X,
} from "lucide-react";
import { useAuth } from "../auth/useAuth";
import { useStoreConfiguration } from "../store/useStoreConfiguration";
import {
  CATALOG_SOURCES,
  completeStoreConfiguration,
  createStoreConfigurationDraft,
  labelFor,
  MODULE_DETAILS,
  PRICING_MODELS,
  recommendedModulesForIndustry,
  recommendedStartView,
  RETAIL_INDUSTRIES,
  SALES_MODELS,
  SERVICE_CONTACT_OPTIONS,
  TEAM_SIZES,
  VAT_DEFAULTS,
  type ConfigurableModule,
  type RetailIndustry,
  type StoreConfiguration,
} from "./storeConfiguration";

type WizardMode = "registration" | "settings";
type WizardStep = "account" | "store" | "modules" | "data" | "review";

interface OnboardingWizardProps {
  mode: WizardMode;
  pinLoginEnabled?: boolean;
  onExit: (notice?: string) => void;
}

interface AccountDraft {
  firstName: string;
  lastName: string;
  storeName: string;
  email: string;
  password: string;
  confirmPassword: string;
  pin: string;
}

const EMPTY_ACCOUNT: AccountDraft = {
  firstName: "",
  lastName: "",
  storeName: "",
  email: "",
  password: "",
  confirmPassword: "",
  pin: "",
};

const STEP_LABELS: Record<WizardStep, string> = {
  account: "Account",
  store: "Winkel",
  modules: "Werkstromen",
  data: "Data & prijzen",
  review: "Klaarzetten",
};

const moduleIcons: Record<ConfigurableModule, React.ElementType> = {
  catalog: Boxes,
  customers: Users,
  service: Wrench,
  webshop: ShoppingBag,
  insights: BarChart3,
};

const inputClass =
  "mt-1.5 h-12 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-950 shadow-sm outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100";
const selectClass = `${inputClass} appearance-none pr-10`;

const accountError = (
  account: AccountDraft,
  pinLoginEnabled: boolean,
): string | null => {
  if (!account.firstName.trim() || !account.lastName.trim()) {
    return "Vul uw voornaam en familienaam in.";
  }
  if (!account.storeName.trim()) return "Vul de naam van uw winkel in.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(account.email.trim())) {
    return "Vul een geldig e-mailadres in.";
  }
  if (account.password.length < 12) {
    return "Kies een wachtwoord van minstens 12 tekens.";
  }
  if (account.password !== account.confirmPassword) {
    return "De wachtwoorden komen niet overeen.";
  }
  if (pinLoginEnabled && !/^\d{6}$/.test(account.pin)) {
    return "Kies een snel-PIN van exact 6 cijfers.";
  }
  return null;
};

const recommendationCopy = (configuration: StoreConfiguration): string => {
  const start = recommendedStartView(configuration);
  if (start === "integration-hub") {
    return "Na uw eerste aanmelding openen we de Integration Hub, zodat u meteen uw bestaande productlijst kunt meenemen.";
  }
  if (start === "service") {
    return "Na uw eerste aanmelding openen we de Hersteldienst, klaar voor uw eerste intake.";
  }
  return "Na uw eerste aanmelding openen we de kassa. Alle gekozen werkstromen staan direct in de navigatie.";
};

const SelectField = <T extends string>({
  id,
  label,
  value,
  options,
  onChange,
  hint,
}: {
  id: string;
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  hint?: string;
}) => (
  <label htmlFor={id} className="block text-xs font-bold text-slate-700">
    {label}
    <div className="relative">
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className={selectClass}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ArrowRight
        size={15}
        aria-hidden="true"
        className="pointer-events-none absolute right-4 top-1/2 mt-0.5 -translate-y-1/2 rotate-90 text-slate-400"
      />
    </div>
    {hint && <span className="mt-1.5 block font-medium leading-5 text-slate-500">{hint}</span>}
  </label>
);

export const OnboardingWizard: React.FC<OnboardingWizardProps> = ({
  mode,
  pinLoginEnabled = false,
  onExit,
}) => {
  const registerAccount = useAuth((state) => state.registerAccount);
  const currentStoreId = useAuth((state) => state.currentStoreId);
  const currentStoreName = useAuth((state) => state.currentStoreName);
  const storedConfiguration = useStoreConfiguration(
    (state) => state.configuration,
  );
  const saveConfiguration = useStoreConfiguration((state) => state.save);
  const [account, setAccount] = useState<AccountDraft>(() => ({
    ...EMPTY_ACCOUNT,
    storeName: mode === "settings" ? currentStoreName ?? "" : "",
  }));
  const [configuration, setConfiguration] = useState<StoreConfiguration>(() =>
    mode === "settings"
      ? { ...storedConfiguration, modules: { ...storedConfiguration.modules } }
      : createStoreConfigurationDraft(),
  );
  const steps = useMemo<WizardStep[]>(
    () =>
      mode === "registration"
        ? ["account", "store", "modules", "data", "review"]
        : ["store", "modules", "data", "review"],
    [mode],
  );
  const [stepIndex, setStepIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const currentStep = steps[stepIndex];
  const selectedModules = MODULE_DETAILS.filter(
    (module) => configuration.modules[module.key],
  );
  const progress = Math.round(((stepIndex + 1) / steps.length) * 100);

  const updateAccount = (key: keyof AccountDraft, value: string) => {
    setAccount((current) => ({ ...current, [key]: value }));
    setError(null);
  };

  const updateConfiguration = <K extends keyof StoreConfiguration>(
    key: K,
    value: StoreConfiguration[K],
  ) => {
    setConfiguration((current) => ({ ...current, [key]: value }));
    setError(null);
  };

  const chooseIndustry = (industry: RetailIndustry) => {
    setConfiguration((current) => ({
      ...current,
      industry,
      modules: recommendedModulesForIndustry(industry),
    }));
    setError(null);
  };

  const toggleModule = (key: ConfigurableModule) => {
    setConfiguration((current) => ({
      ...current,
      modules: { ...current.modules, [key]: !current.modules[key] },
    }));
  };

  const next = () => {
    if (currentStep === "account") {
      const nextError = accountError(account, pinLoginEnabled);
      if (nextError) {
        setError(nextError);
        return;
      }
    }
    setError(null);
    setStepIndex((current) => Math.min(current + 1, steps.length - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const previous = () => {
    setError(null);
    setStepIndex((current) => Math.max(0, current - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submit = async () => {
    setError(null);
    setIsSubmitting(true);

    if (mode === "registration") {
      const nextError = accountError(account, pinLoginEnabled);
      if (nextError) {
        setIsSubmitting(false);
        setError(nextError);
        setStepIndex(0);
        return;
      }
      const completed = completeStoreConfiguration(configuration);
      const result = await registerAccount({
        email: account.email,
        password: account.password,
        firstName: account.firstName,
        lastName: account.lastName,
        storeName: account.storeName,
        pin: account.pin,
        onboardingConfiguration: completed,
      });
      setIsSubmitting(false);
      if (!result.success) {
        setError(result.message ?? "Account aanmaken is niet gelukt.");
        return;
      }
      await saveConfiguration(completed, null);
      if (result.message) onExit(result.message);
      return;
    }

    const completed: StoreConfiguration = {
      ...configuration,
      completedAt: configuration.completedAt ?? new Date().toISOString(),
      firstRunCompleted: true,
    };
    const result = await saveConfiguration(completed, currentStoreId);
    setIsSubmitting(false);
    if (!result.success) {
      setError(result.message ?? "De configuratie kon niet worden bewaard.");
      return;
    }
    onExit("Uw winkelconfiguratie is bijgewerkt.");
  };

  return (
    <div
      className={`${mode === "settings" ? "fixed inset-0 z-[100]" : "min-h-dvh"} overflow-y-auto bg-[#f4f3ef] text-slate-950`}
      role={mode === "settings" ? "dialog" : undefined}
      aria-modal={mode === "settings" ? true : undefined}
      aria-label={mode === "settings" ? "Winkelconfiguratie" : undefined}
    >
      <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-[#f4f3ef]/95 px-5 py-4 backdrop-blur-xl sm:px-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <img
              src="/branding/pwayment-logo.svg"
              alt="Pwayment"
              className="h-7 w-auto"
            />
            <span className="hidden h-5 w-px bg-slate-300 sm:block" />
            <span className="hidden truncate text-xs font-bold text-slate-500 sm:block">
              {mode === "registration" ? "Uw winkel klaarzetten" : "Winkelconfiguratie"}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden rounded-full bg-white px-3 py-1.5 text-[11px] font-bold text-slate-500 shadow-sm ring-1 ring-slate-200 sm:inline-flex">
              <Sparkles size={13} className="mr-1.5 text-sky-600" /> 2–3 minuten
            </span>
            <button
              type="button"
              onClick={() => onExit()}
              className="inline-flex h-10 items-center gap-2 rounded-xl px-3 text-xs font-bold text-slate-600 transition hover:bg-white hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
            >
              {mode === "registration" ? (
                <>
                  <ArrowLeft size={15} /> Al een account
                </>
              ) : (
                <>
                  <X size={16} /> Sluiten
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-6 sm:px-8 sm:py-10 lg:grid-cols-[250px_minmax(0,1fr)] lg:gap-10">
        <aside className="hidden lg:block">
          <div className="sticky top-28">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
              Voortgang
            </p>
            <ol className="mt-5 space-y-2" aria-label="Configuratiestappen">
              {steps.map((step, index) => {
                const active = index === stepIndex;
                const complete = index < stepIndex;
                return (
                  <li key={step}>
                    <button
                      type="button"
                      disabled={index > stepIndex}
                      onClick={() => index < stepIndex && setStepIndex(index)}
                      aria-current={active ? "step" : undefined}
                      className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition ${
                        active
                          ? "bg-white text-slate-950 shadow-sm ring-1 ring-slate-200"
                          : complete
                            ? "text-slate-700 hover:bg-white/70"
                            : "cursor-default text-slate-400"
                      }`}
                    >
                      <span
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-black ${
                          active
                            ? "bg-slate-950 text-white"
                            : complete
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-slate-200 text-slate-500"
                        }`}
                      >
                        {complete ? <Check size={15} /> : index + 1}
                      </span>
                      <span className="text-sm font-bold">{STEP_LABELS[step]}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
            <div className="mt-8 rounded-2xl border border-slate-200 bg-white/70 p-4">
              <p className="text-xs font-extrabold text-slate-800">Geen definitieve keuzes</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                U kunt deze configuratie later altijd opnieuw openen vanuit uw accountmenu.
              </p>
            </div>
          </div>
        </aside>

        <section className="min-w-0">
          <div className="mb-4 lg:hidden">
            <div className="flex items-center justify-between text-xs font-bold text-slate-600">
              <span>{STEP_LABELS[currentStep]}</span>
              <span>{stepIndex + 1} / {steps.length}</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-slate-950 transition-[width] duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          <div className="overflow-hidden rounded-[28px] border border-white bg-white shadow-[0_28px_90px_-46px_rgba(15,23,42,0.5)] ring-1 ring-slate-200/80">
            <div className="border-b border-slate-100 px-5 py-6 sm:px-8 sm:py-8">
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-sky-600">
                Stap {stepIndex + 1} van {steps.length}
              </p>
              <h1 className="mt-2 text-2xl font-black tracking-[-0.025em] sm:text-3xl">
                {currentStep === "account" && "Eerst uw veilige account"}
                {currentStep === "store" && "Wat voor winkel bouwt u?"}
                {currentStep === "modules" && "Wat moet vanaf dag één klaarstaan?"}
                {currentStep === "data" && "Hoe werkt uw productwereld vandaag?"}
                {currentStep === "review" && "Dit zetten we voor u klaar"}
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                {currentStep === "account" && "Alleen wat nodig is om de winkel veilig aan u te koppelen."}
                {currentStep === "store" && "Uw sector bepaalt slimme beginwaarden, maar beperkt nooit wat PWAYMENT kan doen."}
                {currentStep === "modules" && "Kassa, dagafsluiting en historiek zijn altijd aanwezig. Kies de extra werkstromen die relevant zijn."}
                {currentStep === "data" && "Deze antwoorden sturen uw import, prijsopbouw en eerste aanbevolen actie."}
                {currentStep === "review" && "Controleer de kern. U kunt alles later opnieuw aanpassen."}
              </p>
            </div>

            <div className="px-5 py-6 sm:px-8 sm:py-8">
              {error && (
                <div
                  role="alert"
                  className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700"
                >
                  {error}
                </div>
              )}

              {currentStep === "account" && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="text-xs font-bold text-slate-700">
                    Voornaam
                    <input
                      aria-label="Voornaam"
                      autoComplete="given-name"
                      value={account.firstName}
                      onChange={(event) => updateAccount("firstName", event.target.value)}
                      className={inputClass}
                    />
                  </label>
                  <label className="text-xs font-bold text-slate-700">
                    Familienaam
                    <input
                      aria-label="Familienaam"
                      autoComplete="family-name"
                      value={account.lastName}
                      onChange={(event) => updateAccount("lastName", event.target.value)}
                      className={inputClass}
                    />
                  </label>
                  <label className="text-xs font-bold text-slate-700 sm:col-span-2">
                    Winkel / Bedrijfsnaam
                    <input
                      aria-label="Winkel / Bedrijfsnaam"
                      autoComplete="organization"
                      value={account.storeName}
                      onChange={(event) => updateAccount("storeName", event.target.value)}
                      className={inputClass}
                    />
                  </label>
                  <label className="text-xs font-bold text-slate-700 sm:col-span-2">
                    E-mailadres
                    <input
                      type="email"
                      aria-label="E-mailadres"
                      autoComplete="email"
                      value={account.email}
                      onChange={(event) => updateAccount("email", event.target.value)}
                      className={inputClass}
                    />
                  </label>
                  <label className="text-xs font-bold text-slate-700">
                    Wachtwoord
                    <span className="relative block">
                      <input
                        type={showPassword ? "text" : "password"}
                        aria-label="Wachtwoord"
                        autoComplete="new-password"
                        value={account.password}
                        onChange={(event) => updateAccount("password", event.target.value)}
                        className={`${inputClass} pr-11`}
                      />
                      <button
                        type="button"
                        aria-label={showPassword ? "Wachtwoord verbergen" : "Wachtwoord tonen"}
                        onClick={() => setShowPassword((value) => !value)}
                        className="absolute right-3 top-1/2 mt-0.5 -translate-y-1/2 rounded-lg p-1 text-slate-400 hover:text-slate-700"
                      >
                        {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                      </button>
                    </span>
                    <span className="mt-1.5 block font-medium text-slate-500">Minstens 12 tekens.</span>
                  </label>
                  <label className="text-xs font-bold text-slate-700">
                    Wachtwoord herhalen
                    <span className="relative block">
                      <input
                        type={showConfirmPassword ? "text" : "password"}
                        aria-label="Wachtwoord herhalen"
                        autoComplete="new-password"
                        value={account.confirmPassword}
                        onChange={(event) => updateAccount("confirmPassword", event.target.value)}
                        className={`${inputClass} pr-11`}
                      />
                      <button
                        type="button"
                        aria-label={showConfirmPassword ? "Herhaald wachtwoord verbergen" : "Herhaald wachtwoord tonen"}
                        onClick={() => setShowConfirmPassword((value) => !value)}
                        className="absolute right-3 top-1/2 mt-0.5 -translate-y-1/2 rounded-lg p-1 text-slate-400 hover:text-slate-700"
                      >
                        {showConfirmPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                      </button>
                    </span>
                  </label>
                  {pinLoginEnabled && (
                    <label className="text-xs font-bold text-slate-700 sm:col-span-2">
                      Kassa Snel-PIN (6 cijfers)
                      <input
                        type="password"
                        inputMode="numeric"
                        maxLength={6}
                        aria-label="Kassa Snel-PIN (6 cijfers)"
                        autoComplete="new-password"
                        value={account.pin}
                        onChange={(event) =>
                          updateAccount("pin", event.target.value.replace(/\D/g, "").slice(0, 6))
                        }
                        className={`${inputClass} max-w-xs text-center font-mono text-lg tracking-[0.35em]`}
                      />
                    </label>
                  )}
                </div>
              )}

              {currentStep === "store" && (
                <div className="grid gap-5 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <SelectField
                      id="onboarding-industry"
                      label="Welke zaak heeft u?"
                      value={configuration.industry}
                      options={RETAIL_INDUSTRIES}
                      onChange={chooseIndustry}
                      hint="We gebruiken dit alleen om relevante beginwaarden klaar te zetten. Elke module blijft beschikbaar."
                    />
                  </div>
                  <SelectField
                    id="onboarding-sales-model"
                    label="Hoe verkoopt u vandaag?"
                    value={configuration.salesModel}
                    options={SALES_MODELS}
                    onChange={(value) => updateConfiguration("salesModel", value)}
                  />
                  <SelectField
                    id="onboarding-team-size"
                    label="Hoe groot is uw team?"
                    value={configuration.teamSize}
                    options={TEAM_SIZES}
                    onChange={(value) => updateConfiguration("teamSize", value)}
                  />
                  <div className="sm:col-span-2 rounded-2xl border border-sky-100 bg-sky-50/80 p-4 text-sm leading-6 text-sky-950">
                    <div className="flex items-center gap-2 font-extrabold">
                      <Sparkles size={16} className="text-sky-600" /> Slim startpunt
                    </div>
                    <p className="mt-1 text-xs leading-5 text-sky-800">
                      Voor {labelFor(RETAIL_INDUSTRIES, configuration.industry).toLowerCase()} stellen we op de volgende stap een passende werkruimte voor. U houdt altijd het laatste woord.
                    </p>
                  </div>
                </div>
              )}

              {currentStep === "modules" && (
                <div>
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs font-bold text-slate-500">
                      {selectedModules.length} extra {selectedModules.length === 1 ? "werkstroom" : "werkstromen"} gekozen
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        updateConfiguration(
                          "modules",
                          recommendedModulesForIndustry(configuration.industry),
                        )
                      }
                      className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-extrabold text-sky-700 transition hover:bg-sky-50"
                    >
                      <RotateCcw size={14} /> Herstel aanbeveling
                    </button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-slate-950 bg-slate-950 p-4 text-white shadow-sm sm:col-span-2">
                      <div className="flex items-start gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10">
                          <Monitor size={19} />
                        </span>
                        <div>
                          <div className="flex items-center gap-2 text-sm font-extrabold">
                            Kassa & dagelijkse controle
                            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[9px] uppercase tracking-wider text-slate-300">Altijd actief</span>
                          </div>
                          <p className="mt-1 text-xs leading-5 text-slate-300">Verkoop, betalingen, historiek en dagafsluiting vormen de veilige basis.</p>
                        </div>
                      </div>
                    </div>
                    {MODULE_DETAILS.map((module) => {
                      const Icon = moduleIcons[module.key];
                      const checked = configuration.modules[module.key];
                      return (
                        <label
                          key={module.key}
                          className={`group cursor-pointer rounded-2xl border p-4 transition focus-within:ring-4 focus-within:ring-sky-100 ${
                            checked
                              ? "border-sky-300 bg-sky-50/70 shadow-sm"
                              : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleModule(module.key)}
                            className="sr-only"
                          />
                          <div className="flex items-start gap-3">
                            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${checked ? "bg-sky-600 text-white" : "bg-slate-100 text-slate-500"}`}>
                              <Icon size={18} />
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-sm font-extrabold text-slate-900">{module.title}</span>
                                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${checked ? "border-sky-600 bg-sky-600 text-white" : "border-slate-300 bg-white text-transparent"}`}>
                                  <Check size={14} />
                                </span>
                              </div>
                              <p className="mt-1 text-xs leading-5 text-slate-500">{module.description}</p>
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                  <p className="mt-4 text-xs leading-5 text-slate-500">
                    Modulevoorkeuren bepalen uw werkruimte. Functies die aan een abonnement gekoppeld zijn, blijven onder de bestaande planvoorwaarden vallen.
                  </p>
                </div>
              )}

              {currentStep === "data" && (
                <div className="grid gap-5 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <SelectField
                      id="onboarding-catalog-source"
                      label="Waar staan uw producten vandaag?"
                      value={configuration.catalogSource}
                      options={CATALOG_SOURCES}
                      onChange={(value) => {
                        updateConfiguration("catalogSource", value);
                        if (value !== "none") {
                          setConfiguration((current) => ({
                            ...current,
                            catalogSource: value,
                            modules: { ...current.modules, catalog: true },
                          }));
                        }
                      }}
                    />
                  </div>
                  {configuration.catalogSource !== "none" && (
                    <fieldset className="sm:col-span-2">
                      <legend className="text-xs font-bold text-slate-700">Wanneer wilt u importeren?</legend>
                      <div className="mt-2 grid gap-3 sm:grid-cols-2">
                        {[
                          ["now", "Meteen na aanmelden", "We openen de Integration Hub als eerste actie."],
                          ["later", "Later", "We starten in de kassa; import blijft klaarstaan."],
                        ].map(([value, title, description]) => (
                          <label key={value} className={`cursor-pointer rounded-2xl border p-4 ${configuration.importTiming === value ? "border-sky-300 bg-sky-50" : "border-slate-200"}`}>
                            <input
                              type="radio"
                              name="import-timing"
                              value={value}
                              checked={configuration.importTiming === value}
                              onChange={() => updateConfiguration("importTiming", value as "now" | "later")}
                              className="sr-only"
                            />
                            <span className="text-sm font-extrabold text-slate-900">{title}</span>
                            <span className="mt-1 block text-xs leading-5 text-slate-500">{description}</span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  )}
                  <SelectField
                    id="onboarding-pricing"
                    label="Hoe werkt uw prijsvoering?"
                    value={configuration.pricingModel}
                    options={PRICING_MODELS}
                    onChange={(value) => updateConfiguration("pricingModel", value)}
                  />
                  <SelectField
                    id="onboarding-vat"
                    label="Welke btw is uw veilige standaard?"
                    value={configuration.defaultVat}
                    options={VAT_DEFAULTS}
                    onChange={(value) => updateConfiguration("defaultVat", value)}
                    hint="Wordt alleen gebruikt wanneer een importbestand geen geldige btw bevat."
                  />
                  {configuration.modules.service && (
                    <div className="sm:col-span-2">
                      <SelectField
                        id="onboarding-service-contact"
                        label="Hoe volgt u herstelklanten het liefst op?"
                        value={configuration.serviceContactPreference}
                        options={SERVICE_CONTACT_OPTIONS}
                        onChange={(value) => updateConfiguration("serviceContactPreference", value)}
                      />
                    </div>
                  )}
                </div>
              )}

              {currentStep === "review" && (
                <div className="space-y-5">
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 sm:p-5">
                    <div className="flex items-start gap-3">
                      <CheckCircle2 size={21} className="mt-0.5 shrink-0 text-emerald-600" />
                      <div>
                        <h2 className="text-sm font-black text-emerald-950">Uw startconfiguratie is compleet</h2>
                        <p className="mt-1 text-xs leading-5 text-emerald-800">{recommendationCopy(configuration)}</p>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-2xl border border-slate-200 p-5">
                      <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-400">
                        <Store size={15} /> Winkelprofiel
                      </div>
                      <dl className="mt-4 space-y-3 text-sm">
                        <div className="flex justify-between gap-4"><dt className="text-slate-500">Sector</dt><dd className="text-right font-bold">{labelFor(RETAIL_INDUSTRIES, configuration.industry)}</dd></div>
                        <div className="flex justify-between gap-4"><dt className="text-slate-500">Verkoopmodel</dt><dd className="text-right font-bold">{labelFor(SALES_MODELS, configuration.salesModel)}</dd></div>
                        <div className="flex justify-between gap-4"><dt className="text-slate-500">Team</dt><dd className="text-right font-bold">{labelFor(TEAM_SIZES, configuration.teamSize)}</dd></div>
                      </dl>
                    </div>
                    <div className="rounded-2xl border border-slate-200 p-5">
                      <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-400">
                        <Boxes size={15} /> Data & prijzen
                      </div>
                      <dl className="mt-4 space-y-3 text-sm">
                        <div className="flex justify-between gap-4"><dt className="text-slate-500">Productbron</dt><dd className="text-right font-bold">{labelFor(CATALOG_SOURCES, configuration.catalogSource)}</dd></div>
                        <div className="flex justify-between gap-4"><dt className="text-slate-500">Prijsvoering</dt><dd className="text-right font-bold">{labelFor(PRICING_MODELS, configuration.pricingModel)}</dd></div>
                        <div className="flex justify-between gap-4"><dt className="text-slate-500">Btw-default</dt><dd className="text-right font-bold">{labelFor(VAT_DEFAULTS, configuration.defaultVat)}</dd></div>
                      </dl>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 p-5">
                    <p className="text-xs font-black uppercase tracking-wider text-slate-400">Uw werkruimte</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="rounded-full bg-slate-950 px-3 py-1.5 text-xs font-bold text-white">Kassa & controle</span>
                      {selectedModules.map((module) => (
                        <span key={module.key} className="rounded-full bg-sky-50 px-3 py-1.5 text-xs font-bold text-sky-800 ring-1 ring-sky-100">{module.title}</span>
                      ))}
                    </div>
                  </div>

                  <p className="text-xs leading-5 text-slate-500">
                    Door verder te gaan maakt PWAYMENT alleen de werkruimte klaar. Er worden nog geen producten gepubliceerd, berichten verstuurd of externe koppelingen geactiveerd.
                  </p>
                </div>
              )}
            </div>

            <footer className="flex flex-col-reverse gap-3 border-t border-slate-100 bg-slate-50/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8">
              <button
                type="button"
                onClick={stepIndex === 0 ? () => onExit() : previous}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold text-slate-600 transition hover:bg-white hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
              >
                <ArrowLeft size={16} /> {stepIndex === 0 ? (mode === "registration" ? "Naar inloggen" : "Annuleren") : "Vorige"}
              </button>
              {currentStep === "review" ? (
                <button
                  type="button"
                  onClick={() => void submit()}
                  disabled={isSubmitting}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-slate-950 px-6 text-sm font-extrabold text-white shadow-lg shadow-slate-950/15 transition hover:-translate-y-0.5 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 disabled:cursor-wait disabled:translate-y-0 disabled:opacity-60"
                >
                  {isSubmitting ? <LoaderCircle size={17} className="animate-spin" /> : <Check size={17} />}
                  {mode === "registration" ? "Account aanmaken en starten" : "Configuratie bewaren"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={next}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-slate-950 px-6 text-sm font-extrabold text-white shadow-lg shadow-slate-950/15 transition hover:-translate-y-0.5 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
                >
                  Verder <ArrowRight size={17} />
                </button>
              )}
            </footer>
          </div>
        </section>
      </main>
    </div>
  );
};
