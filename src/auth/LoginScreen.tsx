import React, { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Crown, Eye, EyeOff, KeyRound, LoaderCircle, LockKeyhole, ShieldCheck, User as UserIcon } from "lucide-react";
import { useAuth } from "./useAuth";
import { db } from "../db/db";
import type { Role, User } from "../types";
import { supabase } from "../lib/supabase";
import { OnboardingWizard } from "../onboarding/OnboardingWizard";
import { LoadingExperience } from "../components/LoadingExperience";
import { getLoadingProgress, reportLoadingProgress, subscribeLoadingProgress } from "../services/loadingProgress";

const roleLabel: Record<Role, string> = { owner: "Eigenaar", manager: "Manager", cashier: "Kassamedewerker" };

const RoleIcon = ({ role }: { role: Role }) => {
  if (role === "owner") return <Crown size={15} className="text-amber-600" />;
  if (role === "manager") return <ShieldCheck size={15} className="text-indigo-600" />;
  return <UserIcon size={15} className="text-slate-500" />;
};

const BrandLockup = () => (
  <a href="/" className="inline-flex items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-4" aria-label="PWAYMENT website">
    <span className="pace-boot-mark h-9 w-9" aria-hidden="true" />
    <span className="text-lg font-black tracking-[-0.045em] text-slate-950">PWAYMENT</span>
  </a>
);

