import { Check, KeyRound, LockKeyhole, LogOut, ShieldCheck, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "../auth/useAuth";
import { LoadingExperience } from "../components/LoadingExperience";
import { getLoadingProgress } from "../services/loadingProgress";
import { PinKeypad } from "./PinKeypad";
import { usePosAccess } from "./usePosAccess";
import { posPinPolicyError } from "./pinPolicy";

const Brand = () => (
  <div className="inline-flex items-center gap-3" aria-label="PWAYMENT">
    <span className="pace-boot-mark h-10 w-10" aria-hidden="true" />
    <span className="text-xl font-black tracking-[-0.05em] text-slate-950">PWAYMENT</span>
  </div>
);

const Shell = ({ children }: { children: React.ReactNode }) => (
  <div className="pos-access-light relative min-h-dvh overflow-hidden bg-[#f5f8fa] text-slate-950" style={{ colorScheme: "light" }}>
    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_-10%,rgba(6,182,212,0.12),transparent_42%)]" aria-hidden="true" />
    <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5 sm:px-8 sm:py-7">
      <Brand />
      <span className="hidden items-center gap-2 rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-[11px] font-extrabold text-emerald-700 shadow-sm sm:inline-flex">
        <ShieldCheck size={14} /> Beveiligde kassatoegang
      </span>
    </header>
    <main className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-center px-4 pb-10 pt-2 sm:px-8 sm:pb-14">
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
    <section className="w-full max-w-lg rounded-[2rem] border border-white bg-white/95 p-6 shadow-[0_28px_80px_-40px_rgba(15,23,42,0.35)] sm:p-9">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-100 bg-cyan-50 text-cyan-800"><KeyRound size={22} /></div>
      <h1 className="mt-5 text-2xl font-black tracking-tight">Kies je persoonlijke PIN</h1>
      <p className="mt-2 text-sm leading-6 text-slate-500">De tijdelijke code was eenmalig. Stel nu een geheime PIN in die alleen jij kent.</p>
      {(localError || error) && <p className="mt-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-800" role="alert">{localError || error}</p>}
      <form onSubmit={submit} className="mt-6 space-y-4">
        <label className="block text-xs font-extrabold text-slate-700">Nieuwe PIN
          <input type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} value={pin} onChange={(event) => { setPin(event.target.value.replace(/\D/g, "")); setLocalError(null); }} className="mt-2 h-12 w-full rounded-xl border border-slate-200 px-4 text-center text-lg font-black tracking-[0.4em] outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100" />
        </label>
        <label className="block text-xs font-extrabold text-slate-700">Herhaal PIN
          <input type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} value={confirm} onChange={(event) => { setConfirm(event.target.value.replace(/\D/g, "")); setLocalError(null); }} className="mt-2 h-12 w-full rounded-xl border border-slate-200 px-4 text-center text-lg font-black tracking-[0.4em] outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100" />
        </label>
        <button type="submit" disabled={pin.length !== 6 || confirm.length !== 6} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-cyan-800 text-sm font-extrabold text-white hover:bg-cyan-900 disabled:opacity-45"><Check size={17} /> PIN instellen en opnieuw aanmelden</button>
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
      <section className="w-full max-w-xl rounded-[2rem] border border-white bg-white/95 p-6 shadow-[0_28px_80px_-40px_rgba(15,23,42,0.35)] sm:p-9">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-100 bg-cyan-50 text-cyan-800"><LockKeyhole size={22} /></div>
        <p className="mt-5 text-[10px] font-black uppercase tracking-[0.18em] text-cyan-700">Veilige toestelkoppeling</p>
        <h1 className="mt-2 text-2xl font-black tracking-tight">Koppel deze kassa met je owner-PIN</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">Voor een nieuwe winkel wordt hiermee de eerste owner-PIN ingesteld. Bij extra of herstelde toestellen moet de bestaande owner-PIN worden bevestigd.</p>
        {(setupError || error) && <p className="mt-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-800" role="alert">{setupError || error}</p>}
        <form onSubmit={submitSetup} className="mt-6 space-y-4">
          <label className="block text-xs font-extrabold text-slate-700">Naam van dit toestel
            <input value={deviceName} onChange={(event) => setDeviceName(event.target.value)} maxLength={120} className="mt-2 h-12 w-full rounded-xl border border-slate-200 px-4 text-sm font-bold outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100" />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-xs font-extrabold text-slate-700">Persoonlijke owner-PIN
              <input type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} value={setupPin} onChange={(event) => setSetupPin(event.target.value.replace(/\D/g, ""))} className="mt-2 h-12 w-full rounded-xl border border-slate-200 px-4 text-center text-lg font-black tracking-[0.35em] outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100" />
            </label>
            <label className="block text-xs font-extrabold text-slate-700">Herhaal PIN
              <input type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} value={setupConfirm} onChange={(event) => setSetupConfirm(event.target.value.replace(/\D/g, ""))} className="mt-2 h-12 w-full rounded-xl border border-slate-200 px-4 text-center text-lg font-black tracking-[0.35em] outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100" />
            </label>
          </div>
          <button type="submit" disabled={setupPin.length !== 6 || setupConfirm.length !== 6} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-cyan-800 text-sm font-extrabold text-white shadow-sm hover:bg-cyan-900 disabled:opacity-45"><ShieldCheck size={17} /> Kassa veilig activeren</button>
        </form>
        <button type="button" onClick={() => void logout()} className="mt-5 flex min-h-10 items-center gap-2 text-xs font-bold text-slate-500 hover:text-slate-900"><LogOut size={14} /> Ander account gebruiken</button>
      </section>
    </Shell>;
  }

  return <Shell>
    <section className="w-full max-w-[500px] rounded-[2rem] border border-white bg-white/95 p-6 shadow-[0_28px_80px_-40px_rgba(15,23,42,0.35)] backdrop-blur sm:p-9">
      <div className="text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-100 bg-cyan-50 text-cyan-800"><LockKeyhole size={22} /></span>
        <p className="mt-5 text-[10px] font-black uppercase tracking-[0.18em] text-cyan-700">{currentStoreName ?? "PWAYMENT kassa"}</p>
        <h1 className="mt-2 text-3xl font-black tracking-[-0.04em]">Voer je PIN in</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">Je persoonlijke code bepaalt automatisch wie deze kassa opent.</p>
        {device?.name && <p className="mt-2 text-[11px] font-bold text-slate-400">{device.name}</p>}
      </div>
      {status === "device-revoked" && <p className="mt-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-800" role="alert">{error ?? "Deze kassa is ingetrokken. Neem contact op met de eigenaar."}</p>}
      {error && status !== "device-revoked" && <p className="mt-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-center text-sm font-bold text-rose-800" role="alert">{error}</p>}
      {status !== "device-revoked" && <div className="mt-7"><PinKeypad value={pin} onChange={(value) => { setPin(value); if (error) clearError(); }} onComplete={(completePin) => { setPin(""); void unlock(completePin); }} disabled={status === "verifying"} error={error} /></div>}
      <div className="mt-7 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 border-t border-slate-100 pt-5 text-[11px] font-bold text-slate-400">
        {!navigator.onLine && <span className="inline-flex items-center gap-1.5 text-amber-700"><WifiOff size={13} /> Offline — veilige toegang kan beperkt zijn</span>}
        <span>Touch · toetsenbord · numeriek keypad</span>
      </div>
      <button type="button" onClick={() => void logout()} className="mx-auto mt-3 flex min-h-9 items-center gap-2 rounded-lg px-2 text-[11px] font-bold text-slate-400 hover:bg-slate-50 hover:text-slate-700"><LogOut size={13} /> Account- en toestelbeheer</button>
    </section>
  </Shell>;
};
