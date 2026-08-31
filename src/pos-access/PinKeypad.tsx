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
    <div className="w-full" aria-label={label}>
      <div
        className="mb-7 flex min-h-8 items-center justify-center gap-3"
        role="status"
        aria-live="polite"
        aria-label={`${value.length} van 6 cijfers ingevoerd`}
      >
        {Array.from({ length: 6 }).map((_, index) => (
          <span
            key={index}
            className={`h-3.5 w-3.5 rounded-full border-2 transition-[background-color,border-color,transform] motion-reduce:transition-none ${
              index < value.length
                ? "scale-105 border-cyan-700 bg-cyan-700"
                : "border-slate-300 bg-white"
            }`}
          />
        ))}
        {disabled && <LoaderCircle size={19} className="ml-1 animate-spin text-cyan-700 motion-reduce:animate-none" aria-label="PIN controleren" />}
      </div>

      <div className="mx-auto grid w-full max-w-[330px] grid-cols-3 gap-3 sm:gap-3.5">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
          <button
            key={digit}
            type="button"
            disabled={disabled}
            onClick={() => append(digit)}
            aria-label={`Cijfer ${digit}`}
            className="flex h-16 min-h-14 touch-manipulation items-center justify-center rounded-2xl border border-slate-200 bg-white text-2xl font-black tabular-nums text-slate-950 shadow-sm outline-none transition hover:border-cyan-300 hover:bg-cyan-50 active:scale-[0.97] focus-visible:border-cyan-600 focus-visible:ring-4 focus-visible:ring-cyan-100 disabled:cursor-wait disabled:opacity-55 motion-reduce:transition-none sm:h-[4.5rem]"
          >
            {digit}
          </button>
        ))}
        <button
          type="button"
          disabled={disabled || value.length === 0}
          onClick={() => onChange("")}
          className="flex h-16 min-h-14 touch-manipulation items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-xs font-extrabold text-slate-600 outline-none transition hover:border-slate-300 hover:bg-slate-100 focus-visible:ring-4 focus-visible:ring-cyan-100 disabled:opacity-35 motion-reduce:transition-none sm:h-[4.5rem]"
        >
          Wis
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => append("0")}
          aria-label="Cijfer 0"
          className="flex h-16 min-h-14 touch-manipulation items-center justify-center rounded-2xl border border-slate-200 bg-white text-2xl font-black tabular-nums text-slate-950 shadow-sm outline-none transition hover:border-cyan-300 hover:bg-cyan-50 active:scale-[0.97] focus-visible:border-cyan-600 focus-visible:ring-4 focus-visible:ring-cyan-100 disabled:cursor-wait disabled:opacity-55 motion-reduce:transition-none sm:h-[4.5rem]"
        >
          0
        </button>
        <button
          type="button"
          disabled={disabled || value.length === 0}
          onClick={() => onChange(value.slice(0, -1))}
          aria-label="Laatste cijfer wissen"
          className="flex h-16 min-h-14 touch-manipulation items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-600 outline-none transition hover:border-slate-300 hover:bg-slate-100 focus-visible:ring-4 focus-visible:ring-cyan-100 disabled:opacity-35 motion-reduce:transition-none sm:h-[4.5rem]"
        >
          <Delete size={23} />
        </button>
      </div>
      <p className="sr-only" role="alert" aria-live="assertive">{error ?? ""}</p>
    </div>
  );
};
