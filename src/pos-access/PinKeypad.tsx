import { Delete, LoaderCircle } from "lucide-react";
import { useEffect, useRef } from "react";

interface PinKeypadProps {
  value: string;
  onChange: (pin: string) => void;
  onComplete: (pin: string) => void;
  disabled?: boolean;
  error?: string | null;
  label?: string;
}

export const PinKeypad = ({
  value,
  onChange,
  onComplete,
  disabled = false,
  error,
  label = "Persoonlijke PIN",
}: PinKeypadProps) => {
  const completeRef = useRef(onComplete);
  completeRef.current = onComplete;

  const append = (digit: string) => {
    if (disabled || value.length >= 6) return;
    const next = `${value}${digit}`;
    onChange(next);
    if (next.length === 6) completeRef.current(next);
  };

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (disabled || event.metaKey || event.ctrlKey || event.altKey) return;
      if (/^\d$/.test(event.key)) {
        event.preventDefault();
        append(event.key);
      } else if (event.key === "Backspace") {
        event.preventDefault();
        onChange(value.slice(0, -1));
      } else if (event.key === "Delete" || event.key === "Escape") {
        event.preventDefault();
        onChange("");
      } else if (event.key === "Enter" && value.length === 6) {
        event.preventDefault();
        completeRef.current(value);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [disabled, value]);

  return (
    <div className="pos-access-keypad w-full" aria-label={label}>
      <div className="mb-3 flex items-center justify-between text-xs font-semibold text-slate-600">
        <span>Persoonlijke PIN</span>
        <span className="text-slate-400">6 cijfers</span>
      </div>
      <div
        className="pos-access-pin-progress mb-5 flex min-h-8 items-center justify-center gap-3 rounded-lg border border-slate-200 bg-slate-50 py-3"
        role="status"
        aria-live="polite"
        aria-label={`${value.length} van 6 cijfers ingevoerd`}
      >
        {Array.from({ length: 6 }).map((_, index) => (
          <span
            key={index}
            className={`h-3 w-3 rounded-full border transition-[background-color,border-color] motion-reduce:transition-none ${
              index < value.length
                ? "border-cyan-800 bg-cyan-800"
                : "border-slate-300 bg-white"
            }`}
          />
        ))}
        {disabled && <LoaderCircle size={19} className="ml-1 animate-spin text-cyan-700 motion-reduce:animate-none" aria-label="PIN controleren" />}
      </div>

      <div className="mx-auto grid w-full max-w-[310px] grid-cols-3 gap-2.5">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
          <button
            key={digit}
            type="button"
            disabled={disabled}
            onClick={() => append(digit)}
            aria-label={`Cijfer ${digit}`}
            className="pos-access-key flex h-14 min-h-14 touch-manipulation items-center justify-center rounded-xl border border-slate-300 bg-white text-xl font-semibold tabular-nums text-slate-950 outline-none transition hover:border-cyan-600 hover:bg-cyan-50 active:bg-cyan-100 focus-visible:border-cyan-700 focus-visible:ring-3 focus-visible:ring-cyan-100 disabled:cursor-wait disabled:opacity-55 motion-reduce:transition-none sm:h-16"
          >
            {digit}
          </button>
        ))}
        <button
          type="button"
          disabled={disabled || value.length === 0}
          onClick={() => onChange("")}
          className="pos-access-key pos-access-key--utility flex h-14 min-h-14 touch-manipulation items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600 outline-none transition hover:border-slate-300 hover:bg-slate-100 focus-visible:ring-3 focus-visible:ring-cyan-100 disabled:opacity-35 motion-reduce:transition-none sm:h-16"
        >
          Wis
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => append("0")}
          aria-label="Cijfer 0"
          className="pos-access-key flex h-14 min-h-14 touch-manipulation items-center justify-center rounded-xl border border-slate-300 bg-white text-xl font-semibold tabular-nums text-slate-950 outline-none transition hover:border-cyan-600 hover:bg-cyan-50 active:bg-cyan-100 focus-visible:border-cyan-700 focus-visible:ring-3 focus-visible:ring-cyan-100 disabled:cursor-wait disabled:opacity-55 motion-reduce:transition-none sm:h-16"
        >
          0
        </button>
        <button
          type="button"
          disabled={disabled || value.length === 0}
          onClick={() => onChange(value.slice(0, -1))}
          aria-label="Laatste cijfer wissen"
          className="pos-access-key pos-access-key--utility flex h-14 min-h-14 touch-manipulation items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-600 outline-none transition hover:border-slate-300 hover:bg-slate-100 focus-visible:ring-3 focus-visible:ring-cyan-100 disabled:opacity-35 motion-reduce:transition-none sm:h-16"
        >
          <Delete size={23} />
        </button>
      </div>
      <p className="sr-only" role="alert" aria-live="assertive">{error ?? ""}</p>
    </div>
  );
};
