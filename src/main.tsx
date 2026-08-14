import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import {
  getLoadingProgress,
  reportLoadingProgress,
  subscribeLoadingProgress,
} from "./services/loadingProgress";
import { installPreloadRecovery } from "./services/preloadRecovery";

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
const presentationMode =
  presentationRequested && (import.meta.env.DEV || presentationBuild);
const storefrontRoute =
  window.location.pathname === "/shop" ||
  window.location.pathname.startsWith("/shop/");
const serviceTrackingRoute = window.location.pathname.startsWith("/service/");
const customerDisplayRoute =
  window.location.pathname === "/customer-display" ||
  window.location.pathname.startsWith("/customer-display/");
const accountRoute = ["/app", "/login", "/register"].some(
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

  return (
  <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-[#f6f5f1] px-6 text-slate-950 animate-in fade-in duration-500">
    <div className="z-10 flex w-full max-w-sm flex-col items-center rounded-[2rem] border border-white/80 bg-white/70 px-8 py-10 text-center shadow-[0_32px_90px_-42px_rgba(15,23,42,0.45)] backdrop-blur-xl sm:px-10">
      <div className="flex items-center justify-center sm:translate-x-3">
        <img
          src="/branding/pwayment-logo.svg"
          alt="Pwayment"
          className="hidden sm:block h-12 w-auto object-contain"
        />
        <img
          src="/branding/pwayment-mark.svg"
          alt="Pwayment"
          className="block sm:hidden h-16 w-16 object-contain"
        />
      </div>
      
      <div className="mt-9 flex w-full flex-col items-center gap-4">
        <div className="text-[10px] uppercase tracking-[0.24em] font-bold text-slate-400">
          {storefrontRoute
            ? "Webshop wordt klaargezet"
            : loadingProgress.title}
        </div>
        <p className="text-sm font-semibold text-slate-800">{loadingProgress.detail}</p>
        <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-cyan-400 via-blue-500 to-indigo-600 transition-[width] duration-500 ease-out"
            style={{ width: `${storefrontRoute ? 38 : loadingProgress.progress}%` }}
          />
        </div>
      </div>
      <p className="mt-5 text-xs leading-5 text-slate-500">{storefrontRoute ? "Even de etalage netjes zetten." : `${loadingProgress.progress}% · beveiligde sessie en lokale gegevens`}</p>
    </div>
  </div>
  );
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
    { applyThemeMode, readInitialThemeMode },
  ] = await Promise.all([
    import("./App.tsx"),
    import("./auth/useAuth"),
    import("./db/migrateLegacyDb"),
    import("./store/useCustomers"),
    import("./store/useProducts"),
    import("./utils/theme"),
  ]);

  applyThemeMode(readInitialThemeMode());

  // One-time copy from the old shared 'POSDatabase' before anything reads/seeds.
  try {
    await migrateLegacyDatabase();
  } catch (err) {
    console.error("Legacy database migratie mislukt:", err);
  }

  // Awaiting avoids a first-load race where the login form becomes interactive
  // before development/presentation fixture accounts exist. Production is a
  // no-op unless an explicitly gated fixture build is requested.
  await ensureSeedUsers();
  try {
    await useAuth.getState().initialize();
  } catch (error) {
    reportLoadingProgress("error");
    console.error("Sessie initialiseren mislukt:", error);
  }
  void useProducts.getState().hydrate();
  void useCustomers.getState().hydrate();

  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
};

void start();
