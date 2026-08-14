import { AlertCircle, CheckCircle2, Info } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "./cn";

export type FeedbackTone = "success" | "error" | "info";

const tones = {
  success: { container: "border-emerald-200 bg-emerald-50 text-emerald-900", Icon: CheckCircle2 },
  error: { container: "border-rose-200 bg-rose-50 text-rose-900", Icon: AlertCircle },
  info: { container: "border-[#bae6fd] bg-[#f0f9ff] text-[#0e7490]", Icon: Info },
} as const;

export const FeedbackBanner = ({
  tone,
  children,
  onDismiss,
  className,
}: {
  tone: FeedbackTone;
  children: ReactNode;
  onDismiss?: () => void;
  className?: string;
}) => {
  const { container, Icon } = tones[tone];
  return (
    <div
      className={cn("flex items-start justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-xs font-semibold", container, className)}
      role={tone === "error" ? "alert" : "status"}
    >
      <span className="flex items-start gap-2"><Icon size={16} className="mt-0.5 shrink-0" />{children}</span>
      {onDismiss && <button type="button" onClick={onDismiss} className="-mr-1 rounded-md px-1 text-current/70 hover:bg-black/5 hover:text-current" aria-label="Melding sluiten">×</button>}
    </div>
  );
};
