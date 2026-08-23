import React, { useEffect, useState } from "react";
import { AlertCircle, BadgeCheck, Clock3, X } from "lucide-react";
import {
  entitlementNow,
  useEntitlements,
} from "./entitlements";
import { useEntitlementClock } from "./useEntitlementClock";

interface TrialStatusProps {
  onOpenBilling: () => void;
}

const notificationKey = (storeId: string, marker: string) =>
  `pwayment:trial-notice:${storeId}:${marker}`;

export const TrialStatus: React.FC<TrialStatusProps> = ({ onOpenBilling }) => {
  const snapshot = useEntitlements((state) => state.snapshot);
  const storeId = useEntitlements((state) => state.storeId);
  const [toastVisible, setToastVisible] = useState(false);
  const trialClock = useEntitlementClock();
  const days = trialClock.remainingMs == null
    ? null
    : Math.max(0, Math.ceil(trialClock.remainingMs / 86_400_000));

  useEffect(() => {
    if (!storeId || days == null || days > 3) return;
    const date = new Date(entitlementNow()).toISOString().slice(0, 10);
    const key = notificationKey(storeId, `${date}:${days}`);
    try {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, "shown");
    } catch {
      // In-memory notification still works if browser storage is unavailable.
    }
    setToastVisible(true);
  }, [days, storeId]);

  if (!snapshot) return null;

  const isTrial = snapshot.status === "trialing" && days != null && !trialClock.expired;
  const isExpired = snapshot.status === "expired" || trialClock.expired;

  return (
    <>
      {isTrial && (
        <button
          type="button"
          onClick={onOpenBilling}
          aria-label={`Pro trial. ${trialClock.label ?? "Resterende tijd onbekend"}. Abonnement bekijken.`}
          className={`group relative hidden items-center gap-1.5 rounded-full border px-3 py-1.5 text-[10px] font-black sm:inline-flex ${days <= 3 ? "border-amber-300 bg-amber-50 text-amber-800" : "border-sky-200 bg-sky-50 text-sky-800"}`}
        >
          <Clock3 size={12} aria-hidden="true" /> Pro trial
          <span
            role="tooltip"
            className="pointer-events-none absolute left-1/2 top-full z-50 mt-3 w-max max-w-[min(18rem,calc(100vw-2rem))] -translate-x-1/2 rounded-xl border border-slate-200 bg-slate-950 px-3 py-2 text-center text-[11px] font-bold leading-4 text-white opacity-0 shadow-xl transition-opacity duration-150 group-focus-visible:opacity-100 group-hover:opacity-100"
          >
            <span className="absolute left-1/2 top-[-5px] h-2.5 w-2.5 -translate-x-1/2 rotate-45 border-l border-t border-slate-200 bg-slate-950" />
            <span className="relative block">Nog {trialClock.label}</span>
            {snapshot.trialEndsAt && (
              <span className="relative mt-0.5 block text-[10px] font-medium text-slate-300">
                Eindigt {new Date(snapshot.trialEndsAt).toLocaleString("nl-BE")}
              </span>
            )}
          </span>
        </button>
      )}

      {isExpired && (
        <button
          type="button"
          onClick={onOpenBilling}
          className="hidden items-center gap-1.5 rounded-full border border-slate-300 bg-slate-100 px-3 py-1.5 text-[10px] font-black text-slate-700 sm:inline-flex"
        >
          <AlertCircle size={12} /> Trial afgelopen · Basis actief
        </button>
      )}

      {toastVisible && isTrial && (
        <div
          role="status"
          aria-live="polite"
          className="fixed right-4 top-4 z-[100] flex max-w-sm items-start gap-3 rounded-2xl border border-amber-200 bg-white p-4 text-slate-900 shadow-2xl"
        >
          <BadgeCheck size={18} className="mt-0.5 shrink-0 text-amber-500" />
          <div>
            <div className="text-xs font-black">
              Uw Pro-trial eindigt {days === 0 ? "vandaag" : `over ${days} ${days === 1 ? "dag" : "dagen"}`}.
            </div>
            <p className="mt-1 text-[11px] font-medium leading-relaxed text-slate-500">
              Daarna wordt Pwayment Basis actief. Uw producten, historiek en instellingen blijven bewaard.
            </p>
            <button
              type="button"
              onClick={onOpenBilling}
              className="mt-2 text-[11px] font-black text-slate-900 underline"
            >
              Abonnement bekijken
            </button>
          </div>
          <button
            type="button"
            aria-label="Melding sluiten"
            onClick={() => setToastVisible(false)}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
          >
            <X size={14} />
          </button>
        </div>
      )}
    </>
  );
};
