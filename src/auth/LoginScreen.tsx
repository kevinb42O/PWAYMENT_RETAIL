import React, { useEffect, useState } from "react";
import { useAuth } from "./useAuth";
import { db } from "../db/db";
import { User, Role } from "../types";
import { supabase } from "../lib/supabase";
import { SiteHeader } from "../public/PublicSite";
import { OnboardingWizard } from "../onboarding/OnboardingWizard";
import { PaceMark } from "../pace/PaceMark";
import {
  getLoadingProgress,
  reportLoadingProgress,
  subscribeLoadingProgress,
} from "../services/loadingProgress";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Crown,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  ShieldCheck,
  User as UserIcon,
} from "lucide-react";

const roleLabel: Record<Role, string> = {
  owner: "Eigenaar",
  manager: "Manager",
  cashier: "Kassamedewerker",
};

const RoleIcon: React.FC<{ role: Role }> = ({ role }) => {
  if (role === "owner") return <Crown size={14} className="text-amber-600" />;
  if (role === "manager")
    return <ShieldCheck size={14} className="text-indigo-600" />;
  return <UserIcon size={14} className="text-zinc-500" />;
};

export const LoginScreen: React.FC = () => {
  const { loginWithEmail, login: loginWithPin } = useAuth();

  const [mode, setMode] = useState<"login" | "register">(() =>
    window.location.pathname.startsWith("/register") ? "register" : "login",
  );
  const [showPinDrawer, setShowPinDrawer] = useState(false);
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);

  // Form states
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Registration states
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [storeName, setStoreName] = useState("");
  const [pinCode, setPinCode] = useState("");

  // Staff PIN Quick Login states
  const [staffUsers, setStaffUsers] = useState<User[]>([]);
  const [selectedStaff, setSelectedStaff] = useState<User | null>(null);
  const [enteredPin, setEnteredPin] = useState("");

  // UI status
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(getLoadingProgress);
  const pinLoginEnabled =
    import.meta.env.DEV ||
    import.meta.env.VITE_PRESENTATION_BUILD === "true" ||
    import.meta.env.VITE_E2E_BUILD === "true";

  useEffect(() => {
    void db.users.toArray().then(setStaffUsers);
  }, []);

  useEffect(() => subscribeLoadingProgress(setLoadingProgress), []);

  const beginLoading = () => {
    reportLoadingProgress("session");
    setIsLoading(true);
  };

  const stopLoading = () => {
    setIsLoading(false);
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    beginLoading();
    const res = await loginWithEmail(email, password);
    if (!res.success) {
      reportLoadingProgress("error");
      stopLoading();
      setError(res.message || "Aanmelden mislukt");
      return;
    }
    reportLoadingProgress("ready");
    window.history.replaceState(window.history.state, "", "/app");
  };

  // The normal registration screen is the retail onboarding wizard. Keep this
  // defensive handler because the legacy form can be revealed from the local
  // PIN drawer in development builds: it must never create a profile before
  // the merchant has explicitly selected their retail type.
  const handleRegisterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setShowPinDrawer(false);
    setMode("register");
    window.history.replaceState({}, "", "/register");
  };

  const handlePinSubmit = async (uId: string, candidatePin: string) => {
    setError(null);
    beginLoading();
    const ok = await loginWithPin(uId, candidatePin);
    if (!ok) {
      reportLoadingProgress("error");
      stopLoading();
      setError("Ongeldige PIN code");
      setEnteredPin("");
    }
  };

  if (mode === "register" && !showPinDrawer) {
    return (
      <OnboardingWizard
        mode="registration"
        pinLoginEnabled={pinLoginEnabled}
        onExit={(registrationNotice) => {
          setMode("login");
          setError(null);
          setNotice(registrationNotice ?? null);
          window.history.replaceState(window.history.state, "", "/login");
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#FBFBFD] text-zinc-950 flex flex-col justify-between selection:bg-zinc-950 selection:text-white font-sans antialiased relative overflow-x-hidden">
      {/* Background Image with Subtle Blur */}
      <div
        className="absolute inset-0 pointer-events-none bg-cover bg-center bg-no-repeat blur-[4px] scale-[1.02] opacity-95 transition-all duration-500"
        style={{ backgroundImage: 'url("/login_bg.png")' }}
      />

      <div className="relative z-20">
        <SiteHeader mobileOpen={mobileNavigationOpen} setMobileOpen={setMobileNavigationOpen} />
      </div>

      {/* Legacy login header is deliberately hidden: the shared public header above is the only navigation. */}
      <header className="hidden">
        <div className="hidden items-center gap-3">
          {/* P Monogram Icon */}
          <svg
            viewBox="0 0 60 60"
            className="h-10 sm:h-11 w-auto flex-shrink-0"
            shapeRendering="geometricPrecision"
          >
            <defs>
              <linearGradient
                id="pway-brand-grad-hdr"
                x1="0%"
                y1="0%"
                x2="100%"
                y2="100%"
              >
                <stop offset="0%" stopColor="#00F0FF" />
                <stop offset="50%" stopColor="#0088FF" />
                <stop offset="100%" stopColor="#0055FF" />
              </linearGradient>
              <linearGradient
                id="pway-accent-grad-hdr"
                x1="0%"
                y1="0%"
                x2="100%"
                y2="100%"
              >
                <stop offset="0%" stopColor="#BEF264" />
                <stop offset="100%" stopColor="#84CC16" />
              </linearGradient>
              <filter
                id="mark-glow-hdr"
                x="-10%"
                y="-10%"
                width="120%"
                height="120%"
              >
                <feDropShadow
                  dx="0"
                  dy="1.5"
                  stdDeviation="1.5"
                  floodColor="#0077FF"
                  floodOpacity="0.3"
                />
              </filter>
            </defs>
            <g transform="translate(4, 2)" filter="url(#mark-glow-hdr)">
              <path
                d="M 16 56 V 8 H 32 C 43 8 50 15.5 50 23 C 50 30.5 43 38 32 38 H 16"
                fill="none"
                stroke="url(#pway-brand-grad-hdr)"
                strokeWidth="6.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle
                cx="49"
                cy="40"
                r="4.5"
                fill="url(#pway-accent-grad-hdr)"
              />
            </g>
          </svg>

          {/* Text Block: pwayment + retail intelligence */}
          <div className="flex flex-col justify-center">
            <span className="text-xl sm:text-[22px] font-black tracking-[-0.05em] text-zinc-950 leading-none">
              pwayment
            </span>
            <span className="text-[8.5px] sm:text-[9px] font-mono font-bold tracking-[0.2em] uppercase text-zinc-400 mt-1 leading-none">
              retail intelligence
            </span>
          </div>
        </div>

        <a href="/" className="group flex shrink-0 items-center gap-2" aria-label="Naar de Pwayment-website">
          <img src="/branding/PWAYMENTLOGOFINAL.png" alt="PWAYMENT" className="h-7 w-auto transition-transform duration-300 group-hover:scale-[1.03]" />
          <span className="hidden border-l border-zinc-300 pl-3 text-xs font-semibold text-zinc-500 sm:inline">Retail intelligence</span>
        </a>

        <nav className="hidden items-center gap-6 text-sm font-semibold text-zinc-600 lg:flex" aria-label="Website navigatie">
          <a href="/product" className="transition-colors hover:text-zinc-950">Product</a>
          <a href="/pricing" className="transition-colors hover:text-zinc-950">Prijzen</a>
          <a href="/resources" className="transition-colors hover:text-zinc-950">Resources</a>
        </nav>

        <a href="/" className="ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-bold text-zinc-600 transition-all hover:bg-zinc-950 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 sm:px-4">
          <ArrowLeft size={14} />
          <span className="hidden sm:inline">Website</span>
        </a>

        {pinLoginEnabled && (
          <button
            onClick={() => {
              setShowPinDrawer(!showPinDrawer);
              setError(null);
            }}
            className="text-xs font-semibold text-zinc-800 hover:text-zinc-950 bg-white/80 backdrop-blur-md border border-zinc-200/80 hover:border-zinc-300 rounded-full px-5 py-2.5 transition-all shadow-2xs hover:shadow-xs flex items-center gap-2"
          >
            <KeyRound size={14} className="text-zinc-600" />
            {showPinDrawer ? "E-mail Inloggen" : "Medewerker Snel-PIN"}
          </button>
        )}
      </header>

      {/* Main Container - Alive High-Fashion Editorial Layout */}
      <main className="relative z-10 w-full max-w-6xl mx-auto px-6 sm:px-8 py-4 flex-1 flex items-center">
        <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center">
          {/* Left Editorial Section */}
          <div className="lg:col-span-6 space-y-8">
            <div>
              <div className="text-[11px] font-mono font-bold uppercase tracking-[0.22em] text-zinc-400 mb-4 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                RETAIL INTELLIGENCE PLATFORM
              </div>
              <h1 className="text-4xl sm:text-5xl lg:text-[54px] font-black tracking-[-0.04em] text-zinc-950 leading-[1.05]">
                Van kassa naar helder winkelinzicht.
              </h1>
              <p className="text-zinc-600 text-base sm:text-lg leading-relaxed font-normal max-w-lg mt-5">
                Je winkel altijd bij de hand — verkopen, beheren en bijsturen
                vanaf elk toestel.
              </p>
            </div>

            {/* Dynamic Editorial Pillar Flow (No cards, no hairlines, smooth hover rhythm) */}
            <div className="space-y-6 pt-2">
              <div className="group pl-4 border-l-2 border-zinc-200 hover:border-zinc-950 transition-all duration-300">
                <div className="text-[11px] font-mono font-bold text-zinc-400 tracking-[0.18em] uppercase mb-1 group-hover:text-zinc-950 transition-colors">
                  01 / DE BASIS DIE STAAT
                </div>
                <h3 className="text-base font-bold text-zinc-950 mb-1 group-hover:translate-x-0.5 transition-transform duration-300">
                  Kassa waarop je kunt rekenen
                </h3>
                <p className="text-xs sm:text-sm text-zinc-500 leading-relaxed max-w-md">
                  Verkoop zonder omwegen. Product, korting, kassaticket en
                  betaling in één korte, intuïtieve flow.
                </p>
              </div>

              <div className="group pl-4 border-l-2 border-zinc-200 hover:border-zinc-950 transition-all duration-300">
                <div className="text-[11px] font-mono font-bold text-zinc-400 tracking-[0.18em] uppercase mb-1 group-hover:text-zinc-950 transition-colors">
                  02 / VAN KASSA NAAR INZICHT
                </div>
                <h3 className="text-base font-bold text-zinc-950 mb-1 group-hover:translate-x-0.5 transition-transform duration-300">
                  Pwayment toont wat beter kan
                </h3>
                <p className="text-xs sm:text-sm text-zinc-500 leading-relaxed max-w-md">
                  Zet transactiedata om in actie. Zie waar marge weglekt, welke
                  voorraad cash vasthoudt en welke klantpatronen zichtbaar
                  worden.
                </p>
              </div>

              <div className="group pl-4 border-l-2 border-zinc-200 hover:border-zinc-950 transition-all duration-300">
                <div className="text-[11px] font-mono font-bold text-zinc-400 tracking-[0.18em] uppercase mb-1 group-hover:text-zinc-950 transition-colors">
                  03 / OVERAL INZETBAAR
                </div>
                <h3 className="text-base font-bold text-zinc-950 mb-1 group-hover:translate-x-0.5 transition-transform duration-300">
                  Progressive Web App
                </h3>
                <p className="text-xs sm:text-sm text-zinc-500 leading-relaxed max-w-md">
                  Vloeiend op laptop, tablet en smartphone. Offline-first op dit
                  toestel; synchronisatie werkt zodra een backendkoppeling is
                  geconfigureerd.
                </p>
              </div>
            </div>
          </div>

          {/* Right Form Card Panel */}
          <div className="lg:col-span-6 w-full max-w-[440px] mx-auto lg:ml-auto">
            {showPinDrawer && pinLoginEnabled ? (
              /* Medewerker Snel-PIN Terminal Drawer */
              <div className="bg-white/90 backdrop-blur-xl rounded-3xl border border-zinc-200/80 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.08)] p-8 sm:p-10 transition-all">
                <div className="text-center mb-8">
                  <h2 className="text-xl font-bold tracking-tight text-zinc-950">
                    Kassa Snel-PIN
                  </h2>
                  <p className="text-xs text-zinc-500 mt-1">
                    Selecteer een medewerker om aan te melden op deze kassa
                  </p>
                </div>

                {error && (
                  <div className="mb-6 p-3.5 rounded-2xl bg-rose-50 border border-rose-100 text-rose-600 text-xs font-medium text-center">
                    {error}
                  </div>
                )}
                {!selectedStaff ? (
                  <div className="grid grid-cols-2 gap-3">
                    {staffUsers.map((u) => (
                      <button
                        key={u.id}
                        onClick={() => {
                          setSelectedStaff(u);
                          setEnteredPin("");
                          setError(null);
                        }}
                        className="flex flex-col items-center justify-center p-4 bg-zinc-50/70 hover:bg-zinc-100/90 border border-zinc-200/70 rounded-2xl transition-all text-center group"
                      >
                        <div className="w-10 h-10 rounded-full bg-white border border-zinc-200 flex items-center justify-center mb-2 shadow-2xs group-hover:scale-105 transition-transform">
                          <RoleIcon role={u.role} />
                        </div>
                        <span className="font-bold text-sm text-zinc-950 line-clamp-1">
                          {u.name}
                        </span>
                        <span className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider mt-0.5">
                          {roleLabel[u.role]}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center">
                    <div className="flex items-center gap-2 mb-6">
                      <span className="font-bold text-base text-zinc-950">
                        {selectedStaff.name}
                      </span>
                      <span className="text-xs text-zinc-500 font-medium px-2 py-0.5 bg-zinc-100 rounded-md">
                        {roleLabel[selectedStaff.role]}
                      </span>
                    </div>

                    {/* 6 PIN Dots */}
                    <div className="flex gap-4 mb-8">
                      {Array.from({ length: 6 }).map((_, i) => (
                        <div
                          key={i}
                          className={`w-3.5 h-3.5 rounded-full border transition-all ${
                            i < enteredPin.length
                              ? "bg-zinc-950 border-zinc-950 scale-110"
                              : "bg-zinc-100 border-zinc-300"
                          }`}
                        />
                      ))}
                    </div>

                    <div className="grid grid-cols-3 gap-2.5 w-60 mb-4">
                      {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map(
                        (digit) => (
                          <button
                            key={digit}
                            onClick={() => {
                              if (enteredPin.length < 6) {
                                const next = enteredPin + digit;
                                setEnteredPin(next);
                                if (next.length === 6) {
                                  void handlePinSubmit(selectedStaff.id, next);
                                }
                              }
                            }}
                            disabled={isLoading}
                            className="h-12 text-lg font-bold bg-white hover:bg-zinc-50 border border-zinc-200 rounded-2xl active:bg-zinc-100 transition-all text-zinc-950 shadow-2xs"
                          >
                            {digit}
                          </button>
                        ),
                      )}
                      <button
                        onClick={() => setEnteredPin((p) => p.slice(0, -1))}
                        className="h-12 text-xs font-semibold bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 rounded-2xl text-zinc-600 transition-all"
                      >
                        Wis
                      </button>
                      <button
                        onClick={() => {
                          if (enteredPin.length < 6) {
                            const next = enteredPin + "0";
                            setEnteredPin(next);
                            if (next.length === 6) {
                              void handlePinSubmit(selectedStaff.id, next);
                            }
                          }
                        }}
                        className="h-12 text-lg font-bold bg-white hover:bg-zinc-50 border border-zinc-200 rounded-2xl active:bg-zinc-100 transition-all text-zinc-950 shadow-2xs"
                      >
                        0
                      </button>
                      <button
                        onClick={() => setSelectedStaff(null)}
                        className="h-12 text-xs font-semibold bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 rounded-2xl text-zinc-500 transition-all"
                      >
                        Terug
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Main Auth Card */
              <div
                className="bg-white/90 backdrop-blur-xl rounded-3xl border border-zinc-200/90 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.08)] p-8 sm:p-10 transition-all"
                aria-busy={isLoading}
              >
                {/* Tab Switcher */}
                <div className="grid grid-cols-2 p-1 bg-zinc-100/80 border border-zinc-200/60 rounded-2xl mb-8">
                  <button
                    type="button"
                    onClick={() => {
                      setMode("login");
                      setError(null);
                    }}
                    className={`py-2.5 text-xs font-bold rounded-xl transition-all ${
                      mode === "login"
                        ? "bg-white text-zinc-950 shadow-2xs"
                        : "text-zinc-500 hover:text-zinc-950 font-semibold"
                    }`}
                  >
                    Inloggen
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowPinDrawer(false);
                      setMode("register");
                      setError(null);
                      window.history.replaceState({}, "", "/register");
                    }}
                    className={`py-2.5 text-xs font-bold rounded-xl transition-all ${
                      mode === "register"
                        ? "bg-white text-zinc-950 shadow-2xs"
                        : "text-zinc-500 hover:text-zinc-950 font-semibold"
                    }`}
                  >
                    Account Aanmaken
                  </button>
                </div>

                {/* Title */}
                <div className="mb-6">
                  <h2 className="text-xl font-extrabold tracking-tight text-zinc-950">
                    {mode === "login"
                      ? "Inloggen bij PWAyment"
                      : "Nieuw account aanmaken"}
                  </h2>
                  <p className="text-xs text-zinc-500 mt-1 font-normal">
                    {mode === "login"
                      ? "Voer uw e-mailadres en wachtwoord in om aan te melden"
                      : "Vul onderstaande gegevens in om uw account in te stellen"}
                  </p>
                </div>

                {error && (
                  <div className="mb-5 p-3.5 rounded-2xl bg-rose-50 border border-rose-100 text-rose-600 text-xs font-medium">
                    {error}
                  </div>
                )}
                {notice && (
                  <div className="mb-5 p-3.5 rounded-2xl bg-emerald-50 border border-emerald-100 text-emerald-700 text-xs font-medium">
                    {notice}
                  </div>
                )}

                {mode === "login" ? (
                  /* LOGIN FORM */
                  <div className="space-y-4">
                    <form onSubmit={handleLoginSubmit} className="space-y-4">
                    <div>
                      <label htmlFor="login-email" className="block text-xs font-semibold text-zinc-800 mb-1.5">
                        E-mailadres
                      </label>
                      <input
                        type="email"
                        id="login-email"
                        autoComplete="email"
                        required
                        placeholder="E-mailadres"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full h-11 px-3.5 bg-white border border-zinc-200 rounded-xl text-sm font-medium text-zinc-950 focus:outline-none focus:ring-2 focus:ring-zinc-950 focus:border-transparent transition-all shadow-2xs placeholder:text-zinc-400 placeholder:font-normal"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label htmlFor="login-password" className="block text-xs font-semibold text-zinc-800">
                          Wachtwoord
                        </label>
                        <a
                          href="#forgot"
                          onClick={async (e) => {
                            e.preventDefault();
                            setError(null);
                            setNotice(null);
                            const cleanEmail = email.trim().toLowerCase();
                            if (!cleanEmail) {
                              setError("Vul eerst je e-mailadres in.");
                              return;
                            }
                            const { error: resetError } =
                              await supabase.auth.resetPasswordForEmail(
                                cleanEmail,
                                {
                                  redirectTo: `${window.location.origin}/auth/set-password?type=recovery`,
                                },
                              );
                            if (resetError) {
                              setError(
                                "De herstellink kon niet worden verstuurd. Probeer later opnieuw.",
                              );
                              return;
                            }
                            setNotice(
                              "Als dit account bestaat, ontvang je een beveiligde herstellink per e-mail.",
                            );
                          }}
                          className="text-xs font-medium text-zinc-500 hover:text-zinc-950 transition-colors"
                        >
                          Wachtwoord vergeten?
                        </a>
                      </div>
                      <div className="relative">
                        <input
                          type={showPassword ? "text" : "password"}
                          id="login-password"
                          autoComplete="current-password"
                          required
                          placeholder="Wachtwoord"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="w-full h-11 pl-3.5 pr-10 bg-white border border-zinc-200 rounded-xl text-sm font-medium text-zinc-950 focus:outline-none focus:ring-2 focus:ring-zinc-950 focus:border-transparent transition-all shadow-2xs placeholder:text-zinc-400 placeholder:font-normal"
                        />
                        <button
                          type="button"
                          aria-label={
                            showPassword
                              ? "Wachtwoord verbergen"
                              : "Wachtwoord tonen"
                          }
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3.5 top-3.5 text-zinc-400 hover:text-zinc-700 transition-colors"
                        >
                          {showPassword ? (
                            <EyeOff size={16} />
                          ) : (
                            <Eye size={16} />
                          )}
                        </button>
                      </div>
                    </div>

                    <p className="pt-1 text-xs leading-5 text-zinc-500">
                      Je sessie wordt veilig beheerd via Supabase en herstelt
                      alleen op dit vertrouwde toestel.
                    </p>

                    <button
                      type="submit"
                      disabled={isLoading}
                      className="group relative mt-3 flex h-13 w-full items-center justify-center gap-2 overflow-hidden rounded-2xl border border-zinc-300 bg-white text-sm font-extrabold text-zinc-950 shadow-[0_10px_24px_-14px_rgba(15,23,42,0.35)] transition-all duration-300 before:pointer-events-none before:absolute before:inset-y-0 before:-left-1/2 before:w-1/3 before:-skew-x-12 before:bg-zinc-950/[0.045] before:transition-transform before:duration-700 hover:-translate-y-0.5 hover:border-zinc-950 hover:bg-zinc-50 hover:shadow-[0_18px_32px_-16px_rgba(15,23,42,0.48)] hover:before:translate-x-[420%] active:translate-y-0 active:scale-[0.985] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 disabled:cursor-wait disabled:translate-y-0 disabled:opacity-70 disabled:shadow-none"
                    >
                      {isLoading ? (
                        <span className="relative z-10 flex items-center gap-2">
                          <LoaderCircle size={16} className="animate-spin" />
                          Aanmelden…
                        </span>
                      ) : (
                        <span className="relative z-10 flex items-center gap-2">Inloggen <ArrowRight size={16} className="transition-transform duration-300 group-hover:translate-x-1" /></span>
                      )}
                    </button>
                    </form>
                  </div>
                ) : (
                  /* REGISTER FORM */
                  <form onSubmit={handleRegisterSubmit} className="space-y-3.5">
                    {/* 2-Column Name Grid */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-zinc-800 mb-1.5">
                          Voornaam
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="Voornaam"
                          value={firstName}
                          onChange={(e) => setFirstName(e.target.value)}
                          className="w-full h-11 px-3.5 bg-white border border-zinc-200 rounded-xl text-sm font-medium text-zinc-950 focus:outline-none focus:ring-2 focus:ring-zinc-950 focus:border-transparent transition-all shadow-2xs placeholder:text-zinc-400 placeholder:font-normal"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-zinc-800 mb-1.5">
                          Familienaam
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="Familienaam"
                          value={lastName}
                          onChange={(e) => setLastName(e.target.value)}
                          className="w-full h-11 px-3.5 bg-white border border-zinc-200 rounded-xl text-sm font-medium text-zinc-950 focus:outline-none focus:ring-2 focus:ring-zinc-950 focus:border-transparent transition-all shadow-2xs placeholder:text-zinc-400 placeholder:font-normal"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-zinc-800 mb-1.5">
                        Winkel / Bedrijfsnaam
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="Winkel / Bedrijfsnaam"
                        value={storeName}
                        onChange={(e) => setStoreName(e.target.value)}
                        className="w-full h-11 px-3.5 bg-white border border-zinc-200 rounded-xl text-sm font-medium text-zinc-950 focus:outline-none focus:ring-2 focus:ring-zinc-950 focus:border-transparent transition-all shadow-2xs placeholder:text-zinc-400 placeholder:font-normal"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-zinc-800 mb-1.5">
                        E-mailadres
                      </label>
                      <input
                        type="email"
                        required
                        placeholder="E-mailadres"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full h-11 px-3.5 bg-white border border-zinc-200 rounded-xl text-sm font-medium text-zinc-950 focus:outline-none focus:ring-2 focus:ring-zinc-950 focus:border-transparent transition-all shadow-2xs placeholder:text-zinc-400 placeholder:font-normal"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-zinc-800 mb-1.5">
                        Wachtwoord
                      </label>
                      <div className="relative">
                        <input
                          type={showPassword ? "text" : "password"}
                          required
                          placeholder="Wachtwoord"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="w-full h-11 pl-3.5 pr-10 bg-white border border-zinc-200 rounded-xl text-sm font-medium text-zinc-950 focus:outline-none focus:ring-2 focus:ring-zinc-950 focus:border-transparent transition-all shadow-2xs placeholder:text-zinc-400 placeholder:font-normal"
                        />
                        <button
                          type="button"
                          aria-label={
                            showPassword
                              ? "Wachtwoord verbergen"
                              : "Wachtwoord tonen"
                          }
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3.5 top-3.5 text-zinc-400 hover:text-zinc-700 transition-colors"
                        >
                          {showPassword ? (
                            <EyeOff size={16} />
                          ) : (
                            <Eye size={16} />
                          )}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-zinc-800 mb-1.5">
                        Wachtwoord herhalen
                      </label>
                      <div className="relative">
                        <input
                          type={showConfirmPassword ? "text" : "password"}
                          required
                          placeholder="Wachtwoord herhalen"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          className="w-full h-11 pl-3.5 pr-10 bg-white border border-zinc-200 rounded-xl text-sm font-medium text-zinc-950 focus:outline-none focus:ring-2 focus:ring-zinc-950 focus:border-transparent transition-all shadow-2xs placeholder:text-zinc-400 placeholder:font-normal"
                        />
                        <button
                          type="button"
                          aria-label={
                            showConfirmPassword
                              ? "Herhaald wachtwoord verbergen"
                              : "Herhaald wachtwoord tonen"
                          }
                          onClick={() =>
                            setShowConfirmPassword(!showConfirmPassword)
                          }
                          className="absolute right-3.5 top-3.5 text-zinc-400 hover:text-zinc-700 transition-colors"
                        >
                          {showConfirmPassword ? (
                            <EyeOff size={16} />
                          ) : (
                            <Eye size={16} />
                          )}
                        </button>
                      </div>
                    </div>

                    {pinLoginEnabled && (
                    <div>
                      <label className="block text-xs font-semibold text-zinc-800 mb-1.5">
                        Kassa Snel-PIN (6 cijfers)
                      </label>
                      <div className="flex items-center gap-3">
                        <input
                          type="password"
                          maxLength={6}
                          inputMode="numeric"
                          autoComplete="new-password"
                          aria-label="Kassa Snel-PIN (6 cijfers)"
                          required
                          placeholder="••••••"
                          value={pinCode}
                          onChange={(e) =>
                            setPinCode(
                              e.target.value.replace(/\D/g, "").slice(0, 6),
                            )
                          }
                          className="w-full h-11 px-3.5 bg-white border border-zinc-200 rounded-xl text-lg tracking-[0.4em] font-mono text-zinc-950 focus:outline-none focus:ring-2 focus:ring-zinc-950 focus:border-transparent transition-all shadow-2xs placeholder:text-zinc-300 placeholder:tracking-normal text-center font-bold"
                        />
                        <div className="flex items-center gap-1.5 px-2">
                          {Array.from({ length: 6 }).map((_, i) => (
                            <div
                              key={i}
                              className={`w-3.5 h-3.5 rounded-full border transition-all ${
                                i < pinCode.length
                                  ? "bg-zinc-950 border-zinc-950 scale-105"
                                  : "bg-zinc-100 border-zinc-300"
                              }`}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                    )}

                    <button
                      type="submit"
                      disabled={isLoading}
                      className="group relative mt-3 flex h-13 w-full items-center justify-center gap-2 overflow-hidden rounded-2xl border border-zinc-300 bg-white text-sm font-extrabold text-zinc-950 shadow-[0_10px_24px_-14px_rgba(15,23,42,0.35)] transition-all duration-300 before:pointer-events-none before:absolute before:inset-y-0 before:-left-1/2 before:w-1/3 before:-skew-x-12 before:bg-zinc-950/[0.045] before:transition-transform before:duration-700 hover:-translate-y-0.5 hover:border-zinc-950 hover:bg-zinc-50 hover:shadow-[0_18px_32px_-16px_rgba(15,23,42,0.48)] hover:before:translate-x-[420%] active:translate-y-0 active:scale-[0.985] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 disabled:cursor-wait disabled:translate-y-0 disabled:opacity-70 disabled:shadow-none"
                    >
                      {isLoading ? (
                        <span className="relative z-10 flex items-center gap-2">
                          <LoaderCircle size={16} className="animate-spin" />
                          Account maken…
                        </span>
                      ) : (
                        <span className="relative z-10 flex items-center gap-2">Account aanmaken <Check size={16} className="transition-transform duration-300 group-hover:scale-110" /></span>
                      )}
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 w-full max-w-6xl mx-auto px-6 sm:px-8 py-6 text-center text-xs font-medium text-zinc-400 flex flex-col items-center gap-1">
        <div>&copy; {new Date().getFullYear()} PWAyment Retail</div>
        <div className="text-[11px] font-mono text-zinc-500 tracking-wider">
          WebaanZee
        </div>
      </footer>

      {isLoading && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/28 px-6 backdrop-blur-sm"
          role="status"
          aria-live="polite"
          aria-label={loadingProgress.detail}
        >
          <div className="w-full max-w-sm rounded-3xl border border-white/70 bg-white/95 p-7 text-center shadow-[0_32px_100px_-30px_rgba(15,23,42,0.55)]">
            <div className="mx-auto mb-5 flex min-h-24 items-center justify-center">
              <PaceMark key={loadingProgress.title} size={92} active thinking performance={loadingProgress.progress >= 75 ? "portal" : "liquid"} motionMode="full" forceMotion />
            </div>
            <p className="text-base font-extrabold tracking-tight text-slate-950">{loadingProgress.title}</p>
            <p className="mt-1.5 text-sm leading-6 text-slate-500">{loadingProgress.detail}</p>
            <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-blue-500 to-indigo-600 transition-[width] duration-500" style={{ width: `${Math.max(8, loadingProgress.progress)}%` }} />
            </div>
            <p className="mt-2 text-xs font-semibold tabular-nums text-slate-400">{loadingProgress.progress}% klaar</p>
          </div>
        </div>
      )}
    </div>
  );
};
