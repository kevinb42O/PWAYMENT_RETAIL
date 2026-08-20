/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useAuth } from "./auth/useAuth";
import { lazy, Suspense, useEffect, useState } from "react";
import { useTheme } from "./store/useTheme";
import { applyThemeMode } from "./utils/theme";

const Layout = lazy(() =>
  import("./components/Layout").then((module) => ({ default: module.Layout })),
);
const LoginScreen = lazy(() =>
  import("./auth/LoginScreen").then((module) => ({
    default: module.LoginScreen,
  })),
);
const CustomerDisplayPublisher = lazy(() =>
  import("./customer-display/CustomerDisplayPublisher").then((module) => ({
    default: module.CustomerDisplayPublisher,
  })),
);

const AppLoading = () => (
  <div
    className="flex min-h-screen items-center justify-center bg-slate-50 text-sm font-semibold text-slate-500"
    role="status"
    aria-live="polite"
  >
    PWAYMENT laden…
  </div>
);

const RecordingCursor = () => {
  const [cursor, setCursor] = useState({
    x: 610,
    y: 92,
    pressed: false,
    duration: 0,
  });

  useEffect(() => {
    const timers: number[] = [];
    const schedule = (delay: number, action: () => void) => {
      timers.push(window.setTimeout(action, delay));
    };
    const move = (delay: number, x: number, y: number, duration: number) => {
      schedule(delay, () => setCursor({ x, y, pressed: false, duration }));
    };
    const clickButton = (delay: number, label: string, exact = false) => {
      schedule(delay, () =>
        setCursor((current) => ({ ...current, pressed: true, duration: 90 })),
      );
      schedule(delay + 110, () => {
        const button = Array.from(
          document.querySelectorAll<HTMLButtonElement>("button"),
        ).find((candidate) => {
          const text = candidate.textContent?.replace(/\s+/g, " ").trim() ?? "";
          return exact ? text === label : text.includes(label);
        });
        button?.click();
        setCursor((current) => ({ ...current, pressed: false, duration: 120 }));
      });
    };

    move(1050, 92, 260, 900);
    clickButton(2075, "Skateboards");
    move(2725, 318, 390, 920);
    clickButton(3775, "Completes - Street");
    move(4450, 676, 378, 980);
    clickButton(5575, "Complete Street 8.25");
    move(6325, 1100, 663, 1050);
    clickButton(7525, "PIN", true);

    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, []);

  return (
    <div
      className={`pwayment-recording-cursor${cursor.pressed ? " is-pressed" : ""}`}
      style={{
        transform: `translate3d(${cursor.x}px, ${cursor.y}px, 0) scale(${cursor.pressed ? 0.82 : 1})`,
        transitionDuration: `${cursor.duration}ms`,
      }}
      aria-hidden="true"
    />
  );
};

export default function App() {
  const unlocked = useAuth((s) => s.unlocked);
  const currentStoreId = useAuth((s) => s.currentStoreId);
  const themeMode = useTheme((s) => s.mode);
  const presentationRequested =
    new URLSearchParams(window.location.search).get("presentation") === "1";
  const e2eRequested =
    new URLSearchParams(window.location.search).get("e2e") === "1";
  const recordingMode =
    presentationRequested &&
    new URLSearchParams(window.location.search).get("recording") === "1" &&
    import.meta.env.DEV;
  const presentationMode =
    presentationRequested &&
    (import.meta.env.DEV || import.meta.env.VITE_PRESENTATION_BUILD === "true");
  const e2eMode = e2eRequested && import.meta.env.VITE_E2E_BUILD === "true";
  const e2eCatalogFixtureRequested =
    e2eMode && new URLSearchParams(window.location.search).get("catalog") !== "empty";

  useEffect(() => {
    applyThemeMode(themeMode);
  }, [themeMode]);

  // A query parameter can only unlock development or a dedicated presentation build.
  useEffect(() => {
    if ((presentationMode || e2eMode) && !unlocked) {
      useAuth.setState({
        currentUserId: "u-owner",
        currentUserName: "Eigenaar",
        currentRole: "owner",
        currentStoreName: "PWAyment Store",
        currentStoreIsDemo: e2eCatalogFixtureRequested,
        unlocked: true,
      });
    }
  }, [e2eCatalogFixtureRequested, e2eMode, presentationMode, unlocked]);

  useEffect(() => {
    let active = true;
    let stopWorkers: (() => void) | undefined;
    if (unlocked) {
      void Promise.all([
        import("./services/outboxWorker"),
        import("./services/realtimeSync"),
      ]).then(([outbox, realtime]) => {
        if (!active) return;
        outbox.startOutboxWorker();
        realtime.startRealtimeSync();
        stopWorkers = () => {
          outbox.stopOutboxWorker();
          realtime.stopRealtimeSync();
        };
      });
    }
    return () => {
      active = false;
      stopWorkers?.();
    };
  }, [unlocked]);

  useEffect(() => {
    if (!unlocked || !currentStoreId) return;
    let active = true;
    let stopMonitoring: (() => void) | undefined;
    void import("./services/platformTelemetry").then((telemetry) => {
      if (!active) return;
      stopMonitoring = telemetry.startPlatformHealthMonitoring(currentStoreId);
    });
    return () => {
      active = false;
      stopMonitoring?.();
    };
  }, [currentStoreId, unlocked]);

  return (
    <Suspense fallback={<AppLoading />}>
      {unlocked ? (
        <>
          <CustomerDisplayPublisher />
          <Layout />
          {recordingMode && <RecordingCursor />}
        </>
      ) : (
        <LoginScreen />
      )}
    </Suspense>
  );
}
