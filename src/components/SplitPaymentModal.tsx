import React, { useEffect, useMemo, useState } from "react";
import { Banknote, CreditCard, Equal, Layers2 } from "lucide-react";
import { Modal } from "./Modal";
import { formatEUR, parseDecimalToCents } from "../utils/money";
import type { CheckoutTenderInput } from "../services/checkout";
import {
  cashRoundingAdjustmentCents,
  MAX_CASH_PAYMENT_CENTS,
  roundCashSettlementCents,
} from "../utils/cashRounding";

interface Props {
  open: boolean;
  totalCents: number;
  onClose: () => void;
  onConfirm: (tenders: CheckoutTenderInput[]) => void;
  onUseGiftCard: () => void;
}

/**
 * Purposefully compact: the cashier enters only the exceptional card amount;
 * the cash remainder is derived, so the payment plan always balances exactly.
 */
export const SplitPaymentModal: React.FC<Props> = ({
  open,
  totalCents,
  onClose,
  onConfirm,
  onUseGiftCard,
}) => {
  const [cardAmountText, setCardAmountText] = useState("0,00");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setCardAmountText("0,00");
      setError(null);
    }
  }, [open]);

  const parsedCard = useMemo(
    () => parseDecimalToCents(cardAmountText),
    [cardAmountText],
  );
  const cardCents = parsedCard.ok ? parsedCard.cents : 0;
  const commercialCashCents = Math.max(0, totalCents - cardCents);
  const cashCents = roundCashSettlementCents(commercialCashCents);
  const roundingAdjustmentCents = cashRoundingAdjustmentCents(commercialCashCents);
  const invalid =
    !parsedCard.ok ||
    cardCents < 0 ||
    cardCents > totalCents ||
    cashCents > MAX_CASH_PAYMENT_CENTS;

  const confirm = () => {
    if (invalid) {
      setError(
        !parsedCard.ok
          ? "Voer een geldig kaartbedrag in."
          : cardCents > totalCents
            ? "Het kaartbedrag kan niet hoger zijn dan het totaal."
            : `Het cashdeel mag maximaal ${formatEUR(MAX_CASH_PAYMENT_CENTS)} bedragen.`,
      );
      return;
    }
    const tenders: CheckoutTenderInput[] = [];
    if (cardCents > 0) tenders.push({ method: "PIN", amountCents: cardCents });
    if (commercialCashCents > 0) {
      tenders.push({ method: "Cash", amountCents: cashCents });
    }
    if (tenders.length === 0) {
      setError("Kies minstens één betaalwijze.");
      return;
    }
    onConfirm(tenders);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
        title="Deels betalen"
        subtitle="Voer alleen het kaartbedrag in; het cash-restant wordt automatisch berekend en volgens de 5-centregel afgerond."
      size="lg"
      variant="light"
      footer={
        <div className="flex flex-wrap justify-between gap-2">
          <button
            type="button"
            onClick={onUseGiftCard}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-bold text-emerald-800 hover:bg-emerald-50"
          >
            <Layers2 size={16} /> Cadeaubon gebruiken
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-zinc-100 px-4 py-2 text-sm font-bold text-zinc-700 hover:bg-zinc-200"
            >
              Annuleren
            </button>
            <button
              type="button"
              disabled={invalid}
              onClick={confirm}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-bold text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-400"
            >
              Verder met betaling
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
          <span className="text-xs font-bold uppercase tracking-wide text-zinc-500">
            Totaal te betalen
          </span>
          <strong className="text-2xl tabular-nums text-zinc-950">
            {formatEUR(totalCents)}
          </strong>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <label className="flex items-center justify-between gap-4" htmlFor="split-card-amount">
            <span className="flex items-center gap-2 text-sm font-bold text-zinc-900">
              <CreditCard size={18} className="text-cyan-700" /> Kaart
            </span>
            <input
              id="split-card-amount"
              autoFocus
              inputMode="decimal"
              value={cardAmountText}
              onChange={(event) => {
                setCardAmountText(event.target.value);
                setError(null);
              }}
              className="w-32 rounded-lg border border-zinc-300 px-3 py-2 text-right font-mono text-base font-extrabold tabular-nums text-zinc-950 outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-600/20"
              aria-describedby="split-payment-help"
            />
          </label>
          <button
            type="button"
            onClick={() => setCardAmountText((totalCents / 100).toFixed(2).replace(".", ","))}
            className="mt-2 text-xs font-bold text-cyan-800 hover:text-cyan-950"
          >
            Volledig met kaart betalen ({formatEUR(totalCents)})
          </button>
        </div>

        <div className="flex items-center justify-center text-zinc-300" aria-hidden="true">
          <Equal size={18} />
        </div>

        <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <span className="flex items-center gap-2 text-sm font-bold text-emerald-900">
            <Banknote size={18} /> Contant restant (afgerond)
          </span>
          <strong className="text-xl tabular-nums text-emerald-950">
            {invalid ? "—" : formatEUR(cashCents)}
          </strong>
        </div>

        {!invalid && roundingAdjustmentCents !== 0 && (
          <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <span>Wettelijke cashafronding op {formatEUR(commercialCashCents)}</span>
            <strong className="tabular-nums">
              {roundingAdjustmentCents > 0 ? "+" : ""}
              {formatEUR(roundingAdjustmentCents)}
            </strong>
          </div>
        )}

        <p id="split-payment-help" className="text-xs leading-5 text-zinc-500">
          Na deze stap registreer je het ontvangen cashbedrag en eventueel wisselgeld. Kaart en cash worden afzonderlijk op één verkoop geboekt.
        </p>
        {error && (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
};
