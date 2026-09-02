import React, { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useStore, type MainView } from "../store/useStore";
import { useAuth } from "../auth/useAuth";
import { usePosAccess } from "../pos-access/usePosAccess";
import { useProducts } from "../store/useProducts";
import { matchesCatalogQuery } from "../utils/productLookup";
import { isValidReceiptBarcode, normalizeReceiptBarcode } from "../utils/receiptBarcode";
import { FeatureGate } from "../billing/FeatureGate";
import { TrialStatus } from "../billing/TrialStatus";
import { FEATURE_KEYS, isFeatureEnabledForSnapshot, useEntitlements, type FeatureKey } from "../billing/entitlements";
import { supabase } from "../lib/supabase";
import { useStoreConfiguration } from "../store/useStoreConfiguration";
import { usePlatformFeatureFlag } from "../billing/usePlatformFeatureFlag";
import { canOpenInventoryWorkspace, inventoryWorkspaceBuildDefault } from "../inventory/access";
import { useWorkforce } from "../store/useWorkforce";
import { Modal } from "./Modal";
import { ThemeToggle } from "./ThemeToggle";
import { StoreSetupGuide, type SetupGuideTarget } from "./StoreSetupGuide";
import { FirstProductTour } from "./FirstProductTour";
import { PaceAssistant } from "../pace/PaceAssistant";
import { useCustomerInsights } from "../pace/useCustomerInsights";
import { useCustomers } from "../store/useCustomers";
import { getOutboxHealthMetadata } from "../services/platformTelemetry";
import { liveQuery } from "dexie";
import { useMerchantProfile } from "../store/useMerchantProfile";
import { useCategories } from "../store/useCategories";
import {
  derivePaceSetupMilestones,
  hasEstablishedCatalog,
  paceSetupProgress,
  type PaceMilestoneId,
  type PaceSetupMilestone,
} from "../pace/setupMilestones";
import { getPrimaryPaceOutboxIssue } from "../pace/outboxIssue";
import { validatePaceDestination, type PaceDestination, type PaceDestinationAccess } from "../pace/paceDestinations";
import { playRegisterSound, unlockRegisterSounds } from "../sound/registerSounds";
import { projectCart } from "../customer-display/cartProjection";
import { formatEUR } from "../utils/money";
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
  PackageSearch,
  PanelRightOpen,
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
const InventoryWorkspace = React.lazy(() =>
  import("./InventoryWorkspace").then((module) => ({ default: module.InventoryWorkspace })),
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

interface CartFlight {
  id: number;
  productName: string;
  priceLabel: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
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
    cartDiscount,
    cartGiftCards,
    cartDocumentRequest,
    mainView,
    setMainView,
    scanCodeToCart,
  } = useStore();
  const { currentUserId, currentUserName, currentRole, currentStoreId, logout, verifyCurrentOwnerPin } = useAuth();
  const lockPos = usePosAccess((state) => state.lock);
  const posSessionToken = usePosAccess((state) => state.sessionToken);
  const canAccessOwnerSettings = currentRole === "owner"
    && Boolean(posSessionToken)
    && !posSessionToken?.startsWith("offline:");
  const verifyApprovalPin = useWorkforce((state) => state.verifyApprovalPin);
  const workforceMutating = useWorkforce((state) => state.mutating);
  const refreshEntitlements = useEntitlements((state) => state.load);
  const entitlementSnapshot = useEntitlements((state) => state.snapshot);
  const products = useProducts((s) => s.list);
  const hydrateProducts = useProducts((s) => s.hydrate);
  const modulePreferences = useStoreConfiguration(
    (state) => state.configuration.modules,
  );
  const inventoryWorkspaceEnabled = usePlatformFeatureFlag(
    "inventory_workspace",
    inventoryWorkspaceBuildDefault,
  );
  const firstRunCompleted = useStoreConfiguration(
    (state) => state.configuration.firstRunCompleted,
  );
  const storeConfiguration = useStoreConfiguration((state) => state.configuration);
  const merchantProfile = useMerchantProfile((state) => state.profile);
  const linkedCustomerId = useStore((state) => state.linkedCustomerId);
  const customers = useCustomers((state) => state.customers);
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
  const [desktopCartOpen, setDesktopCartOpen] = useState(false);
  const [desktopCartPinned, setDesktopCartPinned] = useState(false);
  const [cartFlights, setCartFlights] = useState<CartFlight[]>([]);
  const [cartArrivalNonce, setCartArrivalNonce] = useState(0);
  const [openAuditLogAtReturnSearch, setOpenAuditLogAtReturnSearch] =
    useState(false);
  const [returnReceiptBarcode, setReturnReceiptBarcode] = useState<string | null>(null);
  const [profileInitialTarget, setProfileInitialTarget] = useState<{
    tab: "billing" | "webshop-general" | "modules" | "pace" | "workforce" | "financial" | "leave-approvals" | "catalog-products" | "catalog-categories" | "labels" | "integrations" | "general" | "merchant";
    requestKey: number;
    openNewProductRequestKey?: number;
    catalogFilter?: { requestKey: number; productIds: string[]; label: string };
  }>({ tab: "billing", requestKey: 0 });
  const [storeSetupOpen, setStoreSetupOpen] = useState(false);
  const [storeSetupStartAt, setStoreSetupStartAt] = useState<PaceMilestoneId | "welcome">("welcome");
  const [storeSetupTarget, setStoreSetupTarget] = useState<SetupGuideTarget | null>(null);
  const [firstProductTourName, setFirstProductTourName] = useState<string | null>(null);
  const [leaveApprovalGateOpen, setLeaveApprovalGateOpen] = useState(false);
  const [leaveApprovalPin, setLeaveApprovalPin] = useState("");
  const [leaveApprovalGateError, setLeaveApprovalGateError] = useState<string | null>(null);
  const [paceConnection, setPaceConnection] = useState(() => ({
    online: navigator.onLine !== false,
    pendingSync: 0,
    retryingSync: 0,
    failedSync: 0,
    syncIssueSummary: undefined as string | undefined,
    syncIssueResolution: undefined as string | undefined,
  }));

  const scanInputRef = useRef<HTMLInputElement | null>(null);
  const scanBufferRef = useRef("");
  const lastScanKeyAtRef = useRef(0);
  const navDropdownRef = useRef<HTMLDivElement | null>(null);
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const userMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const previousDesktopCartCountRef = useRef(0);
  const desktopCartReceiptOpenRef = useRef(false);
  const desktopCartPanelRef = useRef<HTMLDivElement | null>(null);
  const desktopCartDockTargetRef = useRef<HTMLSpanElement | null>(null);
  const cartFlightSequenceRef = useRef(0);
  const cartFlightTimersRef = useRef(new Set<number>());

  const cartCount = cart.orders.reduce((acc, o) => acc + o.quantity, 0);
  const desktopCartVisible = desktopCartOpen || desktopCartPinned;
  const linkedCustomer = React.useMemo(
    () => customers.find((customer) => customer.id === linkedCustomerId),
    [customers, linkedCustomerId],
  );
  const compactCartTotal = React.useMemo(
    () => projectCart({
      orders: cart.orders,
      linkedCustomer,
      discountCents: cartDiscount?.amountCents ?? 0,
      giftCards: cartGiftCards,
    }).remainingCents,
    [cart.orders, cartDiscount?.amountCents, cartGiftCards, linkedCustomer],
  );

  const desktopCartPreferenceKey = `pwayment:desktop-cart-pinned:v1:${currentStoreId ?? "unscoped"}:${currentUserId ?? "anonymous"}`;

  const transitionDesktopCartLayout = React.useCallback((update: () => void) => {
    const root = document.documentElement;
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    if (!isDesktop || reducedMotion || root.classList.contains("pos-cart-layout-transitioning")) {
      update();
      return;
    }

    root.classList.add("pos-cart-layout-transitioning");

    if (!document.startViewTransition) {
      const visibleCards = Array.from(document.querySelectorAll<HTMLElement>(".pos-product-card"))
        .map((element) => ({ element, rect: element.getBoundingClientRect() }))
        .filter(({ rect }) => rect.bottom > 0 && rect.top < window.innerHeight);
      const panel = desktopCartPanelRef.current;
      const dock = document.querySelector<HTMLElement>(".pos-cart-dock");
      const oldPanelRect = panel?.getBoundingClientRect();
      const oldDockRect = dock?.getBoundingClientRect();

      const cloneVisibleRegion = (element: HTMLElement | null, rect?: DOMRect) => {
        if (!element || !rect || rect.width < 2 || rect.height < 2) return null;
        const clone = element.cloneNode(true) as HTMLElement;
        clone.setAttribute("aria-hidden", "true");
        clone.inert = true;
        Object.assign(clone.style, {
          position: "fixed",
          left: `${rect.left}px`,
          top: `${rect.top}px`,
          width: `${rect.width}px`,
          minWidth: `${rect.width}px`,
          height: `${rect.height}px`,
          margin: "0",
          zIndex: "90",
          pointerEvents: "none",
          transition: "none",
          viewTransitionName: "none",
        });
        document.body.appendChild(clone);
        return clone;
      };

      const oldPanelClone = cloneVisibleRegion(panel, oldPanelRect);
      const oldDockClone = cloneVisibleRegion(dock, oldDockRect);
      flushSync(update);

      const newPanelRect = panel?.getBoundingClientRect();
      const newDockRect = dock?.getBoundingClientRect();
      root.classList.remove("pos-cart-layout-transitioning");

      for (const { element, rect } of visibleCards) {
        const nextRect = element.getBoundingClientRect();
        if (nextRect.width < 2 || nextRect.height < 2) continue;
        const deltaX = rect.left - nextRect.left;
        const deltaY = rect.top - nextRect.top;
        const scaleX = rect.width / nextRect.width;
        const scaleY = rect.height / nextRect.height;
        if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5 && Math.abs(scaleX - 1) < 0.005) continue;
        element.style.setProperty("--pos-layout-delta-x", `${deltaX}px`);
        element.style.setProperty("--pos-layout-delta-y", `${deltaY}px`);
        element.style.setProperty("--pos-layout-scale-x", String(scaleX));
        element.style.setProperty("--pos-layout-scale-y", String(scaleY));
        element.classList.remove("pos-product-card--layout-moving");
        void element.offsetWidth;
        element.classList.add("pos-product-card--layout-moving");
        window.setTimeout(() => element.classList.remove("pos-product-card--layout-moving"), 340);
      }

      const animateRegionChange = (
        element: HTMLElement | null,
        oldRect: DOMRect | undefined,
        nextRect: DOMRect | undefined,
        oldClone: HTMLElement | null,
      ) => {
        const wasVisible = Boolean(oldRect && oldRect.width >= 2);
        const isVisible = Boolean(nextRect && nextRect.width >= 2);
        if (!wasVisible && isVisible && element) {
          element.classList.add("pos-cart-region--entering");
          window.setTimeout(() => element.classList.remove("pos-cart-region--entering"), 320);
        }
        if (wasVisible && !isVisible && oldClone) {
          oldClone.classList.add("pos-cart-region--leaving");
          window.setTimeout(() => oldClone.remove(), 280);
        } else {
          oldClone?.remove();
        }
      };

      animateRegionChange(panel, oldPanelRect, newPanelRect, oldPanelClone);
      animateRegionChange(dock, oldDockRect, newDockRect, oldDockClone);
      return;
    }

    const transition = document.startViewTransition(() => {
      flushSync(update);
    });
    void transition.finished.finally(() => {
      root.classList.remove("pos-cart-layout-transitioning");
    });
  }, [isDesktop]);

  useEffect(() => {
    try {
      setDesktopCartPinned(globalThis.localStorage?.getItem(desktopCartPreferenceKey) === "true");
    } catch {
      setDesktopCartPinned(false);
    }
    setDesktopCartOpen(false);
    desktopCartReceiptOpenRef.current = false;
  }, [desktopCartPreferenceKey]);

  useEffect(() => {
    try {
      globalThis.localStorage?.setItem(desktopCartPreferenceKey, String(desktopCartPinned));
    } catch {
      // The in-memory layout preference still works when storage is unavailable.
    }
  }, [desktopCartPinned, desktopCartPreferenceKey]);

  useEffect(() => {
    if (!desktopCartOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        transitionDesktopCartLayout(() => setDesktopCartOpen(false));
      }
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [desktopCartOpen, transitionDesktopCartLayout]);

  useEffect(() => {
    const previousCount = previousDesktopCartCountRef.current;
    previousDesktopCartCountRef.current = cartCount;
    if (
      previousCount > 0
      && cartCount === 0
      && !desktopCartPinned
      && !desktopCartReceiptOpenRef.current
    ) {
      transitionDesktopCartLayout(() => setDesktopCartOpen(false));
    }
  }, [cartCount, desktopCartPinned, transitionDesktopCartLayout]);

  useEffect(() => () => {
    for (const timer of cartFlightTimersRef.current) window.clearTimeout(timer);
    cartFlightTimersRef.current.clear();
  }, []);

  const showProductArrival = React.useCallback((feedback: {
    productName: string;
    priceCents: number;
    sourceRect: { left: number; top: number; width: number; height: number };
  }) => {
    if (!isDesktop) return;
    const panelCount = desktopCartPanelRef.current?.querySelector<HTMLElement>(".pos-cart-count");
    const target = desktopCartVisible ? panelCount : desktopCartDockTargetRef.current;
    if (!target) return;

    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) {
      setCartArrivalNonce((nonce) => nonce + 1);
      return;
    }

    const targetRect = target.getBoundingClientRect();
    const startX = feedback.sourceRect.left + feedback.sourceRect.width / 2;
    const startY = feedback.sourceRect.top + feedback.sourceRect.height / 2;
    const endX = targetRect.left + targetRect.width / 2;
    const endY = targetRect.top + targetRect.height / 2;
    const deltaX = endX - startX;
    const deltaY = endY - startY;
    const id = ++cartFlightSequenceRef.current;

    setCartFlights((flights) => [
      ...flights.slice(-5),
      {
        id,
        productName: feedback.productName,
        priceLabel: formatEUR(feedback.priceCents),
        startX,
        startY,
        endX: deltaX,
        endY: deltaY,
      },
    ]);

    const timer = window.setTimeout(() => {
      setCartFlights((flights) => flights.filter((flight) => flight.id !== id));
      if (target !== desktopCartDockTargetRef.current) {
        target.classList.remove("pos-cart-target-pop");
        void target.offsetWidth;
        target.classList.add("pos-cart-target-pop");
        window.setTimeout(() => target.classList.remove("pos-cart-target-pop"), 260);
      }
      setCartArrivalNonce((nonce) => nonce + 1);
      cartFlightTimersRef.current.delete(timer);
    }, 500);
    cartFlightTimersRef.current.add(timer);
  }, [desktopCartVisible, isDesktop]);
  const customerInsights = useCustomerInsights(
    linkedCustomerId,
    products,
    merchantProfile,
  );
  const paceSetupMilestones = React.useMemo(
    () => derivePaceSetupMilestones({ configuration: storeConfiguration, profile: merchantProfile, categories, products }),
    [categories, merchantProfile, products, storeConfiguration],
  );
  const setupProgress = React.useMemo(() => paceSetupProgress(paceSetupMilestones), [paceSetupMilestones]);
  const establishedCatalog = React.useMemo(
    () => hasEstablishedCatalog({ categories, products }),
    [categories, products],
  );

  useEffect(() => {
    void hydrateCategories();
  }, [hydrateCategories]);
  // Saved module preferences are only a merchant preference. Entitlements are
  // authoritative: never advertise a module that this tenant cannot use.
  const canOpenFeature = (feature: FeatureKey) =>
    isFeatureEnabledForSnapshot(entitlementSnapshot, feature);
  const inventoryWorkspaceAvailable = canOpenInventoryWorkspace({
    role: currentRole,
    moduleEnabled: modulePreferences.inventory,
    entitled: canOpenFeature(FEATURE_KEYS.inventoryOperations),
    platformEnabled: inventoryWorkspaceEnabled,
  });
  const workforceApprovalAvailable = currentRole === "owner"
    && modulePreferences.workforce
    && isFeatureEnabledForSnapshot(entitlementSnapshot, FEATURE_KEYS.workforce);

  const openProfile = (
    tab: "billing" | "webshop-general" | "modules" | "pace" | "workforce" | "financial" | "leave-approvals" | "catalog-products" | "catalog-categories" | "labels" | "integrations" | "general" | "merchant" = "billing",
  ) => {
    if (!canAccessOwnerSettings) {
      setScanFeedback({
        tone: "warning",
        title: currentRole === "owner" ? "Online verificatie vereist" : "Alleen voor de eigenaar",
        detail: currentRole === "owner"
          ? "Instellingen blijven gesloten tijdens een offline sessie. Maak verbinding en meld opnieuw aan."
          : "Vergrendel de kassa en laat de eigenaar aanmelden om instellingen te beheren.",
      });
      setMainView("pos");
      return;
    }
    setProfileInitialTarget((current) => ({
      tab,
      requestKey: current.requestKey + 1,
    }));
    setMainView("profile");
  };
  const startGuidedProductSetup = () => {
    setProfileInitialTarget((current) => ({
      tab: "catalog-products",
      requestKey: current.requestKey + 1,
      openNewProductRequestKey: current.requestKey + 1,
    }));
    setMainView("profile");
  };
  const openProductAdmin = () => openProfile("catalog-products");
  const openPaceCatalogFilter = (filter: { productIds: string[]; label: string }) => {
    setProfileInitialTarget((current) => {
      const requestKey = current.requestKey + 1;
      return {
        tab: "catalog-products",
        requestKey,
        catalogFilter: { requestKey, productIds: filter.productIds, label: filter.label },
      };
    });
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
  const openMilestoneDirectly = (milestone: PaceSetupMilestone) => {
    if (milestone.id === "profile") openProfile("general");
    else if (milestone.id === "identity") openProfile("merchant");
    else if (milestone.action === "categories") openCategorySetup();
    else if (milestone.action === "products") openProductAdmin();
    else if (milestone.action === "labels") openBarcodeLabelSetup();
  };
  const openGuidedSetup = (startAt: PaceMilestoneId | "welcome" = "welcome") => {
    setStoreSetupStartAt(startAt);
    setStoreSetupOpen(true);
  };
  const openSetupForCurrentStore = () => {
    if (establishedCatalog) {
      if (setupProgress.next) openMilestoneDirectly(setupProgress.next);
      return;
    }
    openGuidedSetup(setupProgress.next?.id ?? "welcome");
  };
  const openPaceDestination = (destination: PaceDestination): PaceDestinationAccess => {
    const access = validatePaceDestination(destination, currentRole);
    if (!access.allowed) return access;

    if (destination.type === "workspace") {
      if (destination.focus === "return-search") {
        setReturnReceiptBarcode(null);
        setOpenAuditLogAtReturnSearch(true);
      }
      if (destination.view === "pos" && destination.focus === "cart") {
        setMobileView("cart");
        if (isDesktop) transitionDesktopCartLayout(() => setDesktopCartOpen(true));
      }
      if (destination.view === "pos" && destination.focus === "product-search") setMobileView("menu");
      setMainView(destination.view);
      if (destination.view === "pos" && destination.focus === "product-search") focusScanInput();
    } else if (destination.type === "profile") {
      openProfile(destination.tab);
    } else if (destination.type === "catalog-selection") {
      openPaceCatalogFilter({ productIds: destination.productIds, label: destination.filterLabel });
    } else {
      openSetupForCurrentStore();
    }

    setScanFeedback({ tone: "info", title: `Pace opende ${destination.label}`, detail: destination.reason });
    return { allowed: true };
  };
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
      ...(inventoryWorkspaceAvailable
        ? [{ view: "inventory" as const, label: "Voorraad", Icon: PackageSearch, title: "Leveringen, tellingen en correcties" }]
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
      ...(currentRole === "owner" && modulePreferences.webshop && canOpenFeature(FEATURE_KEYS.webshopPublish)
        ? [{ view: "profile" as const, label: "Webshop", Icon: ShoppingBag, title: "Webshopbeheer", profileTab: "webshop-general" as const }]
        : []),
    ],
    [inventoryWorkspaceAvailable, modulePreferences, entitlementSnapshot],
  );

  const isNavigationItemActive = (item: NavigationItem): boolean =>
    mainView === item.view &&
    (item.view !== "profile" || item.profileTab === profileInitialTarget.tab);

  const activeNavigationItem =
    navigationItems.find(isNavigationItemActive) ?? navigationItems[0];
  const ActiveNavigationIcon = activeNavigationItem.Icon;

  useEffect(() => {
    const unlock = () => void unlockRegisterSounds();
    window.addEventListener("pointerdown", unlock, { once: true, capture: true });
    window.addEventListener("keydown", unlock, { once: true, capture: true });
    return () => {
      window.removeEventListener("pointerdown", unlock, true);
      window.removeEventListener("keydown", unlock, true);
    };
  }, []);

  const openNavigationItem = (item: NavigationItem) => {
    if (item.view === "audit-log") {
      setOpenAuditLogAtReturnSearch(false);
      setReturnReceiptBarcode(null);
    }
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
    if (!currentStoreId) return;
    const channel = supabase
      .channel(`webshop-sound:${currentStoreId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "webshop_orders",
          filter: `store_id=eq.${currentStoreId}`,
        },
        () => void playRegisterSound("webshop-order"),
      )
      .subscribe();
    const localOrderCreated = () => void playRegisterSound("webshop-order");
    const localChannel = typeof BroadcastChannel === "undefined"
      ? null
      : new BroadcastChannel("pwayment-webshop-orders");
    if (localChannel) {
      localChannel.onmessage = (event: MessageEvent<{ kind?: string }>) => {
        if (event.data?.kind === "created") void playRegisterSound("webshop-order");
      };
    }
    window.addEventListener("pwayment:webshop-order-created", localOrderCreated);
    return () => {
      window.removeEventListener("pwayment:webshop-order-created", localOrderCreated);
      localChannel?.close();
      void supabase.removeChannel(channel);
    };
  }, [currentStoreId]);

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
      if (currentRole !== "owner" && currentRole !== "manager") {
        setScanFeedback({
          tone: "warning",
          title: "Manager vereist voor retour",
          detail: "Het kassaticket is herkend. Laat een eigenaar of manager aanmelden om de retour te openen.",
        });
        focusScanInput();
        return;
      }
      setReturnReceiptBarcode(normalizeReceiptBarcode(value));
      setOpenAuditLogAtReturnSearch(false);
      setScanFeedback({
        tone: "info",
        title: "Kassaticket herkend",
        detail: "De oorspronkelijke verkoop en de beschikbare retourregels worden geopend.",
      });
      setMainView("audit-log");
      return;
    }

    const result = scanCodeToCart(value);

    if (result.status === "matched" && result.product) {
      const sourceRect = scanInputRef.current?.getBoundingClientRect();
      if (sourceRect) {
        showProductArrival({
          productName: result.product.name,
          priceCents: result.product.priceCents,
          sourceRect: {
            left: sourceRect.left,
            top: sourceRect.top,
            width: sourceRect.width,
            height: sourceRect.height,
          },
        });
      }
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
      const [metadata, issue] = await Promise.all([
        getOutboxHealthMetadata().catch(() => ({
        queue_depth: 0,
        online: navigator.onLine !== false,
        retrying_queue_depth: 0,
        dead_letter_queue_depth: 0,
        })),
        getPrimaryPaceOutboxIssue().catch(() => undefined),
      ]);
      if (!active) return;
      setPaceConnection({
        online: metadata.online !== false,
        pendingSync: metadata.queue_depth ?? 0,
        retryingSync: metadata.retrying_queue_depth ?? 0,
        failedSync: metadata.dead_letter_queue_depth ?? 0,
        syncIssueSummary: issue?.summary,
        syncIssueResolution: issue?.resolution,
      });
    };
    const onConnectionChange = () => void refreshPaceConnection();
    // Dexie emits whenever the worker claims, retries, delivers or dead-letters
    // a row. Pace should reflect that immediately instead of showing a stale
    // red queue card for up to thirty seconds after delivery completed.
    const subscription = liveQuery(async () => Promise.all([
      getOutboxHealthMetadata(),
      getPrimaryPaceOutboxIssue(),
    ])).subscribe({
      next: ([metadata, issue]) => {
        if (!active) return;
        setPaceConnection({
          online: navigator.onLine !== false,
          pendingSync: metadata.queue_depth ?? 0,
          retryingSync: metadata.retrying_queue_depth ?? 0,
          failedSync: metadata.dead_letter_queue_depth ?? 0,
          syncIssueSummary: issue?.summary,
          syncIssueResolution: issue?.resolution,
        });
      },
      error: () => void refreshPaceConnection(),
    });
    window.addEventListener("online", onConnectionChange);
    window.addEventListener("offline", onConnectionChange);
    return () => {
      active = false;
      subscription.unsubscribe();
      window.removeEventListener("online", onConnectionChange);
      window.removeEventListener("offline", onConnectionChange);
    };
  }, []);

  // Presentation links can open a specific live screen directly, without
  // changing the normal in-app navigation for everyday use.
  useEffect(() => {
    if (window.location.pathname === "/settings/pace") {
      setMainView("profile");
      return;
    }
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
      "inventory",
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
      (mainView === "inventory" && !inventoryWorkspaceAvailable) ||
      (mainView === "service" && (!modulePreferences.service || !canOpenFeature(FEATURE_KEYS.serviceOrders))) ||
      (mainView === "workforce" && (!modulePreferences.workforce || !canOpenFeature(FEATURE_KEYS.workforce))) ||
      (mainView === "integration-hub" && (!modulePreferences.catalog || !canOpenFeature(FEATURE_KEYS.integrations))) ||
      (mainView === "insights" && (!modulePreferences.insights || !canOpenFeature(FEATURE_KEYS.insights)));
    if (hiddenView) setMainView("pos");
  }, [mainView, modulePreferences, entitlementSnapshot, inventoryWorkspaceAvailable, setMainView]);

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
          setReturnReceiptBarcode(null);
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
          currentRole === "owner"
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
    <div className="pos-app-shell flex flex-col h-screen w-full bg-slate-100 overflow-hidden font-sans text-slate-900 selection:bg-sky-500/20">
      <header className="pos-topbar relative flex h-16 items-center justify-between px-3 sm:px-7 print:hidden shrink-0 gap-2 sm:gap-4 z-50">
        {/* Zone A: Pace is the living PWAYMENT mark and the assistant entry point. */}
        <div
          className="flex items-center select-none shrink-0"
          aria-label="Pwayment retail"
        >
          <PaceAssistant
            storeId={currentStoreId}
            view={mainView}
            role={currentRole}
            userName={currentUserName}
            userId={currentUserId}
            productCount={products.length}
            cartCount={cartCount}
            firstRunCompleted={firstRunCompleted || setupProgress.ready}
            online={paceConnection.online}
            pendingSync={paceConnection.pendingSync}
            retryingSync={paceConnection.retryingSync}
            failedSync={paceConnection.failedSync}
            syncIssueSummary={paceConnection.syncIssueSummary}
            syncIssueResolution={paceConnection.syncIssueResolution}
            cartSummary={{
              items: cart.orders.slice(0, 25).map((order) => ({
                name: order.product.name,
                quantity: order.quantity,
                unitPriceCents: order.product.priceCents,
                sku: order.product.sku,
                variant: order.product.variant,
              })),
              customerLinked: Boolean(linkedCustomer),
              customerName: linkedCustomer?.name,
              discountCents: cartDiscount?.amountCents,
              documentType: cartDocumentRequest.type,
            }}
            customerName={linkedCustomer?.name}
            customerInsights={customerInsights}
            setupMilestones={paceSetupMilestones}
            suppressed={storeSetupOpen || Boolean(firstProductTourName) || leaveApprovalGateOpen}
            onNavigate={(view) => setMainView(view)}
            onOpenSetup={openSetupForCurrentStore}
            onOpenProfile={(tab) => openProfile(tab)}
            onOpenCatalog={openPaceCatalogFilter}
            onOpenDestination={openPaceDestination}
            onOpenMilestone={(milestone) => {
              if (establishedCatalog) {
                openMilestoneDirectly(milestone);
                return;
              }
              if (milestone.action === "setup") openGuidedSetup(milestone.id);
              if (milestone.action === "categories") openGuidedSetup("categories");
              if (milestone.action === "products") openGuidedSetup("products");
              if (milestone.action === "labels") openGuidedSetup("barcodes");
            }}
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

              <div className="pos-theme-menu-section">
                <div className="px-2 pb-1 pt-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                  Weergave
                </div>
                <ThemeToggle menu />
              </div>

              <div className="my-1 border-t border-slate-100" />

              {canAccessOwnerSettings && (
                <button
                  role="menuitem"
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    openProfile("modules");
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-sky-50 hover:text-sky-800 transition-colors"
                >
                  <SlidersHorizontal size={15} className="pos-menu-icon" />
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

              {/* Instellingen zijn een harde owner-only beveiligingsgrens. */}
              {canAccessOwnerSettings && <button
                role="menuitem"
                onClick={() => {
                  openProfile("billing");
                  setIsUserMenuOpen(false);
                }}
                className="pos-menu-action w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 transition-colors"
              >
                <Settings size={15} className="pos-menu-icon" />
                <span>Instellingen</span>
              </button>}

              <button
                role="menuitem"
                onClick={() => {
                  setIsUserMenuOpen(false);
                  void lockPos("user-switch");
                }}
                className="pos-menu-action w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 transition-colors"
              >
                <LockKeyhole size={15} className="pos-menu-icon" />
                <span>Vergrendel / wissel medewerker</span>
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
                className="pos-menu-action w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  {isFullscreen ? (
                    <Minimize size={15} className="pos-menu-icon" />
                  ) : (
                    <Maximize size={15} className="pos-menu-icon" />
                  )}
                  <span>Volledig Scherm</span>
                </div>
                <span className="text-[10px] font-bold text-slate-400 uppercase">
                  {isFullscreen ? "AAN" : "UIT"}
                </span>
              </button>

              <div className="border-t border-slate-100 my-1" />

              {/* Alleen de eigenaar kan de onderliggende winkelaccount afmelden. */}
              {currentRole === "owner" && <button
                role="menuitem"
                onClick={() => {
                  setIsUserMenuOpen(false);
                  void logout();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-red-600 hover:bg-red-50 transition-colors"
              >
                <LogOut size={15} className="text-red-500" />
                <span>Afmelden</span>
              </button>}
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
              initialReturnBarcode={returnReceiptBarcode ?? undefined}
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
          {mainView === "inventory" && (
            <FeatureGate
              feature={FEATURE_KEYS.inventoryOperations}
              title="Voorraadoperaties zijn niet actief in dit abonnement"
              description="Uw voorraaddata en achtergrondmutaties blijven veilig actief."
              onUpgrade={() => openProfile("billing")}
            >
              <InventoryWorkspace />
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
              <Insights onOpenFinancialSettings={() => openProfile("financial")} />
            </FeatureGate>
          )}
          {(mainView === "profile" || mainView === "admin") &&
            (canAccessOwnerSettings ? (
              <ProfileView
                initialTab={profileInitialTarget.tab}
                initialTabRequestKey={profileInitialTarget.requestKey}
                openNewProductRequestKey={profileInitialTarget.openNewProductRequestKey}
                catalogFilter={profileInitialTarget.catalogFilter}
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
                      setReturnReceiptBarcode(null);
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
                        onStartStoreSetup={() => openGuidedSetup("welcome")}
                        onAddCategory={openCategorySetup}
                        onImportProducts={openImportSetup}
                      />
                    )}
                    {mobileView === "cart" && <Cart />}
                  </div>

                  <div className="pos-mobile-nav flex border-t pb-safe print:hidden shadow-lg">
                    <button
                      onClick={() => setMobileView("menu")}
                      className={`pos-mobile-nav-item flex flex-1 flex-col items-center gap-1 py-3 ${
                        mobileView === "menu"
                          ? "pos-mobile-nav-item--active font-bold"
                          : ""
                      }`}
                    >
                      <ScanLine size={20} />
                      <span className="text-[10px] uppercase tracking-wider">
                        Catalogus
                      </span>
                    </button>
                    <button
                      onClick={() => setMobileView("cart")}
                      className={`pos-mobile-nav-item relative flex flex-1 flex-col items-center gap-1 py-3 ${
                        mobileView === "cart"
                          ? "pos-mobile-nav-item--active font-bold"
                          : ""
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
                <div className="relative flex min-w-0 w-full h-full overflow-hidden">
                  <div
                    className={`pos-product-stage-frame min-w-0 flex-1 h-full ${desktopCartPinned || desktopCartOpen ? "pos-product-stage-frame--with-cart" : ""}`}
                  >
                    <Menu
                      query={productQuery}
                      onQueryChange={setProductQuery}
                      onStartStoreSetup={() => openGuidedSetup("welcome")}
                      onAddCategory={openCategorySetup}
                      onImportProducts={openImportSetup}
                      onProductSelected={showProductArrival}
                    />
                  </div>
                  <div
                    ref={desktopCartPanelRef}
                    className={`pos-cart-panel-frame ${desktopCartVisible ? "pos-cart-panel-frame--open" : "pos-cart-panel-frame--closed"} h-full`}
                    aria-hidden={!desktopCartVisible}
                    inert={!desktopCartVisible ? true : undefined}
                    role="region"
                    aria-label="Winkelwagen"
                  >
                    <Cart
                      desktopPanelMode={desktopCartPinned ? "pinned" : "open"}
                      onCloseDesktopPanel={() => transitionDesktopCartLayout(() => setDesktopCartOpen(false))}
                      onReceiptVisibilityChange={(visible) => {
                        desktopCartReceiptOpenRef.current = visible;
                      }}
                      onToggleDesktopPin={() => {
                        transitionDesktopCartLayout(() => {
                          if (desktopCartPinned) {
                            setDesktopCartPinned(false);
                            setDesktopCartOpen(true);
                          } else {
                            setDesktopCartPinned(true);
                            setDesktopCartOpen(false);
                          }
                        });
                      }}
                    />
                  </div>
                  <aside
                    aria-label="Compacte winkelwagen"
                    aria-hidden={desktopCartVisible}
                    className={`pos-cart-dock relative z-40 h-full shrink-0 print:hidden ${desktopCartVisible ? "pos-cart-dock--hidden" : "pos-cart-dock--open"}`}
                  >
                    <button
                      type="button"
                      disabled={desktopCartVisible}
                      onClick={() => transitionDesktopCartLayout(() => setDesktopCartOpen(true))}
                      aria-label={`Winkelwagen openen, ${cartCount} ${cartCount === 1 ? "artikel" : "artikelen"}, ${formatEUR(compactCartTotal)}`}
                      aria-expanded={desktopCartVisible}
                      className="pos-cart-dock-button flex h-full w-full cursor-pointer flex-col items-center rounded-none px-2 py-3 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500 disabled:cursor-default"
                    >
                      <span className="pos-cart-dock-summary flex w-full flex-col items-center rounded-2xl border px-1.5 py-3 shadow-sm">
                        <span
                          ref={desktopCartDockTargetRef}
                          key={`arrival-${cartArrivalNonce}`}
                          className={cartArrivalNonce > 0 ? "pos-cart-target-pop relative" : "relative"}
                        >
                          <ShoppingCart size={24} />
                          {cartCount > 0 && (
                            <span className="absolute -right-3 -top-3 min-w-5 rounded-full bg-sky-600 px-1.5 py-0.5 text-center text-[10px] font-black leading-4 text-white shadow-sm ring-2 ring-white">
                              {cartCount > 99 ? "99+" : cartCount}
                            </span>
                          )}
                        </span>
                        <span className="mt-3 text-[10px] font-black uppercase tracking-[0.08em]">
                          {cartCount === 0 ? "Leeg" : `${cartCount > 99 ? "99+" : cartCount} ${cartCount === 1 ? "item" : "items"}`}
                        </span>
                      </span>

                      <span className="pos-cart-dock-total mt-auto flex w-full flex-col items-center rounded-2xl border px-1 py-3">
                        <span className="pos-cart-dock-total-label text-[9px] font-black uppercase tracking-wider">Totaal</span>
                        <span className="pos-cart-dock-total-value mt-1 max-w-full text-[13px] font-black tabular-nums tracking-tight">
                          {formatEUR(compactCartTotal)}
                        </span>
                        <PanelRightOpen size={17} className="mt-2 text-sky-600" />
                      </span>
                    </button>
                  </aside>
                </div>
              )}
            </div>
            </React.Suspense>
          </div>
        )}
      </main>
      {cartFlights.map((flight) => (
        <div
          key={flight.id}
          className="pos-cart-flight"
          aria-hidden="true"
          style={{
            left: flight.startX,
            top: flight.startY,
            "--cart-flight-end-x": `${flight.endX}px`,
            "--cart-flight-end-y": `${flight.endY}px`,
          } as React.CSSProperties}
        >
          <span className="pos-cart-flight-icon"><ShoppingBag size={15} /></span>
          <span className="min-w-0">
            <strong className="block truncate text-[11px] font-black text-slate-900">{flight.productName}</strong>
            <span className="block text-[10px] font-bold text-sky-700">{flight.priceLabel}</span>
          </span>
        </div>
      ))}
      {canAccessOwnerSettings && (
        <StoreSetupGuide
          open={storeSetupOpen}
          startAt={storeSetupStartAt}
          onClose={() => setStoreSetupOpen(false)}
          onAddCategories={openCategorySetup}
          onAddProduct={startGuidedProductSetup}
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
