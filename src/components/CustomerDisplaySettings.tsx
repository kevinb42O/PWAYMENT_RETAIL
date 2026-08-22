import { useMemo, useState } from "react";
import {
  Check,
  ExternalLink,
  Info,
  Monitor,
  Palette,
  Power,
  RotateCcw,
  Settings2,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useAuth } from "../auth/useAuth";
import {
  ACCEPTED_PAYMENT_METHOD_LABELS,
  acceptedPaymentMethodIds,
  type AcceptedPaymentMethodId,
} from "../customer-display/protocol";
import { openLocalCustomerDisplay } from "../customer-display/localSession";
import {
  customerDisplayStoreKey,
  DEFAULT_CUSTOMER_DISPLAY_CONFIG,
  useCustomerDisplaySettings,
} from "../customer-display/settings";
import { useCustomerDisplayRuntime } from "../customer-display/runtime";
import { createAccessibleCustomerDisplayTheme } from "../customer-display/theme";

const statusPresentation = {
  disconnected: {
    label: "Niet geopend",
    className: "border-slate-200 bg-slate-100 text-slate-600",
    Icon: WifiOff,
  },
  connecting: {
    label: "Verbinden…",
    className: "border-amber-200 bg-amber-50 text-amber-800",
    Icon: Wifi,
  },
  connected: {
    label: "Live verbonden",
    className: "border-emerald-200 bg-emerald-50 text-emerald-800",
    Icon: Wifi,
  },
  stale: {
    label: "Verbinding vertraagd",
    className: "border-red-200 bg-red-50 text-red-700",
    Icon: WifiOff,
  },
} as const;

