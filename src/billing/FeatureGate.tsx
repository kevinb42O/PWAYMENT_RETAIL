import React from "react";
import { Lock, Sparkles } from "lucide-react";
import {
  type FeatureKey,
  planLabel,
  useEntitlements,
} from "./entitlements";

interface FeatureGateProps {
  feature: FeatureKey;
  children: React.ReactNode;
  title: string;
  description?: string;
  compact?: boolean;
  onUpgrade?: () => void;
}

export const FeatureGate: React.FC<FeatureGateProps> = ({
  feature,
  children,
  title,
  description,
  compact = false,
  onUpgrade,
}) => {
  const snapshot = useEntitlements((state) => state.snapshot);
  if (snapshot?.features[feature]) return <>{children}</>;

  return (
    <div
      className={`grid w-full flex-1 place-items-center rounded-2xl border border-slate-200 bg-white text-center ${compact ? "p-5" : "min-h-72 p-8"}`}
      role="region"
      aria-label={`${title} is vergrendeld`}
    >
      <div className="max-w-md">
        <div className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-slate-100 text-slate-600">
          <Lock size={20} />
        </div>
        <h2 className="mt-4 text-base font-black text-slate-950">{title}</h2>
        <p className="mt-1.5 text-xs font-medium leading-relaxed text-slate-500">
          {description ??
            `Deze functie is niet inbegrepen in ${planLabel(snapshot?.effectivePlan ?? "basic")}. Uw bestaande gegevens en instellingen blijven veilig bewaard.`}
        </p>
        {onUpgrade && (
          <button
            type="button"
            onClick={onUpgrade}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-xs font-bold text-white hover:bg-black"
          >
            <Sparkles size={14} /> Bekijk Retail Professional
          </button>
        )}
      </div>
    </div>
  );
};
