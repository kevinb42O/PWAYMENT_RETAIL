import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import {
  getLoadingProgress,
  reportLoadingProgress,
  subscribeLoadingProgress,
} from "./services/loadingProgress";
import { installPreloadRecovery } from "./services/preloadRecovery";
import { LoadingExperience } from "./components/LoadingExperience";
import { withBootTimeout } from "./services/bootTimeout";

installPreloadRecovery();

const searchParams = new URLSearchParams(window.location.search);
const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
const authFlowType = hashParams.get("type") ?? searchParams.get("type");
const passwordSetupFlow =
  authFlowType === "invite" ||
  authFlowType === "recovery" ||
  window.location.pathname.startsWith("/auth/set-password");
const presentationRequested = searchParams.get("presentation") === "1";
const previewMode = searchParams.get("preview") === "1";
const presentationBuild = import.meta.env.VITE_PRESENTATION_BUILD === "true";
const e2eBuild = import.meta.env.VITE_E2E_BUILD === "true";
const e2eFixtureRequested = e2eBuild && searchParams.get("e2e") === "1";
const e2eCatalogFixtureRequested =
  e2eFixtureRequested && searchParams.get("catalog") !== "empty";
const presentationMode =
  presentationRequested && (import.meta.env.DEV || presentationBuild);
const storefrontRoute =
  window.location.pathname === "/shop" ||
  window.location.pathname.startsWith("/shop/");
const serviceTrackingRoute = window.location.pathname.startsWith("/service/");
const customerDisplayRoute =
  window.location.pathname === "/customer-display" ||
  window.location.pathname.startsWith("/customer-display/");
const accountRoute = ["/app", "/login", "/register", "/settings"].some(
  (route) =>
    window.location.pathname === route ||
    window.location.pathname.startsWith(`${route}/`),
);
const platformConsoleRoute =
  window.location.pathname === "/admin" ||
  window.location.pathname.startsWith("/admin/");
const publicWebsiteRoute =
  !passwordSetupFlow &&
  !storefrontRoute &&
  !serviceTrackingRoute &&
  !customerDisplayRoute &&
  !accountRoute &&
  !platformConsoleRoute &&
  !presentationMode &&
  !presentationBuild;
const serviceWorkerCleanupKey = "pwayment-service-worker-cleanup-v1";
// Bump this release key when a client-side correctness fix must take effect
// immediately, even for tills that already completed an earlier cache reset.
// In particular, category icon saves now require a confirmed Supabase write.
const productionCacheRefreshKey = "pwayment-production-cache-category-icon-save-v4";

const removeServiceWorkers = async () => {
  if (!("serviceWorker" in navigator)) return false;

  const hadController = Boolean(navigator.serviceWorker.controller);
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(
    registrations.map((registration) => registration.unregister()),
  );

  if ("caches" in window) {
    const cacheNames = await window.caches.keys();
    await Promise.all(
      cacheNames.map((cacheName) => window.caches.delete(cacheName)),
    );
  }

  if (!hadController) {
    try {
      window.sessionStorage.removeItem(serviceWorkerCleanupKey);
    } catch {
      // Storage can be unavailable in hardened browser contexts; cleanup still succeeded.
    }
    return false;
  }

  // Unregistering does not detach a worker that already controls this document.
  // Reload once so every module comes directly from the current Vite server.
  try {
    if (window.sessionStorage.getItem(serviceWorkerCleanupKey) !== "done") {
      window.sessionStorage.setItem(serviceWorkerCleanupKey, "done");
      window.location.reload();
      return true;
    }
    window.sessionStorage.removeItem(serviceWorkerCleanupKey);
  } catch {
    window.location.reload();
    return true;
  }

  return false;
};

const configureServiceWorker = async () => {
  // Development, local embedded previews and presentation builds must never be
  // controlled by a cached production app shell. A real production preview
  // keeps the current production worker intact.
  if (
    import.meta.env.DEV ||
    (previewMode && !import.meta.env.PROD) ||
    presentationMode ||
    presentationBuild ||
    e2eBuild
  ) {
    return removeServiceWorkers();
  }

  if ("serviceWorker" in navigator && import.meta.env.PROD) {
    // A previous app shell can otherwise keep serving an old login chunk next
    // to a newly deployed startup bundle. Refresh production caches once for
    // this release before installing the current worker.
    try {
      if (window.localStorage.getItem(productionCacheRefreshKey) !== "done") {
        const hadController = Boolean(navigator.serviceWorker.controller);
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((registration) => registration.unregister()));
        if ("caches" in window) {
          const cacheNames = await window.caches.keys();
          await Promise.all(cacheNames.map((cacheName) => window.caches.delete(cacheName)));
        }
        window.localStorage.setItem(productionCacheRefreshKey, "done");
        if (hadController) {
          window.location.reload();
          return true;
        }
      }
    } catch (error) {
      // Cache cleanup is best-effort; a hardened browser must still be able to
      // start and register the current worker.
      console.warn("Productiecache vernieuwen mislukt:", error);
    }
    const { registerSW } = await import("virtual:pwa-register");
    registerSW({ immediate: true });
  }

  return false;
};

const root = createRoot(document.getElementById("root")!);

