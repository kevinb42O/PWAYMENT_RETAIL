import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "./cn";

export const fieldClassName = "mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.05)] outline-none transition focus:border-[#38bdf8] focus:ring-3 focus:ring-[#0ea5e3]/10 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500";

export const TextField = ({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) => (
  <input className={cn(fieldClassName, className)} {...props} />
);

export const SelectField = ({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) => (
  <select className={cn(fieldClassName, className)} {...props} />
);

export const TextareaField = ({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea className={cn(fieldClassName, className)} {...props} />
);