const Toggle = ({
  checked,
  onChange,
  label,
  description,
  disabled = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description: string;
  disabled?: boolean;
}) => (
  <div className="flex items-start justify-between gap-5 rounded-2xl border border-slate-200 bg-white p-4">
    <div>
      <div className="text-xs font-extrabold text-slate-900">{label}</div>
      <p className="mt-1 max-w-md text-[11px] leading-5 text-slate-500">
        {description}
      </p>
    </div>
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative mt-0.5 h-7 w-12 shrink-0 rounded-full transition-colors ${
        checked ? "bg-slate-900" : "bg-slate-300"
      } disabled:cursor-not-allowed disabled:opacity-50`}
    >
      <span
        className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  </div>
);

export const CustomerDisplaySettings = () => {
  const storeId = useAuth((state) => state.currentStoreId);
  const storeName = useAuth((state) => state.currentStoreName);
  const currentRole = useAuth((state) => state.currentRole);
  const canManage = currentRole === "owner";
  const key = customerDisplayStoreKey(storeId);
  const config = useCustomerDisplaySettings(
    (state) => state.configsByStore[key] ?? DEFAULT_CUSTOMER_DISPLAY_CONFIG,
  );
  const updateConfig = useCustomerDisplaySettings(
    (state) => state.updateConfig,
  );
  const resetConfig = useCustomerDisplaySettings(
    (state) => state.resetConfig,
  );
  const connectionStatus = useCustomerDisplayRuntime(
    (state) => state.connectionStatus,
  );
  const lastAckAt = useCustomerDisplayRuntime((state) => state.lastAckAt);
  const viewport = useCustomerDisplayRuntime((state) => state.viewport);
  const [launchMessage, setLaunchMessage] = useState<string | null>(null);
  const status = statusPresentation[connectionStatus];
  const accessibleTheme = useMemo(
    () => createAccessibleCustomerDisplayTheme(config.accentColor),
    [config.accentColor],
  );

  const lastSeenLabel = useMemo(() => {
    if (!lastAckAt) return null;
    return new Intl.DateTimeFormat("nl-BE", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(new Date(lastAckAt));
  }, [lastAckAt]);

  const set = <K extends keyof typeof config>(
    property: K,
    value: (typeof config)[K],
  ) => updateConfig(storeId, { [property]: value });

  const togglePaymentMethod = (method: AcceptedPaymentMethodId) => {
    const next = config.acceptedPaymentMethods.includes(method)
      ? config.acceptedPaymentMethods.filter((candidate) => candidate !== method)
      : [...config.acceptedPaymentMethods, method];
    set("acceptedPaymentMethods", next);
  };

  const launchDisplay = () => {
    setLaunchMessage(null);
    const opened = openLocalCustomerDisplay();
    if (!opened) {
      setLaunchMessage(
        "De browser heeft het venster geblokkeerd. Sta pop-ups toe voor PWAYMENT en probeer opnieuw.",
      );
      return;
    }
    opened.focus();
    setLaunchMessage(
      "Klantenscherm geopend. Sleep het venster naar het HDMI-scherm en kies daar Volledig scherm.",
    );
  };

  return (
    <div className="space-y-7">
      <section
        className={`overflow-hidden rounded-3xl border ${
          config.enabled
            ? "border-cyan-200 bg-gradient-to-br from-cyan-50 via-white to-slate-50"
            : "border-slate-200 bg-slate-50"
        }`}
      >
        <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between md:p-6">
          <div className="flex items-start gap-4">
            <div
              className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${
                config.enabled
                  ? "bg-cyan-600 text-white shadow-lg shadow-cyan-900/15"
                  : "bg-white text-slate-500 ring-1 ring-slate-200"
              }`}
            >
              <Monitor size={24} />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-black text-slate-950">
                  Klantenscherm
                </h3>
                <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-slate-500">
                  Optionele module
                </span>
              </div>
              <p className="mt-1 max-w-2xl text-xs font-medium leading-5 text-slate-600">
                Toon producten, prijzen, kortingen, totaal en betaalstatus op een
                tweede scherm. Wanneer de kassa idle is, verschijnt uw eigen
                welkomstboodschap.
              </p>
            </div>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={config.enabled}
            aria-label="Klantenscherm inschakelen"
            disabled={!canManage}
            onClick={() => set("enabled", !config.enabled)}
            className={`flex min-w-44 items-center justify-center gap-2 rounded-xl px-4 py-3 text-xs font-black transition-colors ${
              config.enabled
                ? "bg-slate-950 text-white hover:bg-black"
                : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
            } disabled:cursor-not-allowed disabled:opacity-60`}
          >
            <Power size={17} />
            {config.enabled ? "Module ingeschakeld" : "Module inschakelen"}
          </button>
        </div>

        <div className="grid gap-3 border-t border-slate-200/80 bg-white/70 p-5 sm:grid-cols-[1fr_auto] sm:items-center md:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-extrabold ${status.className}`}
            >
              <status.Icon size={13} /> {status.label}
            </span>
            {viewport && connectionStatus === "connected" && (
              <span className="text-[10px] font-bold text-slate-500">
                {viewport.width} × {viewport.height}
              </span>
            )}
            {lastSeenLabel && (
              <span className="text-[10px] font-medium text-slate-400">
                Laatste bevestiging {lastSeenLabel}
              </span>
            )}
          </div>
          <button
            type="button"
            disabled={!config.enabled}
            onClick={launchDisplay}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-600 px-4 py-2.5 text-xs font-black text-white shadow-sm transition-colors hover:bg-cyan-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            <ExternalLink size={16} /> Open lokaal klantenscherm
          </button>
        </div>
      </section>

      {launchMessage && (
        <div className="flex items-start gap-2 rounded-xl border border-cyan-200 bg-cyan-50 p-3 text-xs font-semibold leading-5 text-cyan-950">
          <Info size={16} className="mt-0.5 shrink-0 text-cyan-700" />
          {launchMessage}
        </div>
      )}

      {!canManage && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold leading-5 text-amber-950">
          <Info size={16} className="mt-0.5 shrink-0 text-amber-700" />
          Alleen de eigenaar kan deze optionele module activeren en
          configureren. Een manager kan een reeds geactiveerd lokaal
          klantenscherm wel openen bij de start van de winkeldag.
        </div>
      )}

      <div className={`space-y-7 ${config.enabled ? "" : "opacity-55"}`}>
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Palette size={17} className="text-slate-500" />
            <div>
              <h4 className="text-xs font-black text-slate-900">
                Idle scherm & uitstraling
              </h4>
              <p className="mt-0.5 text-[11px] text-slate-500">
                Dit ziet de klant wanneer er geen transactie bezig is.
              </p>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.8fr)]">
            <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <label className="block">
                <span className="text-[11px] font-extrabold text-slate-700">
                  Hoofdboodschap
                </span>
                <input
                  disabled={!config.enabled || !canManage}
                  maxLength={120}
                  value={config.idleHeadline}
                  onChange={(event) => set("idleHeadline", event.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-bold text-slate-900 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/15 disabled:cursor-not-allowed"
                  placeholder="Welkom"
                />
              </label>
              <label className="block">
                <span className="text-[11px] font-extrabold text-slate-700">
                  Ondersteunende tekst
                </span>
                <textarea
                  disabled={!config.enabled || !canManage}
                  maxLength={240}
                  rows={3}
                  value={config.idleMessage}
                  onChange={(event) => set("idleMessage", event.target.value)}
                  className="mt-1.5 w-full resize-none rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs font-medium leading-5 text-slate-900 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/15 disabled:cursor-not-allowed"
                  placeholder="We helpen je zo verder."
                />
              </label>
              <label className="block">
                <span className="text-[11px] font-extrabold text-slate-700">
                  Winkellogo
                </span>
                <span className="mt-0.5 block text-[10px] text-slate-500">
                  Optionele HTTPS-afbeelding. Bij een fout blijft de winkelnaam zichtbaar.
                </span>
                <input
                  type="url"
                  inputMode="url"
                  disabled={!config.enabled || !canManage}
                  maxLength={500}
                  value={config.logoUrl ?? ""}
                  onChange={(event) => set("logoUrl", event.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs font-medium text-slate-900 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/15 disabled:cursor-not-allowed"
                  placeholder="https://uw-winkel.be/logo.png"
                />
              </label>
              <label className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-3">
                <div>
                  <span className="block text-[11px] font-extrabold text-slate-700">
                    Accentkleur
                  </span>
                  <span className="text-[10px] text-slate-500">
                    Gebruikt voor totaal, highlights en idle visuals.
                  </span>
                </div>
                <input
                  type="color"
                  disabled={!config.enabled || !canManage}
                  value={config.accentColor}
                  onChange={(event) => set("accentColor", event.target.value)}
                  className="h-10 w-14 cursor-pointer rounded-lg border border-slate-300 bg-white p-1 disabled:cursor-not-allowed"
                  aria-label="Accentkleur klantenscherm"
                />
              </label>
              {accessibleTheme.adjustedForContrast && (
                <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[10px] font-semibold leading-4 text-amber-950">
                  <Info size={14} className="mt-0.5 shrink-0" />
                  De gekozen kleur is te licht voor bedragen en labels. Het
                  klantenscherm gebruikt daar automatisch een donkerdere,
                  leesbare variant ({accessibleTheme.accentText}).
                </div>
              )}
            </div>

            <div
              className="relative flex aspect-video min-h-52 overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 p-5 text-white shadow-xl"
              style={{
                background: `radial-gradient(circle at 80% 20%, ${config.accentColor}55, transparent 35%), #0f172a`,
                color: accessibleTheme.onAccent,
              }}
              aria-label="Voorbeeld idle klantenscherm"
            >
              <div className="relative z-10 flex w-full flex-col">
                <div className="flex items-center justify-between text-[9px] font-bold text-slate-300">
                  <span>{storeName || "Uw winkel"}</span>
                  {config.showClock && <span>14:32</span>}
                </div>
                <div className="my-auto max-w-[75%]">
                  <span className="text-[8px] font-black uppercase tracking-[0.18em] text-cyan-300">
                    Fijn dat je er bent
                  </span>
                  <div className="mt-2 text-2xl font-black leading-none tracking-tight">
                    {config.idleHeadline || "Welkom"}
                  </div>
                  <p className="mt-2 text-[10px] leading-4 text-slate-300">
                    {config.idleMessage || "We helpen je zo verder."}
                  </p>
                </div>
                {config.showPaymentMethods && (
                  <div className="flex flex-wrap gap-1 border-t border-white/10 pt-2">
                    {config.acceptedPaymentMethods.slice(0, 4).map((method) => (
                      <span
                        key={method}
                        className="rounded-full bg-white/10 px-2 py-1 text-[7px] font-bold"
                      >
                        {ACCEPTED_PAYMENT_METHOD_LABELS[method]}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Settings2 size={17} className="text-slate-500" />
            <div>
              <h4 className="text-xs font-black text-slate-900">
                Transactiepresentatie
              </h4>
              <p className="mt-0.5 text-[11px] text-slate-500">
                Financiële bedragen blijven altijd afkomstig van dezelfde
                kassaberekening.
              </p>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Toggle
              checked={config.showClock}
              onChange={(value) => set("showClock", value)}
              disabled={!canManage}
              label="Klok tonen"
              description="Toon de lokale tijd rechtsboven op idle- en transactieschermen."
            />
            <Toggle
              checked={config.showVatBreakdown}
              onChange={(value) => set("showVatBreakdown", value)}
              disabled={!canManage}
              label="Btw-detail tonen"
              description="Toon de aanwezige btw-bedragen als secundair detail naast het totaal inclusief btw."
            />
            <Toggle
              checked={config.showPaymentMethods}
              onChange={(value) => set("showPaymentMethods", value)}
              disabled={!canManage}
              label="Betaalmethodes tonen"
              description="Plaats een vaste strook met de door u bevestigde betaalmogelijkheden onderaan."
            />
            <label className="rounded-2xl border border-slate-200 bg-white p-4">
              <span className="block text-xs font-extrabold text-slate-900">
                Bedankscherm zichtbaar
              </span>
              <p className="mt-1 text-[11px] leading-5 text-slate-500">
                Na een geslaagde betaling, vóór het scherm terug naar idle gaat.
              </p>
              <select
                disabled={!config.enabled || !canManage}
                value={config.thankYouDurationSeconds}
                onChange={(event) =>
                  set("thankYouDurationSeconds", Number(event.target.value))
                }
                className="mt-3 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-800 outline-none disabled:cursor-not-allowed"
              >
                {[6, 8, 10, 12, 15].map((seconds) => (
                  <option key={seconds} value={seconds}>
                    {seconds} seconden
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <section className="space-y-4">
          <div>
            <h4 className="text-xs font-black text-slate-900">
              Aanvaarde betaalmethodes
            </h4>
            <p className="mt-1 text-[11px] leading-5 text-slate-500">
              Selecteer alleen methodes die deze winkel werkelijk accepteert.
              Een terminalprovider kiezen activeert deze logo's niet automatisch.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {acceptedPaymentMethodIds.map((method) => {
              const checked = config.acceptedPaymentMethods.includes(method);
              return (
                <button
                  key={method}
                  type="button"
                  disabled={!config.enabled || !config.showPaymentMethods || !canManage}
                  onClick={() => togglePaymentMethod(method)}
                  aria-pressed={checked}
                  className={`flex items-center justify-between gap-3 rounded-xl border p-3 text-left text-xs font-extrabold transition-colors disabled:cursor-not-allowed ${
                    checked
                      ? "border-cyan-300 bg-cyan-50 text-cyan-950"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {ACCEPTED_PAYMENT_METHOD_LABELS[method]}
                  <span
                    className={`grid h-5 w-5 place-items-center rounded-md ${
                      checked
                        ? "bg-cyan-600 text-white"
                        : "border border-slate-300 bg-white"
                    }`}
                  >
                    {checked && <Check size={13} />}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      </div>

      <div className="flex flex-col gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2 text-[10px] leading-4 text-slate-500">
          <Info size={14} className="mt-0.5 shrink-0" />
          <span>
            Deze eerste lokale module bewaart de keuze per winkel in dit
            browserprofiel. Het klantenscherm ontvangt nooit kostprijzen,
            voorraad, klantgegevens of interne notities.
          </span>
        </div>
        <button
          type="button"
          disabled={!canManage}
          onClick={() => resetConfig(storeId)}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-[11px] font-extrabold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RotateCcw size={14} /> Herstel standaardinstellingen
        </button>
      </div>
    </div>
  );
};
