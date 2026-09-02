import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

export type ButtonVariant = "primary" | "secondary" | "quiet" | "danger";
export type ButtonSize = "sm" | "md" | "icon";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
}

const variants: Record<ButtonVariant, string> = {
  primary: "border-[#0e7490] bg-[#0e7490] !text-white shadow-[0_1px_2px_rgba(15,23,42,0.08)] hover:border-[#0f6677] hover:bg-[#0f6677]",
  secondary: "border-slate-200 bg-white text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950",
  quiet: "border-transparent bg-transparent text-slate-600 hover:bg-slate-50 hover:text-[#0e7490]",
  danger: "border-rose-200 bg-white text-rose-700 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-800",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-8 gap-1.5 rounded-lg px-2.5 text-xs",
  md: "h-9 gap-2 rounded-xl px-3.5 text-xs",
  icon: "h-9 w-9 rounded-xl p-0",
};

export const Button = ({
  variant = "secondary",
  size = "md",
  className,
  type,
  children,
  ...props
}: ButtonProps) => (
  <button
    // Action buttons keep the safe `button` default. A Button without an
    // onClick inside a form is the form's primary action, so it must submit.
    // Callers can always override this explicitly with `type`.
    type={type ?? (props.onClick ? "button" : "submit")}
    data-button-variant={variant}
    className={cn(
      "inline-flex items-center justify-center border font-semibold transition-colors",
      "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#38bdf8] focus-visible:ring-offset-2",
      "disabled:cursor-not-allowed disabled:opacity-50",
      variants[variant],
      sizes[size],
      className,
    )}
    {...props}
  >
    {children}
  </button>
);
