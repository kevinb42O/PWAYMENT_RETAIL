import React, { useEffect, useRef, useState } from "react";
import { Menu } from "./Menu";
import { Cart } from "./Cart";
import { useStore } from "../store/useStore";
import { useAuth } from "../auth/useAuth";
import { useProducts } from "../store/useProducts";
import { matchesCatalogQuery } from "../utils/productLookup";
import { FeatureGate } from "../billing/FeatureGate";
import { TrialStatus } from "../billing/TrialStatus";
import { FEATURE_KEYS, planLabel, useEntitlements } from "../billing/entitlements";
import { supabase } from "../lib/supabase";
import {
  AlertCircle,
  CheckCircle2,
  ScanLine,
  ShoppingCart,
  ShoppingBag,
  FileText,
  History,
  Monitor,
  LogOut,
  Search,
  Settings,
  Users,
  Lightbulb,
  Maximize,
  Minimize,
} from "lucide-react";

const ZReportView = React.lazy(() =>
  import("./ZReport").then((module) => ({ default: module.ZReportView })),
);
const AuditLog = React.lazy(() =>
  import("./AuditLog").then((module) => ({ default: module.AuditLog })),
);
const Customers = React.lazy(() =>
  import("./Customers").then((module) => ({ default: module.Customers })),
);
const Insights = React.lazy(() =>
  import("./Insights").then((module) => ({ default: module.Insights })),
);
const ProfileView = React.lazy(() =>
  import("./Profile").then((module) => ({ default: module.ProfileView })),
);

const ViewLoading = () => (
  <div
    className="flex flex-1 items-center justify-center bg-slate-50 text-sm font-semibold text-slate-500"
    role="status"
    aria-live="polite"
  >
    Pagina laden…
  </div>
);

const SCAN_RESET_MS = 90;
const SCAN_SUBMIT_GAP_MS = 200;
const SCAN_MIN_LENGTH = 4;

const isEditableTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName;
  return (
    target.isContentEditable ||
    tagName === "INPUT" ||
    tagName === "TEXTAREA" ||
    tagName === "SELECT"
  );
};

interface ScanFeedback {
  tone: "success" | "warning" | "info";
  title: string;
  detail: string;
}