export const LoginScreen: React.FC = () => {
  const { loginWithEmail, login: loginWithPin } = useAuth();
  const [mode, setMode] = useState<"login" | "register">(() => window.location.pathname.startsWith("/register") ? "register" : "login");
  const [showPinDrawer, setShowPinDrawer] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [staffUsers, setStaffUsers] = useState<User[]>([]);
  const [selectedStaff, setSelectedStaff] = useState<User | null>(null);
  const [enteredPin, setEnteredPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(getLoadingProgress);
  const pinLoginEnabled = import.meta.env.DEV || import.meta.env.VITE_PRESENTATION_BUILD === "true" || import.meta.env.VITE_E2E_BUILD === "true";

  useEffect(() => {
    if (pinLoginEnabled) void db.users.toArray().then(setStaffUsers);
  }, [pinLoginEnabled]);
  useEffect(() => subscribeLoadingProgress(setLoadingProgress), []);

  const beginLoading = () => { reportLoadingProgress("session"); setIsLoading(true); };

  const handleLoginSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null); setNotice(null); beginLoading();
    const result = await loginWithEmail(email, password);
    if (!result.success) {
      reportLoadingProgress("error"); setIsLoading(false);
      setError(result.message === "Ongeldige inloggegevens" ? "E-mailadres of wachtwoord is niet correct. Controleer je gegevens en probeer opnieuw." : result.message || "Aanmelden lukt momenteel niet. Probeer het opnieuw.");
      return;
    }
    reportLoadingProgress("ready");
    window.history.replaceState(window.history.state, "", "/app");
  };

  const handlePasswordReset = async () => {
    setError(null); setNotice(null);
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) { setError("Vul eerst je e-mailadres in. Daarna sturen we je een beveiligde herstellink."); return; }
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(cleanEmail, { redirectTo: `${window.location.origin}/auth/set-password?type=recovery` });
    if (resetError) { setError("De herstellink kon niet worden verstuurd. Probeer het later opnieuw."); return; }
    setNotice("Als er een account bestaat voor dit e-mailadres, ontvang je binnen enkele minuten een beveiligde herstellink.");
  };

  const handlePinSubmit = async (userId: string, pin: string) => {
    setError(null); beginLoading();
    const valid = await loginWithPin(userId, pin);
    if (!valid) { reportLoadingProgress("error"); setIsLoading(false); setError("De medewerkerscode is niet correct. Probeer het opnieuw."); setEnteredPin(""); }
  };

  const resetLoading = () => {
    setIsLoading(false); reportLoadingProgress("starting");
    window.setTimeout(() => document.getElementById("login-password")?.focus(), 0);
  };

  if (mode === "register" && !showPinDrawer) {
    return <OnboardingWizard mode="registration" pinLoginEnabled onExit={(registrationNotice) => {
      setMode("login"); setError(null); setNotice(registrationNotice ?? null);
      window.history.replaceState(window.history.state, "", "/login");
    }} />;
  }

  const choosePinDigit = (digit: string) => {
    if (!selectedStaff || enteredPin.length >= 6 || isLoading) return;
    const next = enteredPin + digit; setEnteredPin(next);
    if (next.length === 6) void handlePinSubmit(selectedStaff.id, next);
  };

  return (
    <div className="auth-shell min-h-dvh bg-[#f5f7f8] text-slate-950">
      <div className="auth-ambient" aria-hidden="true" />
      <header className="relative z-20 mx-auto flex w-full max-w-[1440px] items-center justify-between px-5 py-5 sm:px-8 lg:px-12 lg:py-7">
        <BrandLockup />
        <nav className="flex items-center gap-2 sm:gap-4" aria-label="Accountnavigatie">
          <a href="/contact" className="hidden min-h-11 items-center rounded-xl px-3 text-sm font-bold text-slate-600 transition hover:bg-white/70 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 sm:inline-flex">Hulp nodig?</a>
          <a href="/" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200/90 bg-white/75 px-3.5 text-xs font-extrabold text-slate-700 shadow-sm backdrop-blur transition hover:border-slate-300 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2 sm:px-4 sm:text-sm">
            <ArrowLeft size={15} /><span className="hidden sm:inline">Naar website</span><span className="sm:hidden">Website</span>
          </a>
        </nav>
      </header>

      <main className="relative z-10 mx-auto grid w-full max-w-[1440px] items-center gap-10 px-5 py-8 sm:px-8 lg:min-h-[calc(100dvh-176px)] lg:grid-cols-[minmax(0,0.92fr)_minmax(440px,0.68fr)] lg:gap-20 lg:px-12 lg:py-10 xl:gap-28">
        <section className="mx-auto w-full max-w-2xl lg:mx-0 lg:pl-[clamp(0rem,4vw,3.5rem)]">
          <p className="inline-flex items-center gap-2.5 text-[11px] font-extrabold uppercase tracking-[0.2em] text-cyan-800"><span className="h-2 w-2 rounded-full bg-cyan-500 shadow-[0_0_0_5px_rgba(6,182,212,0.1)]" />Retail management platform</p>
          <h1 className="mt-6 max-w-[680px] text-[clamp(2.65rem,5vw,5.25rem)] font-black leading-[0.96] tracking-[-0.06em] text-slate-950">Eén omgeving voor je volledige winkel.</h1>
          <p className="mt-7 max-w-xl text-base leading-7 text-slate-600 sm:text-lg sm:leading-8">Verkoop, voorraad, klanten en inzichten — veilig beschikbaar voor jou en je team.</p>
          <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-3 text-xs font-bold text-slate-500 sm:text-sm">
            <span className="inline-flex items-center gap-2"><ShieldCheck size={17} className="text-cyan-700" /> Beveiligde toegang</span>
            <span className="inline-flex items-center gap-2"><LockKeyhole size={17} className="text-cyan-700" /> Ontworpen voor Belgische retail</span>
          </div>
        </section>

        <section className="mx-auto w-full max-w-[480px] lg:mx-0 lg:justify-self-end">
          <div className="auth-card rounded-[2rem] border border-white/90 bg-white/88 p-6 shadow-[0_38px_100px_-48px_rgba(15,23,42,0.42)] backdrop-blur-xl sm:p-9 lg:p-10">
            {showPinDrawer && pinLoginEnabled ? (
              <PinLogin staffUsers={staffUsers} selectedStaff={selectedStaff} enteredPin={enteredPin} error={error} isLoading={isLoading} onBack={() => { setShowPinDrawer(false); setSelectedStaff(null); setEnteredPin(""); setError(null); }} onSelect={(user) => { setSelectedStaff(user); setEnteredPin(""); setError(null); }} onDigit={choosePinDigit} onErase={() => setEnteredPin((value) => value.slice(0, -1))} onChangeUser={() => { setSelectedStaff(null); setEnteredPin(""); setError(null); }} />
            ) : (
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-cyan-700">PWAYMENT account</p>
                <h2 className="mt-2 text-3xl font-black tracking-[-0.04em] text-slate-950">Welkom terug</h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">Meld je aan om verder te gaan naar je winkelomgeving.</p>
                {error && <div className="mt-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold leading-5 text-rose-800" role="alert">{error}</div>}
                {notice && <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold leading-5 text-emerald-800" role="status">{notice}</div>}
                <form onSubmit={handleLoginSubmit} className="mt-7 space-y-5">
                  <label htmlFor="login-email" className="block text-xs font-extrabold text-slate-700">E-mailadres
                    <input id="login-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="naam@bedrijf.be" className="mt-2 h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-950 outline-none transition placeholder:font-normal placeholder:text-slate-400 hover:border-slate-300 focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100" />
                  </label>
                  <div>
                    <div className="flex items-center justify-between gap-4"><label htmlFor="login-password" className="block text-xs font-extrabold text-slate-700">Wachtwoord</label><button type="button" onClick={() => void handlePasswordReset()} className="min-h-8 rounded-md px-1 text-xs font-bold text-cyan-800 transition hover:text-cyan-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500">Wachtwoord vergeten?</button></div>
                    <div className="relative mt-2">
                      <input id="login-password" type={showPassword ? "text" : "password"} autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 pr-12 text-sm font-semibold text-slate-950 outline-none transition hover:border-slate-300 focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100" />
                      <button type="button" onClick={() => setShowPassword((visible) => !visible)} className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-xl text-slate-400 transition hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-500" aria-label={showPassword ? "Wachtwoord verbergen" : "Wachtwoord tonen"}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button>
                    </div>
                  </div>
                  <button type="submit" disabled={isLoading} className="group flex h-13 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 text-sm font-extrabold text-white shadow-[0_14px_32px_-16px_rgba(15,23,42,0.8)] transition hover:-translate-y-0.5 hover:bg-cyan-800 active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2 disabled:cursor-wait disabled:translate-y-0 disabled:opacity-65">
                    {isLoading ? <><LoaderCircle size={17} className="animate-spin" /> Aanmelden…</> : <>Aanmelden <ArrowRight size={17} className="transition-transform group-hover:translate-x-0.5" /></>}
                  </button>
                </form>
                <div className="mt-6 border-t border-slate-100 pt-5 text-center">
                  <p className="text-sm text-slate-500">Nog geen PWAYMENT-account? <button type="button" onClick={() => { setMode("register"); window.history.replaceState({}, "", "/register"); }} className="min-h-8 rounded-md px-1 font-extrabold text-cyan-800 hover:text-cyan-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500">Start gratis</button></p>
                  {pinLoginEnabled && <button type="button" onClick={() => { setShowPinDrawer(true); setError(null); setNotice(null); }} className="mt-3 inline-flex min-h-9 items-center gap-2 rounded-lg px-2 text-xs font-bold text-slate-500 hover:bg-slate-50 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"><KeyRound size={14} /> Aanmelden met medewerkerscode</button>}
                </div>
              </div>
            )}
          </div>
          <p className="mt-5 flex items-center justify-center gap-2 text-center text-xs leading-5 text-slate-500"><LockKeyhole size={14} className="shrink-0 text-cyan-700" /> Je verbinding is versleuteld en je sessie wordt veilig beheerd.</p>
        </section>
      </main>

      <footer className="relative z-10 mx-auto flex w-full max-w-[1440px] flex-col items-center justify-between gap-3 px-5 py-5 text-xs font-semibold text-slate-500 sm:flex-row sm:px-8 lg:px-12">
        <span>© {new Date().getFullYear()} PWAYMENT</span><div className="flex items-center gap-5"><a href="/legal/privacy" className="hover:text-slate-950">Privacy</a><a href="/legal/terms" className="hover:text-slate-950">Voorwaarden</a><a href="/contact" className="hover:text-slate-950">Support</a></div>
      </footer>
      {isLoading && <LoadingExperience progress={loadingProgress} mode="overlay" onRetry={loadingProgress.id === "error" ? resetLoading : undefined} onCancel={loadingProgress.id === "error" ? resetLoading : undefined} />}
    </div>
  );
};

