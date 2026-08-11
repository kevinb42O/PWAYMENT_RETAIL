import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";

const searchParams = new URLSearchParams(window.location.search);
const presentationRequested = searchParams.get("presentation") === "1";
const previewMode = searchParams.get("preview") === "1";
const presentationBuild = import.meta.env.VITE_PRESENTATION_BUILD === "true";
const e2eBuild = import.meta.env.VITE_E2E_BUILD === "true";
const presentationMode =
  presentationRequested && (import.meta.env.DEV || presentationBuild);
const storefrontRoute =
  window.location.pathname === "/shop" ||
  window.location.pathname.startsWith("/shop/");
const accountRoute = ["/app", "/login", "/register"].some(
  (route) =>
    window.location.pathname === route ||
    window.location.pathname.startsWith(`${route}/`),
);
const publicWebsiteRoute =
  !storefrontRoute && !accountRoute && !presentationMode && !presentationBuild;
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

root.render(
  <div className="grid min-h-dvh place-items-center bg-[#f6f5f1] text-sm font-bold text-slate-500">
    {storefrontRoute
      ? "Webshop wordt klaargezet…"
      : "Pwayment wordt klaargezet…"}
  </div>,
);

const start = async () => {
  if (await configureServiceWorker()) return;

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

  const [
    { default: App },
    { ensureSeedUsers },
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
  void useProducts.getState().hydrate();
  void useCustomers.getState().hydrate();

  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
};

void start();
