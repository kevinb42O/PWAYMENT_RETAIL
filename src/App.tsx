/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Layout } from "./components/Layout";
import { LoginScreen } from "./auth/LoginScreen";
import { useAuth } from "./auth/useAuth";
import { useEffect, useState } from "react";
import { useTheme } from "./store/useTheme";
import { applyThemeMode } from "./utils/theme";
import { startOutboxWorker, stopOutboxWorker } from "./services/outboxWorker";
import { startRealtimeSync, stopRealtimeSync } from "./services/realtimeSync";
import { CustomerDisplayPublisher } from "./customer-display/CustomerDisplayPublisher";

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
        unlocked: true,
      });
    }
  }, [e2eMode, presentationMode, unlocked]);

  useEffect(() => {
    if (unlocked) {
      startOutboxWorker();
      startRealtimeSync();
    } else {
      stopOutboxWorker();
      stopRealtimeSync();
    }
    return () => {
      stopOutboxWorker();
      stopRealtimeSync();
    };
  }, [unlocked]);

  return unlocked ? (
    <>
      <CustomerDisplayPublisher />
      <Layout />
      {recordingMode && <RecordingCursor />}
    </>
  ) : (
    <LoginScreen />
  );
}
