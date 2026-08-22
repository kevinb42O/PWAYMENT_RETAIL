import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

export const AppPageShell = ({ className, ...props }: HTMLAttributes<HTMLElement>) => (
  <main
    className={cn("app-page-shell flex min-h-0 flex-1 flex-col overflow-hidden text-slate-900", className)}
    {...props}
  />
);

export const PageHeader = ({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children?: ReactNode;
}) => (
  <header className="app-page-header border-b px-4 py-3 sm:px-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-bold tracking-[-0.02em] text-slate-950">{title}</h1>
        {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
        {children}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  </header>
);

export const PageContent = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("app-page-content min-h-0 flex-1 overflow-auto p-4 sm:p-6", className)} {...props} />
);
