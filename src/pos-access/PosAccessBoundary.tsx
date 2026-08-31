import { useEffect, useRef } from "react";
import { useAuth } from "../auth/useAuth";
import { usePosAccess } from "./usePosAccess";
import { PosAccessGate } from "./PosAccessGate";

const IDLE_TIMEOUT_MS = 15 * 60_000;
const BACKGROUND_LOCK_MS = 2 * 60_000;

export const PosAccessBoundary = ({ children }: { children: React.ReactNode }) => {
  const status = usePosAccess((state) => state.status);
  const lock = usePosAccess((state) => state.lock);
  const expiresAt = usePosAccess((state) => state.expiresAt);
  const accountUnlocked = useAuth((state) => state.unlocked);
  const lastActivity = useRef(Date.now());
  const hiddenAt = useRef<number | null>(null);

  useEffect(() => {
    if (status !== "active") return;
    lastActivity.current = Date.now();
    hiddenAt.current = document.hidden ? Date.now() : null;
    const mark = () => { lastActivity.current = Date.now(); };
    const interval = window.setInterval(() => {
      if (Date.now() - lastActivity.current >= IDLE_TIMEOUT_MS) void lock("idle-timeout");
    }, 30_000);
    const visibility = () => {
      if (document.hidden) hiddenAt.current = Date.now();
      else if (hiddenAt.current && Date.now() - hiddenAt.current >= BACKGROUND_LOCK_MS) {
        hiddenAt.current = null;
        void lock("background-timeout");
      }
      else hiddenAt.current = null;
    };
    const expiryDelay = expiresAt ? new Date(expiresAt).getTime() - Date.now() : Number.POSITIVE_INFINITY;
    if (expiryDelay <= 0) {
      window.clearInterval(interval);
      void lock("session-expired");
      return;
    }
    const expiryTimer = Number.isFinite(expiryDelay)
      ? window.setTimeout(() => void lock("session-expired"), Math.min(expiryDelay, 2_147_483_647))
      : null;
    for (const event of ["pointerdown", "keydown", "touchstart"] as const) window.addEventListener(event, mark, { passive: true });
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.clearInterval(interval);
      if (expiryTimer != null) window.clearTimeout(expiryTimer);
      for (const event of ["pointerdown", "keydown", "touchstart"] as const) window.removeEventListener(event, mark);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [expiresAt, lock, status]);

  if (!accountUnlocked) return null;
  return status === "active" ? <>{children}</> : <PosAccessGate />;
};
