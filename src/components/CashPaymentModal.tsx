import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Banknote, Check, Delete, Undo2 } from "lucide-react";
import { Modal } from "./Modal";
import { Button } from "./ui/Button";
import { formatEUR } from "../utils/money";
import { MAX_CASH_PAYMENT_CENTS } from "../utils/cashRounding";
import {
  cashEntryToCents,
  cashQuickAmounts,
  formatCashEntry,
  sanitizeCashEntry,
} from "../utils/cashPaymentInput";
import { playRegisterSound } from "../sound/registerSounds";

interface Props {
  open: boolean;
  onClose: () => void;
  totalCents: number;
  commercialTotalCents?: number;
  roundingAdjustmentCents?: number;
  onConfirm: (tenderedCents: number) => void;
}

const keypadRows = [["7", "8", "9"], ["4", "5", "6"], ["1", "2", "3"]];

export const CashPaymentModal: React.FC<Props> = ({
  open,
  onClose,
  totalCents,
  commercialTotalCents = totalCents,
  roundingAdjustmentCents = totalCents - commercialTotalCents,
  onConfirm,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [entry, setEntry] = useState(() => formatCashEntry(totalCents));
  const [replaceOnNextInput, setReplaceOnNextInput] = useState(true);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!open) return;
    setEntry(formatCashEntry(totalCents));
    setReplaceOnNextInput(true);
    setConfirming(false);
    const frame = requestAnimationFrame(() => inputRef.current?.select());
    return () => cancelAnimationFrame(frame);
  }, [open, totalCents]);

  const tenderedCents = cashEntryToCents(entry);
  const changeCents = tenderedCents - totalCents;
  const insufficient = tenderedCents < totalCents;
  const exceedsCashLimit = totalCents > MAX_CASH_PAYMENT_CENTS || tenderedCents > MAX_CASH_PAYMENT_CENTS;
  const cannotConfirm = insufficient || exceedsCashLimit || confirming;
  const quickAmounts = useMemo(() => cashQuickAmounts(totalCents), [totalCents]);

  const focusAndSelect = () => {
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  };

  const chooseAmount = (cents: number) => {
    setEntry(formatCashEntry(cents));
    setReplaceOnNextInput(true);
    void playRegisterSound("cash-key");
    focusAndSelect();
  };

  const appendKey = (key: string) => {
    setEntry((current) => {
      const base = replaceOnNextInput ? "" : current;
      if (key === ",") {
        if (base.includes(",")) return base;
        return `${base || "0"},`;
      }
      return sanitizeCashEntry(`${base}${key}`);
    });
    setReplaceOnNextInput(false);
    void playRegisterSound("cash-key");
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const backspace = () => {
    setEntry((current) => replaceOnNextInput ? "" : current.slice(0, -1));
    setReplaceOnNextInput(false);
    void playRegisterSound("cash-key");
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const clear = () => {
    setEntry("");
    setReplaceOnNextInput(false);
    void playRegisterSound("cash-key");
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const confirm = useCallback(() => {
    if (cannotConfirm) return;
    setConfirming(true);
    onConfirm(tenderedCents);
  }, [cannotConfirm, onConfirm, tenderedCents]);

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const next = sanitizeCashEntry(event.target.value);
    if (next === entry) return;
    void playRegisterSound("cash-key");
    setEntry(next);
    setReplaceOnNextInput(false);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Contante betaling"
      subtitle="Voer in wat de klant u geeft"
      icon={<Banknote size={19} />}
      size="2xl"
      initialFocusRef={inputRef}
      className="cash-payment-modal max-h-[92dvh]"
      bodyClassName="p-4 sm:p-6"
      footer={
        <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span className="cash-payment-shortcuts hidden text-[11px] font-medium sm:block">
            <kbd className="cash-payment-shortcut rounded px-1.5 py-0.5 font-sans">Esc</kbd> annuleren
            <span className="cash-payment-shortcuts__separator mx-2">·</span>
            <kbd className="cash-payment-shortcut rounded px-1.5 py-0.5 font-sans">Enter</kbd> bevestigen
          </span>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <Button variant="secondary" onClick={onClose} className="h-11 px-5 text-sm">Annuleren</Button>
            <Button aria-label="Betaling bevestigen" variant="primary" disabled={cannotConfirm} onClick={confirm} className="h-11 px-3 text-xs font-extrabold sm:px-5 sm:text-sm">
              <Check size={17} /> {confirming ? "Bezig…" : <><span className="sm:hidden">Bevestigen</span><span className="hidden sm:inline">Betaling bevestigen</span></>}
            </Button>
          </div>
        </div>
      }
    >
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-[minmax(0,0.9fr)_minmax(280px,1.1fr)] md:gap-6">
        <div className="min-w-0 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="cash-payment-stat rounded-2xl border p-3.5">
              <div className="cash-payment-label text-[10px] font-extrabold uppercase tracking-[0.13em]">Te betalen</div>
              <div className="cash-payment-value mt-1 text-xl font-black tabular-nums">{formatEUR(totalCents)}</div>
            </div>
            <div className={`cash-payment-change cash-payment-change--${exceedsCashLimit ? "limit" : insufficient ? "needed" : "ready"} rounded-2xl border p-3.5`}>
              <div className="cash-payment-change-label text-[10px] font-extrabold uppercase tracking-[0.13em]">
                {exceedsCashLimit ? "Cashlimiet" : insufficient ? "Nog nodig" : changeCents === 0 ? "Wisselgeld" : "Terug te geven"}
              </div>
              <div aria-live="polite" className="cash-payment-change-value mt-1 text-xl font-black tabular-nums">
                {formatEUR(Math.abs(changeCents))}
              </div>
            </div>
          </div>

          <div>
            <span className="mb-2 flex items-center justify-between gap-3">
              <label htmlFor="cash-tendered-amount" className="cash-payment-label text-[11px] font-extrabold uppercase tracking-[0.13em]">Ontvangen</label>
              <button type="button" onClick={clear} className="cash-payment-clear inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#38bdf8]">
                <Delete size={13} /> Wissen
              </button>
            </span>
            <span className="cash-payment-input-shell flex min-h-16 items-center rounded-2xl border-2 px-4 transition">
              <span className="cash-payment-currency mr-2 text-2xl font-black">€</span>
              <input
                id="cash-tendered-amount"
                ref={inputRef}
                aria-label="Ontvangen bedrag"
                value={entry}
                onChange={handleInputChange}
                onFocus={(event) => { if (replaceOnNextInput) event.currentTarget.select(); }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    if (!cannotConfirm) confirm();
                  }
                }}
                inputMode="decimal"
                autoComplete="off"
                spellCheck={false}
                placeholder="0,00"
                className="cash-payment-input min-w-0 flex-1 bg-transparent text-right text-3xl font-black tabular-nums outline-none"
              />
            </span>
          </div>

          {roundingAdjustmentCents !== 0 && (
            <div className="cash-payment-rounding rounded-xl border px-3.5 py-3 text-[11px]">
              <div className="flex justify-between gap-3"><span>Commercieel cashbedrag</span><span className="font-bold tabular-nums">{formatEUR(commercialTotalCents)}</span></div>
              <div className="mt-1 flex justify-between gap-3 font-bold"><span>Wettelijke cashafronding</span><span className="tabular-nums">{roundingAdjustmentCents > 0 ? "+" : ""}{formatEUR(roundingAdjustmentCents)}</span></div>
            </div>
          )}

          {exceedsCashLimit && (
            <p role="alert" className="cash-payment-limit-alert rounded-xl border px-3.5 py-3 text-xs font-semibold leading-5">
              Cashbetalingen zijn beperkt tot {formatEUR(MAX_CASH_PAYMENT_CENTS)}. Laat het restant elektronisch betalen.
            </p>
          )}
          {!exceedsCashLimit && insufficient && (
            <p className="cash-payment-insufficient text-xs font-medium">Er ontbreekt nog {formatEUR(totalCents - tenderedCents)} om deze betaling te bevestigen.</p>
          )}
        </div>

        <div className="min-w-0 space-y-3">
          <div>
            <div className="cash-payment-label mb-2 text-[11px] font-extrabold uppercase tracking-[0.13em]">Snel ontvangen</div>
            <div className="grid grid-cols-3 gap-2">
              <Button variant="primary" onClick={() => chooseAmount(totalCents)} className="cash-payment-key cash-payment-key--primary h-11 px-2 text-sm font-extrabold">Exact</Button>
              {quickAmounts.slice(0, 2).map((amount) => (
                <Button key={amount} variant="secondary" onClick={() => chooseAmount(amount)} className="cash-payment-key h-11 px-2 text-sm font-extrabold tabular-nums">
                  {formatEUR(amount).replace(",00", "")}
                </Button>
              ))}
            </div>
            {quickAmounts.length > 2 && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                {quickAmounts.slice(2).map((amount) => (
                  <Button key={amount} variant="secondary" onClick={() => chooseAmount(amount)} className="cash-payment-key h-9 px-2 text-xs font-bold tabular-nums">
                    {formatEUR(amount).replace(",00", "")}
                  </Button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2" aria-label="Numeriek toetsenblok">
            {keypadRows.flat().map((digit) => (
              <Button key={digit} variant="secondary" onClick={() => appendKey(digit)} aria-label={`Cijfer ${digit}`} className="cash-payment-key h-12 px-2 text-xl font-black active:translate-y-px sm:h-14">
                {digit}
              </Button>
            ))}
            <Button variant="secondary" onClick={() => appendKey(",")} aria-label="Decimale komma" className="cash-payment-key h-12 px-2 text-xl font-black active:translate-y-px sm:h-14">,</Button>
            <Button variant="secondary" onClick={() => appendKey("0")} aria-label="Cijfer 0" className="cash-payment-key h-12 px-2 text-xl font-black active:translate-y-px sm:h-14">0</Button>
            <Button variant="secondary" onClick={backspace} aria-label="Laatste cijfer verwijderen" className="cash-payment-key h-12 px-2 active:translate-y-px sm:h-14"><Undo2 size={20} /></Button>
          </div>
          <p className="cash-payment-hint text-center text-[10px] font-medium">Typ rechtstreeks met uw toetsenbord of externe numerieke keypad.</p>
        </div>
      </div>
    </Modal>
  );
};
