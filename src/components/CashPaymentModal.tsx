import React, { useEffect, useState } from "react";
import { Modal } from "./Modal";
import { formatEUR } from "../utils/money";
import { MAX_CASH_PAYMENT_CENTS } from "../utils/cashRounding";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Amount actually due in cash after statutory five-cent rounding. */
  totalCents: number;
  /** Exact commercial cash share before rounding, shown for transparency. */
  commercialTotalCents?: number;
  /** Settlement total minus commercial amount; zero for an exact multiple of €0,05. */
  roundingAdjustmentCents?: number;
  onConfirm: (tenderedCents: number) => void;
}

const QUICK_NOTES_CENTS = [500, 1000, 2000, 5000, 10000];

export const CashPaymentModal: React.FC<Props> = ({
  open,
  onClose,
  totalCents,
  commercialTotalCents = totalCents,
  roundingAdjustmentCents = totalCents - commercialTotalCents,
  onConfirm,
}) => {
  const [tenderedCents, setTenderedCents] = useState<number>(totalCents);
  const [manualEntryStarted, setManualEntryStarted] = useState(false);

  useEffect(() => {
    if (open) {
      setTenderedCents(totalCents);
      setManualEntryStarted(false);
    }
  }, [open, totalCents]);

  const change = tenderedCents - totalCents;
  const insufficient = tenderedCents < totalCents;
  const exceedsCashLimit =
    totalCents > MAX_CASH_PAYMENT_CENTS ||
    tenderedCents > MAX_CASH_PAYMENT_CENTS;
  const cannotConfirm = insufficient || exceedsCashLimit;

  const setNearestNote = (note: number) => {
    // Take ceiling: smallest multiple of `note` >= total.
    const ceil = Math.ceil(totalCents / note) * note;
    setTenderedCents(ceil);
    setManualEntryStarted(false);
  };

  const press = (digit: string) => {
    setTenderedCents((cur) => {
      // Treat as cents shifted: x*10 + d
      const next = manualEntryStarted
        ? cur * 10 + Number(digit)
        : Number(digit);
      if (next > 99_999_900) return cur;
      return next;
    });
    setManualEntryStarted(true);
  };

  const back = () => {
    setTenderedCents((cur) => (manualEntryStarted ? Math.floor(cur / 10) : 0));
    setManualEntryStarted(true);
  };
  const clear = () => {
    setTenderedCents(0);
    setManualEntryStarted(true);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Contante betaling"
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700"
          >
            Annuleren
          </button>
          <button
            disabled={cannotConfirm}
            onClick={() => onConfirm(tenderedCents)}
            className={`px-4 py-2 rounded-lg font-bold ${
              cannotConfirm
                ? "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                : "bg-emerald-600 hover:bg-emerald-500 text-white"
            }`}
          >
            Betaling bevestigen
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3">
            <div className="text-zinc-500 text-xs uppercase tracking-wider">
              Totaal
            </div>
            <div className="text-2xl font-bold tabular-nums">
              {formatEUR(totalCents)}
            </div>
          </div>
          <div
            className={`rounded-xl p-3 border ${
              insufficient
                ? "bg-red-950/40 border-red-800"
                : change === 0
                  ? "bg-emerald-950/40 border-emerald-800"
                  : "bg-amber-950/40 border-amber-700"
            }`}
          >
            <div className="text-zinc-400 text-xs uppercase tracking-wider">
              {insufficient ? "Tekort" : exceedsCashLimit ? "Cashlimiet" : "Wisselgeld"}
            </div>
            <div
              className={`text-2xl font-bold tabular-nums ${
                insufficient
                  ? "text-red-300"
                  : change === 0
                    ? "text-emerald-300"
                    : "text-amber-300"
              }`}
            >
              {formatEUR(Math.abs(change))}
            </div>
          </div>
        </div>

        {roundingAdjustmentCents !== 0 && (
          <div className="rounded-xl border border-amber-700/70 bg-amber-950/30 p-3 text-sm">
            <div className="flex justify-between gap-3 text-amber-100">
              <span>Commercieel cashbedrag</span>
              <span className="tabular-nums">{formatEUR(commercialTotalCents)}</span>
            </div>
            <div className="mt-1 flex justify-between gap-3 font-bold text-amber-200">
              <span>Wettelijke cashafronding</span>
              <span className="tabular-nums">
                {roundingAdjustmentCents > 0 ? "+" : ""}
                {formatEUR(roundingAdjustmentCents)}
              </span>
            </div>
          </div>
        )}

        <div>
          <label className="block text-xs uppercase tracking-wider text-zinc-500 mb-2">
            Ontvangen
          </label>
          <div className="px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl text-3xl font-bold text-right tabular-nums">
            {formatEUR(tenderedCents)}
          </div>
        </div>

        <div>
          <div className="text-xs uppercase tracking-wider text-zinc-500 mb-2">
            Snelkeuze
          </div>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => {
                setTenderedCents(totalCents);
                setManualEntryStarted(false);
              }}
              className="py-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 font-bold"
            >
              Exact
            </button>
            {QUICK_NOTES_CENTS.map((n) => (
              <button
                key={n}
                onClick={() => setNearestNote(n)}
                className="py-3 rounded-lg bg-zinc-900 hover:bg-zinc-800 font-bold tabular-nums"
              >
                €{n / 100}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="grid grid-cols-3 gap-2">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
              <button
                key={d}
                onClick={() => press(d)}
                className="py-4 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-2xl font-bold"
              >
                {d}
              </button>
            ))}
            <button
              onClick={clear}
              className="py-4 rounded-lg bg-zinc-900 hover:bg-zinc-800 font-bold text-zinc-400"
            >
              C
            </button>
            <button
              onClick={() => press("0")}
              className="py-4 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-2xl font-bold"
            >
              0
            </button>
            <button
              onClick={back}
              className="py-4 rounded-lg bg-zinc-900 hover:bg-zinc-800 font-bold text-zinc-400"
            >
              ⌫
            </button>
          </div>
          <p className="text-[11px] text-zinc-500 mt-2">
            De eerste cijfertoets vervangt het vooringevulde bedrag. Typ "2000"
            voor €20,00.
          </p>
          {exceedsCashLimit && (
            <p role="alert" className="mt-2 text-xs font-medium text-amber-300">
              Cashbetalingen zijn beperkt tot {formatEUR(MAX_CASH_PAYMENT_CENTS)}. Laat het restant elektronisch betalen.
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
};
