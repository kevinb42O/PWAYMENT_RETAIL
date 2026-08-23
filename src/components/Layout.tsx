import React, { useEffect, useRef, useState } from "react";
import { useStore, type MainView } from "../store/useStore";
import { useAuth } from "../auth/useAuth";
import { useProducts } from "../store/useProducts";
import { matchesCatalogQuery } from "../utils/productLookup";
import { isValidReceiptBarcode } from "../utils/receiptBarcode";
import { FeatureGate } from "../billing/FeatureGate";
import { TrialStatus } from "../billing/TrialStatus";
import { FEATURE_KEYS, isFeatureEnabledForSnapshot, planLabel, useEntitlements, type FeatureKey } from "../billing/entitlements";
import { supabase } from "../lib/supabase";
import { useStoreConfiguration } from "../store/useStoreConfiguration";
import { useWorkforce } from "../store/useWorkforce";
import { Modal } from "./Modal";
import { StoreSetupGuide, type SetupGuideTarget } from "./StoreSetupGuide";
import { FirstProductTour } from "./FirstProductTour";
import { PaceAssistant } from "../pace/PaceAssistant";
import { getOutboxHealthMetadata } from "../services/platformTelemetry";
import { useMerchantProfile } from "../store/useMerchantProfile";
import { useCategories } from "../store/useCategories";
import { derivePaceSetupMilestones } from "../pace/setupMilestones";
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
  Wrench,
  CalendarClock,
  Cable,
  Maximize,
  Minimize,
  SlidersHorizontal,
  ChevronDown,
  KeyRound,
  LockKeyhole,
  ShieldCheck,
  RotateCcw,
  type LucideIcon,
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
const IntegrationHub = React.lazy(() =>
  import("./IntegrationHub").then((module) => ({ default: module.IntegrationHub })),
);
const ServiceDesk = React.lazy(() =>
  import("./ServiceDesk").then((module) => ({ default: module.ServiceDesk })),
);
const Workforce = React.lazy(() =>
  import("./Workforce").then((module) => ({ default: module.Workforce })),
);
const Menu = React.lazy(() =>
  import("./Menu").then((module) => ({ default: module.Menu })),
);
const Cart = React.lazy(() =>
  import("./Cart").then((module) => ({ default: module.Cart })),
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

interface NavigationItem {
  view: MainView;
  label: string;
  Icon: LucideIcon;
  title: string;
  profileTab?: "webshop-general";
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
  const { currentUserName, currentRole, currentStoreId, logout, verifyCurrentOwnerPin } = useAuth();
  const verifyApprovalPin = useWorkforce((state) => state.verifyApprovalPin);
  const workforceMutating = useWorkforce((state) => state.mutating);
  const refreshEntitlements = useEntitlements((state) => state.load);
  const entitlementSnapshot = useEntitlements((state) => state.snapshot);
  const products = useProducts((s) => s.list);
  const hydrateProducts = useProducts((s) => s.hydrate);
  const modulePreferences = useStoreConfiguration(
    (state) => state.configuration.modules,
  );
  const firstRunCompleted = useStoreConfiguration(
    (state) => state.configuration.firstRunCompleted,
  );
  const storeConfiguration = useStoreConfiguration((state) => state.configuration);
  const merchantProfile = useMerchantProfile((state) => state.profile);
  const categories = useCategories((state) => state.list);
  const hydrateCategories = useCategories((state) => state.hydrate);

  const [productQuery, setProductQuery] = useState("");
  const [scanFeedback, setScanFeedback] = useState<ScanFeedback | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(
    () => window.matchMedia("(min-width: 768px)").matches,
  );
  const [isNavDropdownOpen, setIsNavDropdownOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [openAuditLogAtReturnSearch, setOpenAuditLogAtReturnSearch] =
    useState(false);
  const [profileInitialTarget, setProfileInitialTarget] = useState<{
    tab: "billing" | "webshop-general" | "modules" | "workforce" | "leave-approvals" | "catalog-products" | "catalog-categories" | "labels";
    requestKey: number;
    openNewProductRequestKey?: number;
  }>({ tab: "billing", requestKey: 0 });
  const [storeSetupOpen, setStoreSetupOpen] = useState(false);
  const [storeSetupTarget, setStoreSetupTarget] = useState<SetupGuideTarget | null>(null);
  const [firstProductTourName, setFirstProductTourName] = useState<string | null>(null);
  const [leaveApprovalGateOpen, setLeaveApprovalGateOpen] = useState(false);
  const [leaveApprovalPin, setLeaveApprovalPin] = useState("");
  const [leaveApprovalGateError, setLeaveApprovalGateError] = useState<string | null>(null);
  const [paceConnection, setPaceConnection] = useState(() => ({
    online: navigator.onLine !== false,
    pendingSync: 0,
  }));

  const scanInputRef = useRef<HTMLInputElement | null>(null);
  const scanBufferRef = useRef("");
  const lastScanKeyAtRef = useRef(0);
  const navDropdownRef = useRef<HTMLDivElement | null>(null);
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const userMenuButtonRef = useRef<HTMLButtonElement | null>(null);

  const cartCount = cart.orders.reduce((acc, o) => acc + o.quantity, 0);
  const paceSetupMilestones = React.useMemo(
    () => derivePaceSetupMilestones({ configuration: storeConfiguration, profile: merchantProfile, categories, products }),
    [categories, merchantProfile, products, storeConfiguration],
  );

  useEffect(() => {
    void hydrateCategories();
  }, [hydrateCategories]);
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
  // Saved module preferences are only a merchant preference. Entitlements are
  // authoritative: never advertise a module that this tenant cannot use.
  const canOpenFeature = (feature: FeatureKey) =>
    isFeatureEnabledForSnapshot(entitlementSnapshot, feature);
  const workforceApprovalAvailable = currentRole === "owner"
    && modulePreferences.workforce
    && isFeatureEnabledForSnapshot(entitlementSnapshot, FEATURE_KEYS.workforce);

  const openProfile = (
    tab: "billing" | "webshop-general" | "modules" | "workforce" | "leave-approvals" | "catalog-products" | "catalog-categories" | "labels" = "billing",
  ) => {
    setProfileInitialTarget((current) => ({
      tab,
      requestKey: current.requestKey + 1,
    }));
    setMainView("profile");
  };
  const openProductSetup = () => {
    setProfileInitialTarget((current) => ({
      tab: "catalog-products",
      requestKey: current.requestKey + 1,
      openNewProductRequestKey: current.requestKey + 1,
    }));
    setMainView("profile");
  };
  const openCategorySetup = () => {
    setProfileInitialTarget((current) => ({
      tab: "catalog-categories",
      requestKey: current.requestKey + 1,
    }));
    setMainView("profile");
  };
  const openBarcodeLabelSetup = () => openProfile("labels");
  const openImportSetup = () => setMainView("integration-hub");
  const approvalStoreId = currentStoreId ?? (import.meta.env.VITE_E2E_BUILD === "true" ? "fixture-store" : null);
  const openLeaveApprovalGate = () => {
    setIsUserMenuOpen(false);
    setLeaveApprovalPin("");
    setLeaveApprovalGateError(null);
    setLeaveApprovalGateOpen(true);
  };

  const navigationItems = React.useMemo<NavigationItem[]>(
    () => [
      { view: "pos", label: "Kassa", Icon: Monitor, title: "Kassa (Alt+1)" },
      { view: "z-report", label: "Dagafsluiting", Icon: FileText, title: "Dagafsluiting (Alt+2)" },
      // Historiek is a core POS workspace, never a plan- or preference-based
      // navigation item. Plans can limit retention and audit access inside it,
      // but may not make the tab disappear.
      { view: "audit-log" as const, label: "Historiek", Icon: History, title: "Historiek (Alt+3)" },
      ...(modulePreferences.customers && canOpenFeature(FEATURE_KEYS.customerCrm)
        ? [{ view: "customers" as const, label: "Klanten", Icon: Users, title: "Klanten (Alt+4)" }]
        : []),
      ...(modulePreferences.service && canOpenFeature(FEATURE_KEYS.serviceOrders)
        ? [{ view: "service" as const, label: "Herstellingen", Icon: Wrench, title: "Hersteldienst" }]
        : []),
      ...(modulePreferences.workforce && canOpenFeature(FEATURE_KEYS.workforce)
        ? [{ view: "workforce" as const, label: "Personeel & verlof", Icon: CalendarClock, title: "Personeel, werkuren en verlof" }]
        : []),
      ...((currentRole === "owner" || currentRole === "manager") && modulePreferences.catalog && canOpenFeature(FEATURE_KEYS.integrations)
        ? [{ view: "integration-hub" as const, label: "Integration Hub", Icon: Cable, title: "Integration Hub" }]
        : []),
      ...(modulePreferences.insights && canOpenFeature(FEATURE_KEYS.insights)
        ? [{ view: "insights" as const, label: "Inzichten", Icon: Lightbulb, title: "Inzichten (Alt+5)" }]
        : []),
      ...(modulePreferences.webshop && canOpenFeature(FEATURE_KEYS.webshopPublish)
        ? [{ view: "profile" as const, label: "Webshop", Icon: ShoppingBag, title: "Webshopbeheer", profileTab: "webshop-general" as const }]
        : []),
    ],
    [currentRole, modulePreferences, entitlementSnapshot],
  );

  const isNavigationItemActive = (item: NavigationItem): boolean =>
    mainView === item.view &&
    (item.view !== "profile" || item.profileTab === profileInitialTarget.tab);

  const activeNavigationItem =
    navigationItems.find(isNavigationItemActive) ?? navigationItems[0];
  const ActiveNavigationIcon = activeNavigationItem.Icon;

  const openNavigationItem = (item: NavigationItem) => {
    if (item.view === "audit-log") setOpenAuditLogAtReturnSearch(false);
    if (item.profileTab) openProfile(item.profileTab);
    else setMainView(item.view);
    setIsNavDropdownOpen(false);
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

    if (isValidReceiptBarcode(value)) {
      setProductQuery("");
      setScanFeedback({
        tone: "info",
        title: "Ticketcode gescand",
        detail: "Dit is een kassaticket voor een retour. Gebruik de knop 'Retour' om het kassaticket op te zoeken.",
      });
      focusScanInput();
      return;
    }

    const result = scanCodeToCart(value);

    if (result.status === "matched" && result.product) {
      setProductQuery("");
      setScanFeedback({
        tone: "success",
        title: `${result.product.name} toegevoegd`,
        detail: `Direct toegevoegd via ${result.matchedOn === "sku" ? "SKU" : result.matchedOn === "identifier" ? "extra identificatie" : "barcode"} scan.`,
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
    const showFirstProductTour = (event: Event) => {
      const name = (event as CustomEvent<{ productName?: string }>).detail?.productName;
      if (name) setFirstProductTourName(name);
    };
    window.addEventListener("pwayment:first-product-ready", showFirstProductTour);
    return () => window.removeEventListener("pwayment:first-product-ready", showFirstProductTour);
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)");
    const update = () => setIsDesktop(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    let active = true;
    const refreshPaceConnection = async () => {
      const metadata = await getOutboxHealthMetadata().catch(() => ({
        queue_depth: 0,
        online: navigator.onLine !== false,
      }));
      if (!active) return;
      setPaceConnection({
        online: metadata.online !== false,
        pendingSync: metadata.queue_depth ?? 0,
      });
    };
    const onConnectionChange = () => void refreshPaceConnection();
    void refreshPaceConnection();
    window.addEventListener("online", onConnectionChange);
    window.addEventListener("offline", onConnectionChange);
    const interval = window.setInterval(refreshPaceConnection, 30_000);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("online", onConnectionChange);
      window.removeEventListener("offline", onConnectionChange);
    };
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
      "service",
      "workforce",
      "integration-hub",
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
    const hiddenView =
      (mainView === "customers" && (!modulePreferences.customers || !canOpenFeature(FEATURE_KEYS.customerCrm))) ||
      (mainView === "service" && (!modulePreferences.service || !canOpenFeature(FEATURE_KEYS.serviceOrders))) ||
      (mainView === "workforce" && (!modulePreferences.workforce || !canOpenFeature(FEATURE_KEYS.workforce))) ||
      (mainView === "integration-hub" && (!modulePreferences.catalog || !canOpenFeature(FEATURE_KEYS.integrations))) ||
      (mainView === "insights" && (!modulePreferences.insights || !canOpenFeature(FEATURE_KEYS.insights)));
    if (hiddenView) setMainView("pos");
  }, [mainView, modulePreferences, entitlementSnapshot, setMainView]);

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
          setOpenAuditLogAtReturnSearch(false);
          setMainView("audit-log");
          setIsNavDropdownOpen(false);
        } else if (event.key === "4" && modulePreferences.customers && canOpenFeature(FEATURE_KEYS.customerCrm)) {
          event.preventDefault();
          setMainView("customers");
          setIsNavDropdownOpen(false);
        } else if (event.key === "5" && modulePreferences.insights && canOpenFeature(FEATURE_KEYS.insights)) {
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
  }, [mainView, setMainView, currentRole, modulePreferences]);

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
      <header className="pos-topbar relative flex h-16 items-center justify-between px-3 sm:px-7 print:hidden shrink-0 gap-2 sm:gap-4 z-50">
        {/* Zone A: Official Crisp Brand Logo */}
        <div
          className="flex items-center select-none shrink-0"
          aria-label="Pwayment retail"
        >
          <div className="pos-brand-lockup hidden sm:flex">
            <img
              src="/branding/PWAYMENTLOGOFINAL.png"
              alt="Pwayment"
              className="h-6 w-auto object-contain"
            />
            {activePlanBadge && (
              <button
                type="button"
                className="pos-brand-plan"
                title={`${activePlanTitle}. Bekijk plan en facturatie.`}
                onClick={() => openProfile("billing")}
              >
                {activePlanBadge}
              </button>
            )}
          </div>
          <img
            src="/branding/PWAYMENTLOGOFINAL.png"
            alt="Pwayment"
            className="block h-8 w-8 object-contain sm:hidden"
          />
        </div>

        <nav className="pos-main-nav mx-auto hidden items-center gap-1 md:flex" aria-label="Hoofdnavigatie">
          {navigationItems.map((item) => {
            const active = isNavigationItemActive(item);
            return (
              <button
                key={`${item.view}-${item.profileTab ?? "main"}`}
                onClick={() => openNavigationItem(item)}
                title={item.title}
                aria-label={item.label}
                aria-current={active ? "page" : undefined}
                className={`pos-nav-item flex items-center gap-1.5 px-2.5 py-2 text-xs font-bold transition-colors duration-150 lg:px-3 ${active ? "pos-nav-item--active" : ""}`}
              >
                <item.Icon size={14} className="pos-nav-icon" />
                <span className="hidden xl:inline">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="relative mx-auto md:hidden" ref={navDropdownRef}>
          <button
            type="button"
            onClick={() => setIsNavDropdownOpen((open) => !open)}
            className="pos-nav-item pos-nav-item--active flex max-w-44 items-center gap-2 px-3 py-2 text-xs font-extrabold"
            aria-label="Navigatie openen"
            aria-expanded={isNavDropdownOpen}
          >
            <ActiveNavigationIcon size={15} />
            <span className="truncate">{activeNavigationItem.label}</span>
            <ChevronDown size={14} className={`shrink-0 transition-transform ${isNavDropdownOpen ? "rotate-180" : ""}`} />
          </button>
          {isNavDropdownOpen && (
            <div className="absolute left-1/2 top-full z-[60] mt-2 w-64 -translate-x-1/2 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl" role="menu">
              {navigationItems.map((item) => {
                const active = isNavigationItemActive(item);
                return (
                  <button
                    key={`${item.view}-${item.profileTab ?? "main"}-mobile`}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setIsNavDropdownOpen(false);
                      openNavigationItem(item);
                    }}
                    className={`flex w-full items-center gap-2.5 px-3 py-2 text-xs font-bold transition-colors ${active ? "bg-sky-50 text-sky-800" : "text-slate-700 hover:bg-slate-50"}`}
                  >
                    <item.Icon size={15} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Zone C: Gebruikersbadge + Moderne Cogwheel Met Systeem/Profiel Popover Menu */}
        <div
          className="relative flex items-center gap-2 shrink-0"
          ref={userMenuRef}
        >
          <TrialStatus onOpenBilling={() => openProfile("billing")} />
          <PaceAssistant
            view={mainView}
            role={currentRole}
            userName={currentUserName}
            productCount={products.length}
            cartCount={cartCount}
            firstRunCompleted={firstRunCompleted}
            online={paceConnection.online}
            pendingSync={paceConnection.pendingSync}
            setupMilestones={paceSetupMilestones}
            suppressed={storeSetupOpen || Boolean(firstProductTourName) || leaveApprovalGateOpen}
            onNavigate={(view) => setMainView(view)}
            onOpenSetup={() => setStoreSetupOpen(true)}
            onOpenProfile={(tab) => openProfile(tab)}
            onOpenMilestone={(milestone) => {
              if (milestone.action === "setup") setStoreSetupOpen(true);
              if (milestone.action === "categories") openCategorySetup();
              if (milestone.action === "products") openProductSetup();
              if (milestone.action === "labels") openBarcodeLabelSetup();
            }}
          />
          <div className="pos-user-badge hidden min-w-0 sm:flex flex-col items-start leading-tight px-2 py-1 select-none">
            <span className="flex max-w-48 items-center justify-start text-xs font-bold text-slate-800">
              <span className="min-w-0 truncate">{currentUserName}</span>
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
              className="absolute right-0 top-full mt-2 w-64 rounded-2xl border border-slate-200/90 bg-white p-2 shadow-2xl z-[60] animate-in fade-in zoom-in-95 duration-150"
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

              {currentRole === "owner" && (
                <button
                  role="menuitem"
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    openProfile("modules");
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-sky-50 hover:text-sky-800 transition-colors"
                >
                  <SlidersHorizontal size={15} className="text-sky-600" />
                  <span>Modules & navigatie</span>
                </button>
              )}

              {workforceApprovalAvailable && (
                <button
                  role="menuitem"
                  onClick={openLeaveApprovalGate}
                  className="w-full flex items-center justify-between gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-cyan-50 hover:text-cyan-800 transition-colors"
                >
                  <span className="flex items-center gap-2.5"><ShieldCheck size={15} className="text-cyan-700" /><span>Verlof goedkeuren</span></span>
                  <span className="text-[9px] font-extrabold uppercase tracking-wide text-cyan-700">PIN</span>
                </button>
              )}

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

      <main className="app-standard flex-1 min-h-0 relative flex flex-col overflow-hidden">
        <React.Suspense fallback={<ViewLoading />}>
          {mainView === "z-report" && <ZReportView />}
          {mainView === "audit-log" && (
            <AuditLog
              canViewFullHistory={canOpenFeature(FEATURE_KEYS.fullHistory)}
              canViewAuditLog={canOpenFeature(FEATURE_KEYS.auditViewer)}
              initialReturnSearch={openAuditLogAtReturnSearch}
            />
          )}
          {mainView === "customers" && (
            <FeatureGate
              feature={FEATURE_KEYS.customerCrm}
              title="Klantenbeheer is beschikbaar in Retail Professional"
              onUpgrade={() => openProfile("billing")}
            >
              <Customers />
            </FeatureGate>
          )}
          {mainView === "service" && (
            <FeatureGate
              feature={FEATURE_KEYS.serviceOrders}
              title="ServiceDesk is beschikbaar in Retail Professional"
              description="Herstelgegevens blijven bewaard. Retail Professional ontgrendelt intake, opvolging en klanttracking."
              onUpgrade={() => openProfile("billing")}
            >
              <ServiceDesk />
            </FeatureGate>
          )}
          {mainView === "workforce" && (
            <FeatureGate
              feature={FEATURE_KEYS.workforce}
              title="Personeel en verlof is niet actief in dit abonnement"
              description="Werkuren, verlofsaldi en aanvragen blijven veilig bewaard. Pas uw abonnement aan om deze module opnieuw te openen."
              onUpgrade={() => openProfile("billing")}
            >
              <Workforce />
            </FeatureGate>
          )}
          {mainView === "integration-hub" &&
            (currentRole === "owner" || currentRole === "manager" ? (
              <FeatureGate
                feature={FEATURE_KEYS.integrations}
                title="Integration Hub is beschikbaar in Retail Professional"
                onUpgrade={() => openProfile("billing")}
              >
                <IntegrationHub />
              </FeatureGate>
            ) : (
              <div className="flex-1 flex items-center justify-center text-slate-500 font-medium">
                Onvoldoende rechten.
              </div>
            ))}
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
                openNewProductRequestKey={profileInitialTarget.openNewProductRequestKey}
                setupHighlightTarget={storeSetupTarget}
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
                {(currentRole === "owner" || currentRole === "manager") && (
                  <button
                    type="button"
                    onClick={() => {
                      setOpenAuditLogAtReturnSearch(true);
                      setMainView("audit-log");
                    }}
                    className="ml-2 inline-flex shrink-0 items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm font-bold text-amber-900 hover:bg-amber-100"
                    title="Zoek een verkoop om manueel te retourneren"
                  >
                    <RotateCcw size={16} />
                    <span className="hidden lg:inline">Retour</span>
                  </button>
                )}
              </div>
            </div>

            <React.Suspense fallback={<ViewLoading />}>
            <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
              {!isDesktop ? (
                <>
                  <div className="flex-1 overflow-hidden">
                    {mobileView === "menu" && (
                      <Menu
                        query={productQuery}
                        onQueryChange={setProductQuery}
                        onStartStoreSetup={() => setStoreSetupOpen(true)}
                        onAddCategory={openCategorySetup}
                        onImportProducts={openImportSetup}
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
                    <Menu
                      query={productQuery}
                      onQueryChange={setProductQuery}
                      onStartStoreSetup={() => setStoreSetupOpen(true)}
                      onAddCategory={openCategorySetup}
                      onImportProducts={openImportSetup}
                    />
                  </div>
                  <div className="w-[32%] lg:w-[28%] shrink-0 h-full">
                    <Cart />
                  </div>
                </div>
              )}
            </div>
            </React.Suspense>
          </div>
        )}
      </main>
      {(currentRole === "owner" || currentRole === "manager") && (
        <StoreSetupGuide
          open={storeSetupOpen}
          onClose={() => setStoreSetupOpen(false)}
          onAddCategories={openCategorySetup}
          onAddProduct={openProductSetup}
          onImportProducts={openImportSetup}
          onOpenBarcodeLabels={openBarcodeLabelSetup}
          onTargetChange={setStoreSetupTarget}
        />
      )}
      {firstProductTourName && (
        <FirstProductTour
          productName={firstProductTourName}
          onClose={() => setFirstProductTourName(null)}
          onOpenPos={() => setMainView("pos")}
          onOpenCatalog={() => openProfile("catalog-products")}
        />
      )}
      {leaveApprovalGateOpen && <Modal open onClose={() => setLeaveApprovalGateOpen(false)} title="Eigenaarstoegang bevestigen" subtitle="Verlofgoedkeuring is alleen voor de zaakvoerder." icon={<ShieldCheck size={18} />} size="sm" closeOnBackdrop><div className="space-y-4"><div className="rounded-xl border border-cyan-100 bg-cyan-50 p-3 text-xs leading-5 text-cyan-950"><p className="font-bold">Je opent de beveiligde verlofinbox.</p><p className="mt-1">Medewerkers en planners hebben hier geen toegang. Voer je persoonlijke goedkeurings-PIN in om verder te gaan.</p></div><label className="block text-xs font-bold text-slate-700"><span className="flex items-center gap-1.5"><KeyRound size={14} /> Persoonlijke PIN</span><input aria-label="Eigenaar PIN voor verlofgoedkeuring" type="password" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={leaveApprovalPin} onChange={(event) => { setLeaveApprovalPin(event.target.value.replace(/\D/g, "")); setLeaveApprovalGateError(null); }} placeholder="6 cijfers" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100" /></label>{leaveApprovalGateError && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800">{leaveApprovalGateError}</p>}<div className="flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={() => setLeaveApprovalGateOpen(false)} className="inline-flex h-9 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50">Annuleren</button><button type="button" disabled={workforceMutating || leaveApprovalPin.length !== 6} onClick={async () => { if (!approvalStoreId) return; const verified = import.meta.env.VITE_E2E_BUILD === "true" ? await verifyCurrentOwnerPin(leaveApprovalPin) : await verifyApprovalPin(approvalStoreId, leaveApprovalPin); if (!verified) { setLeaveApprovalGateError("De ingevoerde PIN is onjuist, geblokkeerd of nog niet ingesteld."); return; } setLeaveApprovalGateOpen(false); openProfile("leave-approvals"); }} className="inline-flex h-9 items-center gap-2 rounded-lg border border-cyan-200 bg-cyan-50 px-3 text-xs font-bold text-cyan-800 hover:bg-cyan-100 disabled:opacity-50"><LockKeyhole size={14} /> Verlofinbox openen</button></div></div></Modal>}
    </div>
  );
};
