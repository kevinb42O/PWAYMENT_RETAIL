import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Combines conditional Tailwind classes without allowing conflicting utilities to leak. */
export const cn = (...values: ClassValue[]) => twMerge(clsx(values));