const StartupScreen = () => {
  const [loadingProgress, setLoadingProgress] = useState(getLoadingProgress);

  useEffect(
    () => subscribeLoadingProgress(setLoadingProgress),
    [],
  );

  return <LoadingExperience progress={loadingProgress} storefront={storefrontRoute} />;
};

root.render(<StartupScreen />);

const start = async () => {
  reportLoadingProgress("starting");
  if (await configureServiceWorker()) return;

  if (passwordSetupFlow) {
    const { default: SetPasswordScreen } = await import(
      "./auth/SetPasswordScreen"
    );
    root.render(
      <StrictMode>
        <SetPasswordScreen />
      </StrictMode>,
    );
    return;
  }

  if (customerDisplayRoute) {
    document.documentElement.dataset.theme = "light";
    document.documentElement.classList.add("theme-light");
    document.documentElement.classList.remove("theme-dark");
    document.documentElement.style.colorScheme = "light";

    const { default: CustomerDisplayApp } = await import(
      "./customer-display/CustomerDisplayApp"
    );
    root.render(
      <StrictMode>
        <CustomerDisplayApp />
      </StrictMode>,
    );
    return;
  }

  if (publicWebsiteRoute) {
    document.documentElement.dataset.theme = "light";
    document.documentElement.classList.add("theme-light");
    document.documentElement.classList.remove("theme-dark");
    document.documentElement.style.colorScheme = "light";

    const { default: PublicSite } = await import("./public/PublicSite");
    root.render(
      <StrictMode>
        <PublicSite />
      </StrictMode>,
    );
    return;
  }

  if (serviceTrackingRoute) {
    document.documentElement.dataset.theme = "light";
    document.documentElement.classList.add("theme-light");
    document.documentElement.classList.remove("theme-dark");
    document.documentElement.style.colorScheme = "light";

    const { default: ServiceTracking } = await import("./public/ServiceTracking");
    root.render(
      <StrictMode>
        <ServiceTracking />
      </StrictMode>,
    );
    return;
  }

  if (storefrontRoute) {
    document.documentElement.dataset.theme = "light";
    document.documentElement.classList.add("theme-light");
    document.documentElement.classList.remove("theme-dark");
    document.documentElement.style.colorScheme = "light";

    const { default: Storefront } = await import("./components/Storefront");
    root.render(
      <StrictMode>
        <Storefront />
      </StrictMode>,
    );
    return;
  }

  if (platformConsoleRoute) {
    document.documentElement.dataset.theme = "light";
    document.documentElement.classList.add("theme-light");
    document.documentElement.classList.remove("theme-dark");
    document.documentElement.style.colorScheme = "light";
    const { default: AdminApp } = await import("./admin/AdminApp");
    root.render(
      <StrictMode>
        <AdminApp />
      </StrictMode>,
    );
    return;
  }

  const [
    { default: App },
    { ensureSeedUsers, useAuth },
    { migrateLegacyDatabase },
    { useCustomers },
    { useProducts },
    { useCategories },
    { applyThemeMode, readInitialThemeMode },
  ] = await Promise.all([
    import("./App.tsx"),
    import("./auth/useAuth"),
    import("./db/migrateLegacyDb"),
    import("./store/useCustomers"),
    import("./store/useProducts"),
    import("./store/useCategories"),
    import("./utils/theme"),
  ]);

  applyThemeMode(readInitialThemeMode());

  // One-time copy from the old shared 'POSDatabase' before anything reads/seeds.
  try {
    await withBootTimeout("Lokale database migreren", migrateLegacyDatabase(), 8_000);
  } catch (err) {
    console.error("Legacy database migratie mislukt:", err);
  }

  // Awaiting avoids a first-load race where the login form becomes interactive
  // before development/presentation fixture accounts exist. Production is a
  // no-op unless an explicitly gated fixture build is requested.
  try {
    await withBootTimeout("Lokale gebruikers voorbereiden", ensureSeedUsers(), 8_000);
  } catch (error) {
    // Production does not need fixture users. A blocked local database must not
    // prevent the real account screen from becoming available.
    console.warn("Lokale gebruikers voorbereiden overgeslagen:", error);
  }
  if (e2eCatalogFixtureRequested) {
    // The real product intentionally starts a newly provisioned tenant empty.
    // E2E is a separate, build-time-only fixture that needs a deterministic
    // retail catalog before the POS renders.
    useAuth.setState({ currentStoreIsDemo: true });
  }
  try {
    await withBootTimeout("Winkelomgeving initialiseren", useAuth.getState().initialize(), 20_000);
  } catch (error) {
    reportLoadingProgress("error");
    console.error("Sessie initialiseren mislukt:", error);
  }
  if (e2eFixtureRequested) {
    // Await the full catalog fixture so assertions never race a background
    // hydration on a fresh Playwright browser profile.
    await Promise.all([
      useProducts.getState().hydrate(),
      useCustomers.getState().hydrate(),
      useCategories.getState().hydrate(),
    ]);
  } else {
    void useProducts.getState().hydrate();
    void useCustomers.getState().hydrate();
  }

  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
};

void start().catch((error) => {
  reportLoadingProgress("error");
  console.error("PWAYMENT kon niet worden gestart:", error);
});
