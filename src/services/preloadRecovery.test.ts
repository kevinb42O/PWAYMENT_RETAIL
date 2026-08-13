import { describe, expect, it, vi } from "vitest";
import { installPreloadRecovery } from "./preloadRecovery";

const createStorage = () => {
  const values = new Map<string, string>();

  return {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value),
  };
};

describe("installPreloadRecovery", () => {
  it("reloads once when a stale dynamic import fails", () => {
    const eventTarget = new EventTarget();
    const reload = vi.fn();
    const storage = createStorage();
    const uninstall = installPreloadRecovery({
      eventTarget: eventTarget as Window,
      now: () => 100_000,
      reload,
      storage,
    });

    const firstError = new Event("vite:preloadError", { cancelable: true });
    eventTarget.dispatchEvent(firstError);

    expect(firstError.defaultPrevented).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);

    const repeatedError = new Event("vite:preloadError", { cancelable: true });
    eventTarget.dispatchEvent(repeatedError);

    expect(repeatedError.defaultPrevented).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);

    uninstall();
  });

  it("allows a new recovery attempt after the loop guard expires", () => {
    const eventTarget = new EventTarget();
    const reload = vi.fn();
    const storage = createStorage();
    let currentTime = 100_000;
    const uninstall = installPreloadRecovery({
      eventTarget: eventTarget as Window,
      now: () => currentTime,
      reload,
      storage,
    });

    eventTarget.dispatchEvent(
      new Event("vite:preloadError", { cancelable: true }),
    );
    currentTime += 30_001;
    eventTarget.dispatchEvent(
      new Event("vite:preloadError", { cancelable: true }),
    );

    expect(reload).toHaveBeenCalledTimes(2);

    uninstall();
  });

  it("does not reload when the loop guard cannot be persisted", () => {
    const eventTarget = new EventTarget();
    const reload = vi.fn();
    const uninstall = installPreloadRecovery({
      eventTarget: eventTarget as Window,
      reload,
      storage: {
        getItem: () => {
          throw new Error("storage blocked");
        },
        removeItem: vi.fn(),
        setItem: () => {
          throw new Error("storage blocked");
        },
      },
    });

    const error = new Event("vite:preloadError", { cancelable: true });
    eventTarget.dispatchEvent(error);

    expect(error.defaultPrevented).toBe(false);
    expect(reload).not.toHaveBeenCalled();

    uninstall();
  });
});
