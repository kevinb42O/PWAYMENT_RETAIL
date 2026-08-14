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
          className={`hidden items-center gap-1.5 rounded-full border px-3 py-1.5 text-[10px] font-black sm:inline-flex ${days <= 3 ? "border-amber-300 bg-amber-50 text-amber-800" : "border-sky-200 bg-sky-50 text-sky-800"}`}
          title={
            snapshot.trialEndsAt
              ? `Pro-proefperiode eindigt ${new Date(snapshot.trialEndsAt).toLocaleString("nl-BE")}`
              : undefined
          }
        >
          <Clock3 size={12} /> Pro trial · {trialClock.label}
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
