import { useEffect, useMemo, useState } from "react";
import {
  entitlementNow,
  trialMillisecondsRemaining,
  useEntitlements,
} from "./entitlements";

const tickDelay = (remainingMs: number | null): number => {
  if (remainingMs != null && remainingMs <= 60 * 60_000) return 10_000;
  return 60_000;
};

export interface TrialClockValue {
  now: number;
  remainingMs: number | null;
  expired: boolean;
  label: string | null;
}

export const formatTrialRemaining = (remainingMs: number | null): string | null => {
  if (remainingMs == null) return null;
  if (remainingMs <= 0) return "Trial afgelopen · Basis actief";

  const totalMinutes = Math.ceil(remainingMs / 60_000);
  const totalHours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (remainingMs < 24 * 60 * 60_000) {
    return `${String(totalHours).padStart(2, "0")}:${String(minutes).padStart(2, "0")} resterend`;
  }

  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  return `${days} ${days === 1 ? "dag" : "dagen"} · ${hours} uur resterend`;
};

export const useEntitlementClock = (): TrialClockValue => {
  const snapshot = useEntitlements((state) => state.snapshot);
  const storeId = useEntitlements((state) => state.storeId);
  const load = useEntitlements((state) => state.load);
  const [now, setNow] = useState(entitlementNow);

  const remainingMs = useMemo(
    () => trialMillisecondsRemaining(snapshot),
    [snapshot, now],
  );

  useEffect(() => {
    if (remainingMs == null) return;
    const interval = window.setInterval(
      () => setNow(entitlementNow()),
      tickDelay(remainingMs),
    );
    const expiry = remainingMs > 0
      ? window.setTimeout(() => {
          setNow(entitlementNow());
          if (storeId) void load(storeId, true).catch(() => undefined);
        }, Math.min(remainingMs + 50, 2_147_000_000))
      : undefined;
    return () => {
      window.clearInterval(interval);
      if (expiry != null) window.clearTimeout(expiry);
    };
  }, [load, remainingMs, storeId]);

  useEffect(() => {
    if (!storeId) return;
    const refresh = () => {
      setNow(entitlementNow());
      void load(storeId, true).catch(() => undefined);
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [load, storeId]);

  return {
    now,
    remainingMs,
    expired: remainingMs != null && remainingMs <= 0,
    label: formatTrialRemaining(remainingMs),
  };
};
