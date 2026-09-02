import React, { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useTheme } from "../store/useTheme";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  iconVariant?: "filled" | "bare";
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl" | "2xl" | "3xl" | "4xl" | "5xl";
  variant?: "light" | "dark";
  className?: string;
  bodyClassName?: string;
  closeOnBackdrop?: boolean;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
}

const sizeClass: Record<NonNullable<ModalProps["size"]>, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-5xl",
  "2xl": "max-w-2xl",
  "3xl": "max-w-3xl",
  "4xl": "max-w-4xl",
  "5xl": "max-w-5xl",
};

export const Modal: React.FC<ModalProps> = ({
  open,
  onClose,
  title,
  subtitle,
  icon,
  iconVariant = "filled",
  children,
  footer,
  size = "md",
  variant = "light",
  className = "",
  bodyClassName,
  closeOnBackdrop = false,
  initialFocusRef,
}) => {
  const themeMode = useTheme((state) => state.mode);
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    const focusable = initialFocusRef?.current ?? dialog?.querySelector<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
    );
    requestAnimationFrame(() => {
      if (!dialog?.contains(document.activeElement))
        (focusable ?? dialog)?.focus();
    });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialog) return;
      const elements = [
        ...dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ),
      ];
      if (elements.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previous?.focus();
    };
  }, [open, initialFocusRef]);

  if (!open) return null;
  // A light component variant is allowed to follow the app's active mode. This
  // keeps every operational dialog legible when Kassa switches to dark mode.
  const isLight = variant === "light" && themeMode !== "dark";

  return createPortal(
    <div
      className="modal-overlay fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 sm:p-6 overflow-y-auto animate-in fade-in duration-150"
      onClick={(event) => {
        if (closeOnBackdrop && event.target === event.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`${
          isLight
            ? "bg-white border border-slate-200 text-slate-900 shadow-[0_18px_55px_rgba(15,23,42,0.18)]"
            : "bg-slate-900 border border-slate-800 text-slate-100 shadow-2xl shadow-black/50"
        } rounded-3xl w-full ${sizeClass[size]} ${className} flex flex-col max-h-[92vh] my-auto overflow-hidden transition-all`}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={`flex items-center justify-between px-6 py-4.5 border-b ${
            isLight
              ? "border-slate-200 bg-slate-50/80"
              : "border-slate-800 bg-slate-900/50"
          }`}
        >
          <div className="flex items-center gap-3 min-w-0 pr-4">
            {icon && (
              <div
                className={iconVariant === "bare"
                  ? "shrink-0"
                  : `p-2.5 rounded-2xl shrink-0 ${
                    isLight
                      ? "bg-[#0e7490] text-white shadow-[0_1px_2px_rgba(15,23,42,0.08)]"
                      : "bg-slate-800 text-slate-100"
                  }`}
              >
                {icon}
              </div>
            )}
            <div className="min-w-0">
              <h2
                id={titleId}
                className={`text-base sm:text-lg font-black tracking-tight truncate ${isLight ? "text-slate-900" : "text-slate-100"}`}
              >
                {title}
              </h2>
              {subtitle && (
                <div
                  className={`text-xs font-medium truncate ${isLight ? "text-slate-500" : "text-slate-400"}`}
                >
                  {subtitle}
                </div>
              )}
            </div>
          </div>

          <button
            onClick={onClose}
            className={`p-2 rounded-xl ${
              isLight
                ? "text-slate-400 hover:bg-[#f0f9ff] hover:text-[#0e7490]"
                : "text-slate-400 hover:bg-slate-800 hover:text-white"
            } transition-colors shrink-0`}
            title="Sluiten"
            aria-label="Venster sluiten"
          >
            <X size={18} />
          </button>
        </div>

        <div className={`flex-1 overflow-y-auto custom-scrollbar ${bodyClassName ?? "p-6 space-y-6"}`}>
          {children}
        </div>

        {footer && (
          <div
            className={`px-6 py-4 border-t ${
              isLight
                ? "border-slate-200 bg-slate-50/80"
                : "border-slate-800/80 bg-slate-900/50"
            }`}
          >
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
};