type PinLoginProps = {
  staffUsers: User[]; selectedStaff: User | null; enteredPin: string; error: string | null; isLoading: boolean;
  onBack: () => void; onSelect: (user: User) => void; onDigit: (digit: string) => void; onErase: () => void; onChangeUser: () => void;
};

const PinLogin = ({ staffUsers, selectedStaff, enteredPin, error, isLoading, onBack, onSelect, onDigit, onErase, onChangeUser }: PinLoginProps) => (
  <div>
    <button type="button" onClick={onBack} className="inline-flex min-h-10 items-center gap-2 rounded-lg pr-3 text-xs font-extrabold text-slate-500 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"><ArrowLeft size={15} /> Aanmelden met e-mail</button>
    <div className="mt-6"><p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-cyan-700">Gekoppelde kassa</p><h2 className="mt-2 text-2xl font-black tracking-[-0.035em]">Aanmelden met medewerkerscode</h2><p className="mt-2 text-sm leading-6 text-slate-500">{selectedStaff ? `Voer de zescijferige code van ${selectedStaff.name} in.` : "Kies je profiel om deze kassa te openen."}</p></div>
    {error && <div className="mt-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold leading-5 text-rose-800" role="alert">{error}</div>}
    {!selectedStaff ? <div className="mt-7 grid grid-cols-2 gap-3">{staffUsers.map((user) => <button key={user.id} type="button" onClick={() => onSelect(user)} className="flex min-h-24 flex-col items-start justify-between rounded-2xl border border-slate-200 bg-slate-50/70 p-4 text-left transition hover:border-cyan-300 hover:bg-cyan-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"><span className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white"><RoleIcon role={user.role} /></span><span><strong className="block text-sm text-slate-950">{user.name}</strong><small className="mt-0.5 block text-[10px] font-bold uppercase tracking-wide text-slate-500">{roleLabel[user.role]}</small></span></button>)}</div> : <div className="mt-7">
      <div className="mb-6 flex justify-center gap-3" aria-label={`${enteredPin.length} van 6 cijfers ingevoerd`}>{Array.from({ length: 6 }).map((_, index) => <span key={index} className={`h-3 w-3 rounded-full border transition ${index < enteredPin.length ? "border-cyan-700 bg-cyan-700" : "border-slate-300 bg-slate-100"}`} />)}</div>
      <div className="mx-auto grid max-w-[280px] grid-cols-3 gap-2.5">{["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => <button key={digit} type="button" onClick={() => onDigit(digit)} disabled={isLoading} className="h-13 rounded-xl border border-slate-200 bg-white text-lg font-black transition hover:border-cyan-300 hover:bg-cyan-50 disabled:opacity-50">{digit}</button>)}<button type="button" onClick={onErase} className="h-13 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-600">Wis</button><button type="button" onClick={() => onDigit("0")} className="h-13 rounded-xl border border-slate-200 bg-white text-lg font-black">0</button><button type="button" onClick={onChangeUser} className="h-13 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-600">Terug</button></div>
    </div>}
  </div>
);
