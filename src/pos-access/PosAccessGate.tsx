import { Check, KeyRound, LockKeyhole, LogOut, ShieldCheck, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "../auth/useAuth";
import { LoadingExperience } from "../components/LoadingExperience";
import { getLoadingProgress } from "../services/loadingProgress";
import { PinKeypad } from "./PinKeypad";
import { usePosAccess } from "./usePosAccess";
import { posPinPolicyError } from "./pinPolicy";

const Brand = () => (
  <div className="pos-access-brand inline-flex items-center gap-3" aria-label="PWAYMENT">
    <span className="pace-boot-mark h-9 w-9" aria-hidden="true" />
    <span className="text-lg font-extrabold tracking-[-0.04em] text-slate-950">PWAYMENT</span>
  </div>
);

const surfaceClass = "pos-access-surface w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_20px_55px_-36px_rgba(15,23,42,0.38)]";
const inputClass = "pos-access-input mt-2 h-11 w-full rounded-lg border border-slate-300 bg-white px-3.5 text-sm font-semibold text-slate-900 outline-none transition focus:border-cyan-700 focus:ring-3 focus:ring-cyan-100";
const pinInputClass = `${inputClass} text-center text-lg tracking-[0.32em] tabular-nums`;

const Shell = ({ children }: { children: React.ReactNode }) => (
  <div className="pos-access-shell min-h-dvh bg-slate-50 text-slate-950">
    <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5 sm:px-8 sm:py-6">
      <Brand />
      <span className="hidden items-center gap-2 text-xs font-semibold text-slate-500 sm:inline-flex">
        <ShieldCheck size={15} className="text-cyan-800" /> Beveiligde kassatoegang
      </span>
    </header>
    <main className="mx-auto flex w-full max-w-6xl items-center justify-center px-4 pb-12 pt-3 sm:px-8 sm:pb-16 sm:pt-6">
      {children}
    </main>
  </div>
);

const PinChange = () => {
  const changePin = usePosAccess((state) => state.changePin);
  const error = usePosAccess((state) => state.error);
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const policyError = posPinPolicyError(pin);
    if (policyError) return setLocalError(policyError);
    if (pin !== confirm) return setLocalError("De twee PIN-codes zijn niet gelijk.");
    await changePin(pin);
  };
  return (
    <section className={`${surfaceClass} max-w-lg`}>
      <header className="px-6 py-6 sm:px-8">
        <div className="flex items-start gap-3.5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-50 text-cyan-800"><KeyRound size={19} /></span>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-950">Nieuwe PIN instellen</h1>
            <p className="mt-1 text-sm leading-5 text-slate-500">Vervang de tijdelijke code door je persoonlijke kassacode.</p>
          </div>
        </div>
      </header>
      <form onSubmit={submit} className="pos-access-inset space-y-5 border-t border-slate-200 bg-slate-50/60 px-6 py-6 sm:px-8">
        {(localError || error) && <p className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-3 text-sm font-semibold text-rose-800" role="alert">{localError || error}</p>}
        <fieldset>
          <legend className="text-sm font-semibold text-slate-800">Persoonlijke PIN</legend>
          <p className="mt-1 text-xs leading-5 text-slate-500">Kies een unieke code van 6 cijfers die alleen jij gebruikt.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block text-xs font-semibold text-slate-700">Nieuwe PIN
              <input aria-label="Nieuwe persoonlijke PIN" type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} value={pin} onChange={(event) => { setPin(event.target.value.replace(/\D/g, "")); setLocalError(null); }} className={pinInputClass} />
            </label>
            <label className="block text-xs font-semibold text-slate-700">Bevestiging
              <input aria-label="Bevestig nieuwe persoonlijke PIN" type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} value={confirm} onChange={(event) => { setConfirm(event.target.value.replace(/\D/g, "")); setLocalError(null); }} className={pinInputClass} />
            </label>
          </div>
        </fieldset>
        <button type="submit" disabled={pin.length !== 6 || confirm.length !== 6} className="pos-access-primary-action flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-cyan-800 px-4 text-sm font-semibold text-white transition hover:bg-cyan-900 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-cyan-200 disabled:cursor-not-allowed disabled:bg-slate-300"><Check size={16} /> PIN opslaan</button>
      </form>
    </section>
  );
};

