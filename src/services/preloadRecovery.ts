const preloadReloadStorageKey = "pwayment-preload-reload-at";
const preloadReloadGuardMs = 30_000;

type PreloadRecoveryOptions = {
  eventTarget?: Pick<Window, "addEventListener" | "removeEventListener">;
  now?: () => number;
  reload?: () => void;
  storage?: Pick<Storage, "getItem" | "setItem" | "removeItem">;
};

const readLastReloadAt = (
  storage: PreloadRecoveryOptions["storage"],
): number | null => {
  if (!storage) return null;

  try {
    const value = Number(storage.getItem(preloadReloadStorageKey));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
};

export const installPreloadRecovery = (
  options: PreloadRecoveryOptions = {},
) => {
  const eventTarget = options.eventTarget ?? window;
  const now = options.now ?? Date.now;
  const reload = options.reload ?? (() => window.location.reload());
  const storage = options.storage ?? window.sessionStorage;

  const handlePreloadError = (event: Event) => {
    const currentTime = now();
    const lastReloadAt = readLastReloadAt(storage);

    // A persistent network or server failure must not trap the browser in a
    // reload loop. Let Vite surface a second failure normally.
    if (
      lastReloadAt !== null &&
      currentTime - lastReloadAt < preloadReloadGuardMs
    ) {
      return;
    }

    try {
      storage.setItem(preloadReloadStorageKey, String(currentTime));
    } catch {
      // Without a persistent loop guard, an automatic reload could trap a
      // hardened browser indefinitely. Let Vite surface the original error.
      return;
    }

    event.preventDefault();
    reload();
  };

  eventTarget.addEventListener("vite:preloadError", handlePreloadError);

  const clearReloadGuard = window.setTimeout(() => {
    try {
      storage.removeItem(preloadReloadStorageKey);
    } catch {
      // Storage can be unavailable in hardened browser contexts.
    }
  }, preloadReloadGuardMs);

  return () => {
    window.clearTimeout(clearReloadGuard);
    eventTarget.removeEventListener("vite:preloadError", handlePreloadError);
  };
};
