import type { ReactNode } from "react";
import { cn } from "./cn";

export interface SegmentedTab<T extends string> {
  id: T;
  label: ReactNode;
  disabled?: boolean;
}

export const SegmentedTabs = <T extends string>({
  label,
  value,
  onChange,
  tabs,
  className,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  tabs: SegmentedTab<T>[];
  className?: string;
}) => (
  <div className={cn("inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]", className)} aria-label={label}>
    {tabs.map((tab) => {
      const active = tab.id === value;
      return (
        <button
          key={tab.id}
          type="button"
          disabled={tab.disabled}
          onClick={() => onChange(tab.id)}
          aria-pressed={active}
          className={cn(
            "rounded-md px-3 py-1.5 text-xs font-bold transition-colors",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#38bdf8]",
            "disabled:cursor-not-allowed disabled:opacity-50",
            active ? "border border-[#bae6fd] bg-[#f0f9ff] text-[#0e7490] shadow-none" : "text-slate-500 hover:bg-white hover:text-slate-800",
          )}
        >
          {tab.label}
        </button>
      );
    })}
  </div>
);