export const PosAccessGate = () => {
  const currentStoreId = useAuth((state) => state.currentStoreId);
  const currentStoreName = useAuth((state) => state.currentStoreName);
  const accountRole = useAuth((state) => state.accountRole);
  const logout = useAuth((state) => state.logout);
  const status = usePosAccess((state) => state.status);
  const device = usePosAccess((state) => state.device);
  const error = usePosAccess((state) => state.error);
  const initialize = usePosAccess((state) => state.initialize);
  const setupOwner = usePosAccess((state) => state.setupOwner);
  const unlock = usePosAccess((state) => state.unlock);
  const clearError = usePosAccess((state) => state.clearError);
  const [pin, setPin] = useState("");
  const [setupPin, setSetupPin] = useState("");
  const [setupConfirm, setSetupConfirm] = useState("");
  const [deviceName, setDeviceName] = useState(() => `Kassa ${navigator.platform?.includes("iPad") ? "iPad" : "toestel"}`);
  const [setupError, setSetupError] = useState<string | null>(null);

  useEffect(() => { void initialize(currentStoreId); }, [currentStoreId, initialize]);

  if (status === "loading" || status === "idle") return <LoadingExperience progress={getLoadingProgress()} />;
  if (status === "pin-change-required") return <Shell><PinChange /></Shell>;

  if (status === "setup-required") {
    const submitSetup = async (event: React.FormEvent) => {
      event.preventDefault();
      setSetupError(null);
      if (accountRole !== "owner") return setSetupError("Alleen de eigenaar kan deze kassa activeren.");
      const policyError = posPinPolicyError(setupPin);
      if (policyError) return setSetupError(policyError);
      if (setupPin !== setupConfirm) return setSetupError("De twee PIN-codes zijn niet gelijk.");
      if (!deviceName.trim()) return setSetupError("Geef deze kassa een herkenbare naam.");
      await setupOwner(setupPin, deviceName);
      setSetupPin(""); setSetupConfirm("");
    };
    return <Shell>
      <section className={`${surfaceClass} max-w-xl`}>
        <header className="px-6 py-6 sm:px-8 sm:py-7">
          <div className="flex items-start gap-3.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-50 text-cyan-800"><LockKeyhole size={19} /></span>
            <div>
              <p className="text-xs font-semibold text-cyan-800">Toestelconfiguratie</p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">Kassa activeren</h1>
            </div>
          </div>
          <p className="mt-4 max-w-lg text-sm leading-6 text-slate-600">Koppel dit toestel aan {currentStoreName ?? "je winkel"}. Op een eerste toestel stel je de eigenaarspincode in; op een extra toestel bevestig je de bestaande code.</p>
        </header>
        <form onSubmit={submitSetup} className="pos-access-inset space-y-5 border-t border-slate-200 bg-slate-50/60 px-6 py-6 sm:px-8">
          {(setupError || error) && <p className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-3 text-sm font-semibold text-rose-800" role="alert">{setupError || error}</p>}
          <label className="block text-xs font-semibold text-slate-700">Toestelnaam
            <input aria-label="Toestelnaam" value={deviceName} onChange={(event) => setDeviceName(event.target.value)} maxLength={120} className={inputClass} />
          </label>
          <fieldset>
            <legend className="text-sm font-semibold text-slate-800">Eigenaarspincode</legend>
            <p className="mt-1 text-xs leading-5 text-slate-500">Persoonlijke code van 6 cijfers. Gebruik geen eenvoudige reeks of herhaling.</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block text-xs font-semibold text-slate-700">PIN
                <input aria-label="Eigenaarspincode" type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} value={setupPin} onChange={(event) => { setSetupPin(event.target.value.replace(/\D/g, "")); setSetupError(null); if (error) clearError(); }} className={pinInputClass} />
              </label>
              <label className="block text-xs font-semibold text-slate-700">Bevestiging
                <input aria-label="Bevestig eigenaarspincode" type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} value={setupConfirm} onChange={(event) => { setSetupConfirm(event.target.value.replace(/\D/g, "")); setSetupError(null); if (error) clearError(); }} className={pinInputClass} />
              </label>
            </div>
          </fieldset>
          <button type="submit" disabled={setupPin.length !== 6 || setupConfirm.length !== 6} className="pos-access-primary-action flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-cyan-800 px-4 text-sm font-semibold text-white transition hover:bg-cyan-900 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-cyan-200 disabled:cursor-not-allowed disabled:bg-slate-300"><ShieldCheck size={16} /> Toestel activeren</button>
        </form>
        <footer className="border-t border-slate-200 px-6 py-4 sm:px-8">
          <button type="button" onClick={() => void logout()} className="flex min-h-9 items-center gap-2 rounded-md px-1 text-xs font-semibold text-slate-500 transition hover:text-slate-900"><LogOut size={14} /> Afmelden en ander account gebruiken</button>
        </footer>
      </section>
    </Shell>;
  }

  return <Shell>
    <section className={`${surfaceClass} max-w-[460px]`}>
      <header className="border-b border-slate-200 px-6 py-6 text-center sm:px-8">
        <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-50 text-cyan-800"><LockKeyhole size={19} /></span>
        <p className="mt-4 text-xs font-semibold text-cyan-800">{currentStoreName ?? "PWAYMENT kassa"}</p>
        <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-slate-950">Aanmelden op de kassa</h1>
        <p className="mt-2 text-sm leading-5 text-slate-500">Gebruik je persoonlijke PIN om je kassasessie te starten.</p>
        {device?.name && <p className="mt-2 text-xs font-medium text-slate-400">{device.name}</p>}
      </header>
      <div className="px-6 py-6 sm:px-8">
        {status === "device-revoked" && <p className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-3 text-sm font-semibold text-rose-800" role="alert">{error ?? "Deze kassa is ingetrokken. Neem contact op met de eigenaar."}</p>}
        {error && status !== "device-revoked" && <p className="mb-5 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-3 text-center text-sm font-semibold text-rose-800" role="alert">{error}</p>}
        {status !== "device-revoked" && <PinKeypad value={pin} onChange={(value) => { setPin(value); if (error) clearError(); }} onComplete={(completePin) => { setPin(""); void unlock(completePin); }} disabled={status === "verifying"} error={error} />}
      </div>
      <footer className="border-t border-slate-200 px-6 py-4 sm:px-8">
        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[11px] font-medium text-slate-400">
        {!navigator.onLine && <span className="inline-flex items-center gap-1.5 text-amber-700"><WifiOff size={13} /> Offline — veilige toegang kan beperkt zijn</span>}
        <span>Touch · toetsenbord · numeriek keypad</span>
        </div>
        <button type="button" onClick={() => void logout()} className="mx-auto mt-2 flex min-h-9 items-center gap-2 rounded-md px-2 text-[11px] font-semibold text-slate-500 transition hover:bg-slate-50 hover:text-slate-800"><LogOut size={13} /> Account- en toestelbeheer</button>
      </footer>
    </section>
  </Shell>;
};
