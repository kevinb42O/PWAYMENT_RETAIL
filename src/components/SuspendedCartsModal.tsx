import React from "react";
import { Clock3, FileText, Play, Trash2, UserRound } from "lucide-react";
import { formatEUR } from "../utils/money";
import { Modal } from "./Modal";

export interface SuspendedCartListItem {
  id: string;
  /** A cashier-friendly name, normally the linked customer's name. */
  label: string;
  heldAt: number;
  lineCount: number;
  totalCents: number;
  documentLabel: string;
  customerName?: string;
}

interface SuspendedCartsModalProps {
  open: boolean;
  carts: SuspendedCartListItem[];
  onClose: () => void;
  onResume: (id: string) => void;
  onDiscard: (id: string) => void;
}

const heldAtLabel = (timestamp: number): string =>
  new Intl.DateTimeFormat("nl-BE", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestamp);

/**
 * The queue is intentionally terminal-local: a held cart is a paused checkout
 * flow, not an order, reservation or inventory movement. The parent owns the
 * safety decision when a cashier wants to switch away from a live cart.
 */
export const SuspendedCartsModal: React.FC<SuspendedCartsModalProps> = ({
  open,
  carts,
  onClose,
  onResume,
  onDiscard,
}) => (
  <Modal
    open={open}
    onClose={onClose}
    title="Wachtende klanten"
    subtitle={
      carts.length === 1
        ? "1 mandje op deze kassa"
        : `${carts.length} mandjes op deze kassa`
    }
    icon={<Clock3 size={20} />}
    size="lg"
    footer={
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50"
        >
          Sluiten
        </button>
      </div>
    }
  >
    {carts.length === 0 ? (
      <div className="flex min-h-48 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 text-center">
        <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-white text-slate-400 shadow-sm">
          <Clock3 size={22} />
        </div>
        <p className="text-sm font-bold text-slate-800">Geen klanten in wacht</p>
        <p className="mt-1 max-w-sm text-xs leading-relaxed text-slate-500">
          Zet een mandje in wacht wanneer een klant even tijd nodig heeft. Er wordt
          pas iets geboekt zodra je effectief afrekent.
        </p>
      </div>
    ) : (
      <div className="space-y-2" aria-label="Wachtende mandjes">
        <p className="px-1 text-xs leading-relaxed text-slate-500">
          Oudste eerst. Een mandje in wacht houdt niets vast: voorraad en
          cadeaubons worden opnieuw gecontroleerd bij betaling.
        </p>
        {carts.map((cart, index) => (
          <article
            key={cart.id}
            className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-sky-50 text-[11px] font-black text-sky-700">
                    {index + 1}
                  </span>
                  <h3 className="truncate text-sm font-black text-slate-900">
                    {cart.label}
                  </h3>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 pl-8 text-xs font-medium text-slate-500">
                  <span>{heldAtLabel(cart.heldAt)}</span>
                  <span>{cart.lineCount} {cart.lineCount === 1 ? "artikel" : "artikels"}</span>
                  {cart.customerName && (
                    <span className="inline-flex items-center gap-1">
                      <UserRound size={12} /> {cart.customerName}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1">
                    <FileText size={12} /> {cart.documentLabel}
                  </span>
                </div>
              </div>
              <strong className="shrink-0 pt-0.5 text-sm tabular-nums text-slate-900">
                {formatEUR(cart.totalCents)}
              </strong>
            </div>
            <div className="mt-3 flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => onDiscard(cart.id)}
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-bold text-red-600 transition-colors hover:bg-red-50"
                aria-label={`${cart.label} verwijderen uit wachtrij`}
              >
                <Trash2 size={14} /> Verwijderen
              </button>
              <button
                type="button"
                onClick={() => onResume(cart.id)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-sky-700 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-sky-800"
              >
                <Play size={14} fill="currentColor" /> Hervatten
              </button>
            </div>
          </article>
        ))}
      </div>
    )}
  </Modal>
);