export const Layout: React.FC = () => {
  const {
    mobileView,
    setMobileView,
    cart,
    mainView,
    setMainView,
    scanCodeToCart,
  } = useStore();
  const { currentUserName, currentRole, currentStoreId, logout } = useAuth();
  const refreshEntitlements = useEntitlements((state) => state.load);
  const entitlementSnapshot = useEntitlements((state) => state.snapshot);
  const canUseWebshop = useEntitlements(
    (state) => state.snapshot?.features[FEATURE_KEYS.webshopPublish] === true,
  );
  const products = useProducts((s) => s.list);
  const hydrateProducts = useProducts((s) => s.hydrate);

  const [productQuery, setProductQuery] = useState("");
  const [scanFeedback, setScanFeedback] = useState<ScanFeedback | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(
    () => window.matchMedia("(min-width: 768px)").matches,
  );
  const [isNavDropdownOpen, setIsNavDropdownOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [profileInitialTarget, setProfileInitialTarget] = useState<{
    tab: "billing" | "webshop-general";
    requestKey: number;
  }>({ tab: "billing", requestKey: 0 });

  const scanInputRef = useRef<HTMLInputElement | null>(null);
  const scanBufferRef = useRef("");
  const lastScanKeyAtRef = useRef(0);
  const navDropdownRef = useRef<HTMLDivElement | null>(null);
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const userMenuButtonRef = useRef<HTMLButtonElement | null>(null);

  const cartCount = cart.orders.reduce((acc, o) => acc + o.quantity, 0);
  const activePlanBadge = entitlementSnapshot
    ? entitlementSnapshot.status === "trialing"
      ? "Pro trial"
      : {
          basic: "Basis",
          pro: "Pro",
          enterprise: "Enterprise",
        }[entitlementSnapshot.effectivePlan]
    : null;
  const activePlanTitle = entitlementSnapshot
    ? `Actief plan: ${planLabel(entitlementSnapshot.effectivePlan)}${
        entitlementSnapshot.status === "trialing" ? " trial" : ""
      }`
    : undefined;

  const openProfile = (tab: "billing" | "webshop-general" = "billing") => {
    setProfileInitialTarget((current) => ({
      tab,
      requestKey: current.requestKey + 1,
    }));
    setMainView("profile");
  };

  useEffect(() => {
    if (!currentStoreId) return;
    const channel = supabase
      .channel(`billing:${currentStoreId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "store_subscriptions",
          filter: `store_id=eq.${currentStoreId}`,
        },
        () => void refreshEntitlements(currentStoreId, true).catch(() => undefined),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [currentStoreId, refreshEntitlements]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        navDropdownRef.current &&
        !navDropdownRef.current.contains(event.target as Node)
      ) {
        setIsNavDropdownOpen(false);
      }
      if (
        userMenuRef.current &&
        !userMenuRef.current.contains(event.target as Node)
      ) {
        setIsUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isUserMenuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setIsUserMenuOpen(false);
      userMenuButtonRef.current?.focus();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isUserMenuOpen]);

  const activeViewLabel = React.useMemo(() => {
    switch (mainView) {
      case "z-report":
        return { title: "Dagafsluiting", Icon: FileText };
      case "audit-log":
        return { title: "Historiek", Icon: History };
      case "customers":
        return { title: "Klanten", Icon: Users };
      case "insights":
        return { title: "Inzichten", Icon: Lightbulb };
      case "admin":
        return { title: "Beheer", Icon: Settings };
      default:
        return null;
    }
  }, [mainView]);

  const focusScanInput = () => {
    if (typeof window === "undefined") return;
    if (!window.matchMedia("(min-width: 768px)").matches) return;
    window.requestAnimationFrame(() => scanInputRef.current?.focus());
  };

  const submitProductQuery = (rawValue?: string) => {
    const value = (rawValue ?? productQuery).trim();
    if (!value) {
      focusScanInput();
      return;
    }

    const result = scanCodeToCart(value);

    if (result.status === "matched" && result.product) {
      setProductQuery("");
      setScanFeedback({
        tone: "success",
        title: `${result.product.name} toegevoegd`,
        detail: `Direct toegevoegd via ${result.matchedOn === "sku" ? "SKU" : "barcode"} scan.`,
      });
      focusScanInput();
      return;
    }

    if (result.status === "out-of-stock" && result.product) {
      setProductQuery(value);
      setScanFeedback({
        tone: "warning",
        title: `${result.product.name} is uitverkocht`,
        detail: "Deze barcode is herkend, maar de voorraad staat op nul.",
      });
      focusScanInput();
      return;
    }

    const hasBrowseMatches = products.some((product) =>
      matchesCatalogQuery(product, value),
    );
    setProductQuery(value);
    setScanFeedback(
      hasBrowseMatches
        ? {
            tone: "info",
            title: "Zoekresultaten bijgewerkt",
            detail:
              "Geen exacte barcode of SKU gevonden. Kies het juiste product hieronder.",
          }
        : {
            tone: "warning",
            title: "Barcode of SKU niet gevonden",
            detail:
              "Controleer het label of voeg het product handmatig toe via de catalogus.",
          },
    );
    focusScanInput();
  };

  useEffect(() => {
    void hydrateProducts();
  }, [hydrateProducts]);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)");
    const update = () => setIsDesktop(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  // Presentation links can open a specific live screen directly, without
  // changing the normal in-app navigation for everyday use.
  useEffect(() => {
    const requestedView = new URLSearchParams(window.location.search).get(
      "view",
    );
    const allowedViews = [
      "pos",
      "insights",
      "z-report",
      "audit-log",
      "admin",
      "customers",
      "profile",
    ];
    if (requestedView && allowedViews.includes(requestedView)) {
      setMainView(requestedView as typeof mainView);
    }
  }, [setMainView]);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  useEffect(() => {
    if (mainView !== "pos") return;
    focusScanInput();
  }, [mainView]);

  useEffect(() => {
    if (!scanFeedback) return;
    const timer = window.setTimeout(() => setScanFeedback(null), 2600);
    return () => window.clearTimeout(timer);
  }, [scanFeedback]);

  useEffect(() => {
    const handleGlobalHotkeys = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (mainView !== "pos") setMainView("pos");
        focusScanInput();
        return;
      }

      if (event.altKey && !isEditableTarget(event.target)) {
        if (event.key === "1") {
          event.preventDefault();
          setMainView("pos");
          setIsNavDropdownOpen(false);
        } else if (event.key === "2") {
          event.preventDefault();
          setMainView("z-report");
          setIsNavDropdownOpen(false);
        } else if (event.key === "3") {
          event.preventDefault();
          setMainView("audit-log");
          setIsNavDropdownOpen(false);
        } else if (event.key === "4") {
          event.preventDefault();
          setMainView("customers");
          setIsNavDropdownOpen(false);
        } else if (event.key === "5") {
          event.preventDefault();
          setMainView("insights");
          setIsNavDropdownOpen(false);
        } else if (
          event.key === "6" &&
          (currentRole === "owner" || currentRole === "manager")
        ) {
          event.preventDefault();
          setMainView("admin");
          setIsNavDropdownOpen(false);
        }
      }
    };

    window.addEventListener("keydown", handleGlobalHotkeys);
    return () => window.removeEventListener("keydown", handleGlobalHotkeys);
  }, [mainView, setMainView, currentRole]);

  useEffect(() => {
    if (mainView !== "pos") return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        document.querySelector('[role="dialog"][aria-modal="true"]') ||
        isEditableTarget(event.target) ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      ) {
        return;
      }

      if (event.key === "Escape" || event.key === "Tab") {
        scanBufferRef.current = "";
        lastScanKeyAtRef.current = 0;
        return;
      }

      if (event.key === "Enter") {
        const bufferedCode = scanBufferRef.current.trim();
        const gap = event.timeStamp - lastScanKeyAtRef.current;
        scanBufferRef.current = "";
        lastScanKeyAtRef.current = 0;

        if (
          bufferedCode.length >= SCAN_MIN_LENGTH &&
          gap <= SCAN_SUBMIT_GAP_MS
        ) {
          event.preventDefault();
          submitProductQuery(bufferedCode);
        }
        return;
      }

      if (event.key.length !== 1 || /\s/.test(event.key)) {
        return;
      }

      const gap = event.timeStamp - lastScanKeyAtRef.current;
      if (gap > SCAN_RESET_MS) {
        scanBufferRef.current = "";
      }

      scanBufferRef.current += event.key;
      lastScanKeyAtRef.current = event.timeStamp;
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [mainView, submitProductQuery]);

  return (
    <div className="flex flex-col h-screen w-full bg-slate-100 overflow-hidden font-sans text-slate-900 selection:bg-sky-500/20">
      <header className="pos-topbar flex h-16 items-center justify-between px-3 sm:px-7 print:hidden shrink-0 gap-2 sm:gap-4 z-30">
        {/* Zone A: Official Crisp Brand Logo */}
        <div
          className="flex items-center select-none shrink-0"
          aria-label="Pwayment retail"
        >
          <img
            src="/branding/pwayment-logo.svg"
            alt="Pwayment"
            className="hidden h-7 w-auto object-contain sm:block"
          />
          <img
            src="/branding/pwayment-mark.svg"
            alt="Pwayment"
            className="block h-8 w-8 object-contain sm:hidden"
          />
        </div>

        <nav className="pos-main-nav flex items-center gap-1 mx-auto">
          {[
            {
              view: "pos" as const,
              label: "Kassa",
              Icon: Monitor,
              title: "Kassa (Alt+1)",
            },
            {
              view: "z-report" as const,
              label: "Dagafsluiting",
              Icon: FileText,
              title: "Dagafsluiting (Alt+2)",
            },
            {
              view: "audit-log" as const,
              label: "Historiek",
              Icon: History,
              title: "Historiek (Alt+3)",
            },
            {
              view: "customers" as const,
              label: "Klanten",
              Icon: Users,
              title: "Klanten (Alt+4)",
            },
            {
              view: "insights" as const,
              label: "Inzichten",
              Icon: Lightbulb,
              title: "Inzichten (Alt+5)",
            },
            ...(canUseWebshop
              ? [
                  {
                    view: "profile" as const,
                    label: "Webshop",
                    Icon: ShoppingBag,
                    title: "Webshopbeheer",
                    profileTab: "webshop-general" as const,
                  },
                ]
              : []),
          ].map(({ view, label, Icon, title, profileTab }) => {
            const active =
              mainView === view &&
              (view !== "profile" || profileTab === profileInitialTarget.tab);
            return (
              <button
                key={view}
                onClick={() => {
                  if (profileTab) {
                    openProfile(profileTab);
                    return;
                  }
                  setMainView(view);
                }}
                title={title}
                aria-label={label}
                aria-current={active ? "page" : undefined}
                className={`pos-nav-item flex items-center gap-1.5 px-2.5 py-2 text-xs font-bold transition-colors duration-150 sm:px-3.5 ${active ? "pos-nav-item--active" : ""}`}
              >
                <Icon size={14} className="pos-nav-icon" />
                <span className="hidden sm:inline">{label}</span>
              </button>
            );
          })}
        </nav>

        {/* Zone C: Gebruikersbadge + Moderne Cogwheel Met Systeem/Profiel Popover Menu */}
        <div
          className="relative flex items-center gap-2 shrink-0"
          ref={userMenuRef}
        >
          <TrialStatus onOpenBilling={() => openProfile("billing")} />
          <div className="pos-user-badge hidden min-w-0 sm:flex flex-col items-start leading-tight px-2 py-1 select-none">
            <span className="flex max-w-48 items-center justify-start gap-1.5 text-xs font-bold text-slate-800">
              <span className="min-w-0 truncate">{currentUserName}</span>
              {activePlanBadge && (
                <span
                  className="pos-plan-chip"
                  title={activePlanTitle}
                >
                  {activePlanBadge}
                </span>
              )}
            </span>
            <span className="text-[9px] font-extrabold text-slate-600 uppercase tracking-wider">
              {
                { owner: "Eigenaar", manager: "Manager", cashier: "Kassier" }[
                  currentRole ?? "cashier"
                ]
              }
            </span>
          </div>

          {/* Moderne Cogwheel Knop */}
          <button
            ref={userMenuButtonRef}
            onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
            className={`pos-settings-button p-2 rounded-xl border transition-colors sm:p-2.5 ${
              isUserMenuOpen ? "pos-settings-button--active" : ""
            }`}
            title="Profiel & Instellingen"
            aria-label="Profiel en instellingen"
            aria-expanded={isUserMenuOpen}
            aria-haspopup="menu"
          >
            <Settings
              size={17}
              className={`transition-transform duration-200 ${isUserMenuOpen ? "rotate-90" : ""}`}
            />
          </button>

          {/* Profiel & Systeem Dropdown Popover */}
          {isUserMenuOpen && (
            <div
              role="menu"
              aria-label="Gebruiker en apparaat"
              className="absolute right-0 top-full mt-2 w-64 rounded-2xl border border-slate-200/90 bg-white p-2 shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-150"
            >
              {/* Profile Card Header inside Dropdown */}
              <div className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-100 rounded-xl mb-1.5">
                <div className="h-9 w-9 rounded-full bg-sky-100 text-sky-700 font-extrabold text-sm flex items-center justify-center border border-sky-200 shrink-0">
                  {currentUserName
                    ? currentUserName.charAt(0).toUpperCase()
                    : "U"}
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-bold text-slate-900 truncate">
                    {currentUserName}
                  </span>
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                    Rol:{" "}
                    {
                      {
                        owner: "Eigenaar",
                        manager: "Manager",
                        cashier: "Kassier",
                      }[currentRole ?? "cashier"]
                    }
                  </span>
                </div>
              </div>

              <div className="px-2 py-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                Gebruiker & Apparaat
              </div>

              {/* Instellingen Pagina Link */}
              <button
                role="menuitem"
                onClick={() => {
                  openProfile("billing");
                  setIsUserMenuOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors"
              >
                <Settings size={15} className="text-slate-500" />
                <span>Instellingen</span>
              </button>

              {/* Volledig Scherm Toggle */}
              <button
                role="menuitem"
                onClick={() => {
                  // Close menu first via micro-delay so the re-render doesn't cancel the gesture
                  setTimeout(() => setIsUserMenuOpen(false), 0);
                  if (!document.fullscreenElement) {
                    document.documentElement
                      .requestFullscreen({ navigationUI: "hide" })
                      .catch((err) =>
                        console.error("Fullscreen error:", err.message),
                      );
                  } else {
                    document
                      .exitFullscreen()
                      .catch((err) =>
                        console.error("Exit fullscreen error:", err.message),
                      );
                  }
                }}
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  {isFullscreen ? (
                    <Minimize size={15} className="text-slate-500" />
                  ) : (
                    <Maximize size={15} className="text-slate-500" />
                  )}
                  <span>Volledig Scherm</span>
                </div>
                <span className="text-[10px] font-bold text-slate-400 uppercase">
                  {isFullscreen ? "AAN" : "UIT"}
                </span>
              </button>

              <div className="border-t border-slate-100 my-1" />

              {/* Afmelden / Logout */}
              <button
                role="menuitem"
                onClick={() => {
                  setIsUserMenuOpen(false);
                  void logout();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-red-600 hover:bg-red-50 transition-colors"
              >
                <LogOut size={15} className="text-red-500" />
                <span>Afmelden</span>
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Barcode Scan Feedback Toast Overlay */}
      {scanFeedback && (
        <div className="px-4 py-2 bg-white border-b border-slate-200 print:hidden z-10">
          <div
            role={scanFeedback.tone === "warning" ? "alert" : "status"}
            aria-live={scanFeedback.tone === "warning" ? "assertive" : "polite"}
            className={`max-w-4xl mx-auto flex items-start gap-2.5 rounded-xl border px-3.5 py-2 text-sm shadow-xs ${
              scanFeedback.tone === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                : scanFeedback.tone === "info"
                  ? "border-sky-200 bg-sky-50 text-sky-900"
                  : "border-amber-200 bg-amber-50 text-amber-900"
            }`}
          >
            {scanFeedback.tone === "success" ? (
              <CheckCircle2
                size={18}
                className="text-emerald-600 shrink-0 mt-0.5"
              />
            ) : (
              <AlertCircle
                size={18}
                className="text-amber-600 shrink-0 mt-0.5"
              />
            )}
            <div>
              <div className="font-semibold text-xs sm:text-sm">
                {scanFeedback.title}
              </div>
              <div className="text-xs opacity-90 mt-0.5">
                {scanFeedback.detail}
              </div>
            </div>
          </div>
        </div>
      )}

      <React.Suspense fallback={<ViewLoading />}>
        {mainView === "z-report" && <ZReportView />}
        {mainView === "audit-log" && <AuditLog />}
        {mainView === "customers" && <Customers />}
        {mainView === "insights" && (
          <FeatureGate
            feature={FEATURE_KEYS.insights}
            title="Retail intelligence is beschikbaar in Retail Professional"
            description="Uw verkoop- en voorraaddata blijft veilig bewaard. Upgrade om prognoses, marges, klantinzichten en actieadviezen opnieuw te openen."
            onUpgrade={() => openProfile("billing")}
          >
            <Insights />
          </FeatureGate>
        )}
        {(mainView === "profile" || mainView === "admin") &&
          (currentRole === "owner" || currentRole === "manager" ? (
            <ProfileView
              initialTab={profileInitialTarget.tab}
              initialTabRequestKey={profileInitialTarget.requestKey}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center text-slate-500 font-medium">
              Onvoldoende rechten.
            </div>
          ))}
      </React.Suspense>

      {mainView === "pos" && (
        <div className="pos-workspace flex flex-col flex-1 overflow-hidden">
          {/* Ruime, Ergonomische Barcode Command & Search Bar in POS-Modus */}
          <div className="pos-command-bar px-4 sm:px-6 py-2.5 print:hidden shrink-0">
            <div className="flex items-center">
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  submitProductQuery();
                }}
                className="flex-1 flex items-center gap-2.5"
              >
                <div className="relative flex-1">
                  <ScanLine
                    size={20}
                    className="pos-command-icon absolute left-4 top-1/2 -translate-y-1/2"
                  />
                  <input
                    ref={scanInputRef}
                    type="search"
                    value={productQuery}
                    onChange={(event) => setProductQuery(event.target.value)}
                    placeholder="Scan barcode of zoek product op naam, SKU, categorie..."
                    aria-label="Scan barcode of zoek product"
                    className="pos-command-input w-full rounded-xl border pl-12 pr-24 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none font-semibold transition-all"
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                    <kbd className="hidden sm:inline-flex items-center px-2 py-0.5 text-[10px] font-bold text-slate-600 bg-slate-100 border border-slate-200 rounded-md shadow-sm">
                      ⌘K
                    </kbd>
                  </div>
                </div>
                <button
                  type="submit"
                  aria-label="Product zoeken"
                  className="pos-search-submit px-4 sm:px-5 py-2.5 text-white font-bold text-sm rounded-xl transition-colors whitespace-nowrap flex items-center gap-2"
                >
                  <Search size={16} />
                  <span className="hidden sm:inline">Zoek</span>
                </button>
              </form>
            </div>
          </div>

          <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
            {!isDesktop ? (
              <>
                <div className="flex-1 overflow-hidden">
                  {mobileView === "menu" && (
                    <Menu
                      query={productQuery}
                      onQueryChange={setProductQuery}
                    />
                  )}
                  {mobileView === "cart" && <Cart />}
                </div>

                <div className="flex bg-white border-t border-slate-200 pb-safe print:hidden shadow-lg">
                  <button
                    onClick={() => setMobileView("menu")}
                    className={`flex-1 py-3 flex flex-col items-center gap-1 ${
                      mobileView === "menu"
                        ? "text-sky-600 font-bold"
                        : "text-slate-400"
                    }`}
                  >
                    <ScanLine size={20} />
                    <span className="text-[10px] uppercase tracking-wider">
                      Catalogus
                    </span>
                  </button>
                  <button
                    onClick={() => setMobileView("cart")}
                    className={`flex-1 py-3 flex flex-col items-center gap-1 relative ${
                      mobileView === "cart"
                        ? "text-sky-600 font-bold"
                        : "text-slate-400"
                    }`}
                  >
                    <ShoppingCart size={20} />
                    <span className="text-[10px] uppercase tracking-wider">
                      Kassa
                    </span>
                    {cartCount > 0 && (
                      <span className="absolute top-2 right-1/4 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                        {cartCount}
                      </span>
                    )}
                  </button>
                </div>
              </>
            ) : (
              <div className="flex min-w-0 w-full h-full">
                <div className="min-w-0 flex-1 h-full border-r border-slate-200">
                  <Menu query={productQuery} onQueryChange={setProductQuery} />
                </div>
                <div className="w-[32%] lg:w-[28%] shrink-0 h-full">
                  <Cart />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
