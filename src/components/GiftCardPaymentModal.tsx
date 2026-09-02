import React, { useState, useMemo, useEffect } from "react";
import {
  Gift,
  ScanLine,
  Users,
  CreditCard,
  Banknote,
  ShoppingCart,
} from "lucide-react";
import { Modal } from "./Modal";
import { useCustomers } from "../store/useCustomers";
import { formatEUR, parseDecimalToCents } from "../utils/money";
import {
  defaultGiftCardSelectionId,
  isGiftCardExpired,
} from "../utils/giftCards";

export interface GiftCardAllocationItem {
  id: string;
  amountCents: number;
  code: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  totalCents: number;
  appliedCentsByCardId?: Record<string, number>;
  linkedCustomerId?: string | null;
  onConfirm: (
    allocations: GiftCardAllocationItem[],
    splitMethod?: "Cash" | "PIN",
  ) => void;
}

export const GiftCardPaymentModal: React.FC<Props> = ({
  open,
  onClose,
  totalCents,
  appliedCentsByCardId = {},
  linkedCustomerId,
  onConfirm,
}) => {
  const [selectedOptionKey, setSelectedOptionKey] = useState<string>("");
  const [manualCode, setManualCode] = useState("");
  const [customAmountText, setCustomAmountText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { customers, giftCards, hydrate, findGiftCardByCode } = useCustomers();

  // Force re-read fresh gift card rows from IndexedDB whenever modal opens
  useEffect(() => {
    if (open) {
      void hydrate(true);
    }
  }, [open, hydrate]);

  const availableCents = (cardId: string, balanceCents: number) =>
    Math.max(0, balanceCents - (appliedCentsByCardId[cardId] ?? 0));

  const customerMap = useMemo(() => {
    const map = new Map<string, string>();
    customers.forEach((c) => map.set(c.id, c.name));
    return map;
  }, [customers]);

  const validGiftCards = useMemo(() => {
    return giftCards
      .filter(
        (gc) =>
          gc.isActive &&
          !isGiftCardExpired(gc) &&
          availableCents(gc.id, gc.balanceCents) > 0,
      )
      .map((gc) => ({
        ...gc,
        availableCents: availableCents(gc.id, gc.balanceCents),
        customerName: gc.customerId
          ? customerMap.get(gc.customerId) || "Onbekend"
          : "Anoniem",
        isLinkedCustomerCard: Boolean(
          linkedCustomerId &&
          String(gc.customerId || "").trim() ===
            String(linkedCustomerId).trim(),
        ),
      }))
      .sort((a, b) => {
        if (a.isLinkedCustomerCard && !b.isLinkedCustomerCard) return -1;
        if (!a.isLinkedCustomerCard && b.isLinkedCustomerCard) return 1;
        return a.customerName.localeCompare(b.customerName);
      });
  }, [giftCards, customerMap, appliedCentsByCardId, linkedCustomerId]);

  const linkedCustomerCards = useMemo(() => {
    if (!linkedCustomerId) return [];
    return validGiftCards.filter(
      (gc) =>
        String(gc.customerId || "").trim() === String(linkedCustomerId).trim(),
    );
  }, [linkedCustomerId, validGiftCards]);

  const linkedCustomerTotalBalance = useMemo(() => {
    return linkedCustomerCards.reduce((sum, gc) => sum + gc.availableCents, 0);
  }, [linkedCustomerCards]);

  const linkedCustomerName = useMemo(() => {
    if (!linkedCustomerId) return null;
    return customerMap.get(linkedCustomerId) ?? null;
  }, [linkedCustomerId, customerMap]);

  // Set default selection when modal opens or customer cards load
  useEffect(() => {
    if (!open) {
      setSelectedOptionKey("");
      setManualCode("");
      setCustomAmountText("");
      setError(null);
      return;
    }

    if (!selectedOptionKey && linkedCustomerId) {
      const defaultCardId = defaultGiftCardSelectionId(linkedCustomerCards);
      if (defaultCardId) setSelectedOptionKey(defaultCardId);
    }
  }, [open, linkedCustomerId, linkedCustomerCards, selectedOptionKey]);

  // Active selection metadata
  const currentSelectionInfo = useMemo(() => {
    if (selectedOptionKey === "ALL_LINKED" && linkedCustomerCards.length > 0) {
      return {
        label: `Alle cadeaubonnen van ${linkedCustomerName}`,
        maxAvailableCents: linkedCustomerTotalBalance,
        isMultiCard: true,
        cards: linkedCustomerCards,
      };
    }

    // Try finding by card ID or manual code
    const card =
      validGiftCards.find((gc) => gc.id === selectedOptionKey) ||
      (manualCode.trim() ? findGiftCardByCode(manualCode) : null);

    if (card && card.isActive && !isGiftCardExpired(card)) {
      const avail = availableCents(card.id, card.balanceCents);
      if (avail > 0) {
        return {
          label: `Cadeaubon (${card.code})`,
          maxAvailableCents: avail,
          isMultiCard: false,
          cards: [{ ...card, availableCents: avail }],
        };
      }
    }

    return null;
  }, [
    selectedOptionKey,
    manualCode,
    validGiftCards,
    linkedCustomerCards,
    linkedCustomerTotalBalance,
    linkedCustomerName,
    findGiftCardByCode,
    appliedCentsByCardId,
  ]);

  // Update default custom text whenever selection changes
  useEffect(() => {
    if (currentSelectionInfo) {
      const defaultCents = Math.min(
        totalCents,
        currentSelectionInfo.maxAvailableCents,
      );
      setCustomAmountText((defaultCents / 100).toFixed(2).replace(".", ","));
      setError(null);
    } else {
      setCustomAmountText("");
    }
  }, [currentSelectionInfo?.label, totalCents]);

  const parsedAmount = useMemo(() => {
    if (!customAmountText.trim()) return { ok: false, cents: 0 };
    return parseDecimalToCents(customAmountText);
  }, [customAmountText]);

  const deductCents = parsedAmount.ok ? parsedAmount.cents : 0;

  const validateSelection = (): { ok: boolean; message?: string } => {
    if (!currentSelectionInfo) {
      return { ok: false, message: "Selecteer of voer een cadeaubon in." };
    }
    if (!parsedAmount.ok || deductCents <= 0) {
      return {
        ok: false,
        message: "Voer een geldig bedrag in groter dan € 0,00.",
      };
    }
    if (deductCents > currentSelectionInfo.maxAvailableCents) {
      return {
        ok: false,
        message: `Het geselecteerde bedrag mag niet hoger zijn dan het beschikbare saldo (${formatEUR(currentSelectionInfo.maxAvailableCents)}).`,
      };
    }
    if (deductCents > totalCents) {
      return {
        ok: false,
        message: `Het geselecteerde bedrag mag niet hoger zijn dan het te betalen kassabedrag (${formatEUR(totalCents)}).`,
      };
    }
    return { ok: true };
  };

  const allocateAmount = (targetCents: number): GiftCardAllocationItem[] => {
    if (!currentSelectionInfo) return [];

    if (currentSelectionInfo.isMultiCard) {
      const result: GiftCardAllocationItem[] = [];
      let remaining = targetCents;
      for (const card of currentSelectionInfo.cards) {
        if (remaining <= 0) break;
        const take = Math.min(card.availableCents, remaining);
        if (take > 0) {
          result.push({ id: card.id, amountCents: take, code: card.code });
          remaining -= take;
        }
      }
      return result;
    }

    const singleCard = currentSelectionInfo.cards[0];
    return singleCard
      ? [{ id: singleCard.id, amountCents: targetCents, code: singleCard.code }]
      : [];
  };

  const handleConfirm = (splitMethod?: "Cash" | "PIN") => {
    setError(null);
    const val = validateSelection();
    if (!val.ok) {
      setError(val.message || "Ongeldige invoer.");
      return;
    }
    const allocations = allocateAmount(deductCents);
    onConfirm(allocations, splitMethod);
    setSelectedOptionKey("");
    setManualCode("");
    setCustomAmountText("");
  };

  const remainingOrderCents = Math.max(0, totalCents - deductCents);
  const remainingCardBalanceCents = currentSelectionInfo
    ? Math.max(0, currentSelectionInfo.maxAvailableCents - deductCents)
    : 0;

  return (
    <Modal
      open={open}
      onClose={() => {
        setSelectedOptionKey("");
        setManualCode("");
        setCustomAmountText("");
        setError(null);
        onClose();
      }}
      title="Cadeaubonbetaling"
      size="lg"
      variant="light"
      className="pos-checkout-dialog pos-gift-card-payment-modal"
    >
      <div className="space-y-5">
        {/* Header Summary */}
        <div className="flex items-center justify-between p-4 bg-zinc-50 border border-zinc-200/80 rounded-xl">
          <div>
            <div className="text-zinc-500 text-xs font-medium">
              Te betalen kassabedrag
            </div>
            <div className="text-2xl font-bold text-zinc-900 tabular-nums">
              {formatEUR(totalCents)}
            </div>
          </div>
          {linkedCustomerName && (
            <div className="text-right">
              <div className="text-zinc-500 text-xs font-medium">Klant</div>
              <div className="text-sm font-semibold text-zinc-900">
                {linkedCustomerName}
              </div>
              {linkedCustomerCards.length > 0 && (
                <div className="text-xs font-semibold text-zinc-700 tabular-nums mt-0.5">
                  Totaal cadeaubonnen: {formatEUR(linkedCustomerTotalBalance)}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Gift Card Selection */}
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1.5">
              Gekoppelde cadeaubon
            </label>
            <div className="relative">
              <Users
                size={18}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
              />
              <select
                value={selectedOptionKey}
                onChange={(e) => {
                  setSelectedOptionKey(e.target.value);
                  setManualCode("");
                  setError(null);
                }}
                className="w-full bg-white border border-zinc-300 rounded-lg pl-9 pr-4 py-2.5 text-zinc-900 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent transition-all cursor-pointer"
              >
                <option value="">-- Kies een gekoppelde bon --</option>
                {linkedCustomerCards.length > 1 && (
                  <option value="ALL_LINKED">
                    Combineer alle {linkedCustomerCards.length} cadeaubonnen van{' '}
                    {linkedCustomerName} (totaal: {formatEUR(linkedCustomerTotalBalance)})
                  </option>
                )}
                {linkedCustomerCards.length > 0 && (
                  <optgroup label={`Cadeaubonnen van ${linkedCustomerName}`}>
                    {linkedCustomerCards.map((gc) => (
                      <option key={gc.id} value={gc.id}>
                        Bon: {gc.code} — Saldo: {formatEUR(gc.availableCents)}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>
            {!linkedCustomerId && (
              <p className="mt-1.5 text-xs text-zinc-500">
                Scan of voer de bekende code in. Om privacyredenen worden
                kaarten van andere klanten niet getoond.
              </p>
            )}
          </div>

          <div className="relative flex items-center py-0.5">
            <div className="flex-grow border-t border-zinc-200"></div>
            <span className="flex-shrink-0 mx-3 text-zinc-400 text-[11px] font-semibold tracking-wider uppercase">
              Of typ handmatig / scan code
            </span>
            <div className="flex-grow border-t border-zinc-200"></div>
          </div>

          <div>
            <div className="relative">
              <ScanLine
                size={18}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
              />
              <input
                type="text"
                value={manualCode}
                onChange={(e) => {
                  const val = e.target.value.toUpperCase();
                  setManualCode(val);
                  if (val.trim()) {
                    setSelectedOptionKey("");
                  }
                  setError(null);
                }}
                placeholder="ABCD-1234-EFGH"
                className="w-full bg-white border border-zinc-300 rounded-lg pl-9 pr-4 py-2.5 text-zinc-900 placeholder-zinc-400 font-mono text-sm uppercase tracking-wider focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent transition-all"
              />
            </div>
          </div>

          {/* Active Selection Details Card */}
          {currentSelectionInfo && (
            <div className="p-4 bg-zinc-50 border border-zinc-200 rounded-xl space-y-3">
              <div className="flex items-center justify-between border-b border-zinc-200 pb-2.5">
                <div>
                  <div className="text-xs text-zinc-500 font-medium">
                    {currentSelectionInfo.label}
                  </div>
                  <div className="text-xs text-zinc-400 font-mono">
                    {currentSelectionInfo.isMultiCard
                      ? `${currentSelectionInfo.cards.length} actieve bonnen gecombineerd`
                      : currentSelectionInfo.cards[0]?.code}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-zinc-500 font-medium">
                    Beschikbaar saldo
                  </div>
                  <div className="text-base font-bold text-zinc-900 tabular-nums">
                    {formatEUR(currentSelectionInfo.maxAvailableCents)}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">
                  Te gebruiken bedrag (€)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={customAmountText}
                    onChange={(e) => {
                      setCustomAmountText(e.target.value);
                      setError(null);
                    }}
                    placeholder="0,00"
                    className="flex-1 bg-white border border-zinc-300 rounded-lg px-3 py-2 text-zinc-900 font-mono text-base font-bold focus:outline-none focus:ring-2 focus:ring-zinc-900"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const maxCents = Math.min(
                        totalCents,
                        currentSelectionInfo.maxAvailableCents,
                      );
                      setCustomAmountText(
                        (maxCents / 100).toFixed(2).replace(".", ","),
                      );
                    }}
                    className="px-3 py-2 bg-white border border-zinc-300 hover:bg-zinc-100 text-zinc-800 text-xs rounded-lg font-semibold transition-colors shadow-2xs"
                  >
                    Max (
                    {formatEUR(
                      Math.min(
                        totalCents,
                        currentSelectionInfo.maxAvailableCents,
                      ),
                    )}
                    )
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs bg-white p-2.5 rounded-lg border border-zinc-200">
                <div>
                  <span className="text-zinc-500">Saldo na verwerking:</span>
                  <div className="text-sm font-bold text-zinc-900 tabular-nums">
                    {formatEUR(remainingCardBalanceCents)}
                  </div>
                </div>
                <div>
                  <span className="text-zinc-500">Nog te voldoen:</span>
                  <div className="text-sm font-bold text-zinc-900 tabular-nums">
                    {formatEUR(remainingOrderCents)}
                  </div>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 font-medium">
              {error}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-2 pt-3 border-t border-zinc-200">
          {currentSelectionInfo && remainingOrderCents > 0 ? (
            <div className="space-y-2">
              <div className="text-xs text-zinc-500 text-center">
                Restant ({formatEUR(remainingOrderCents)}) direct afrekenen:
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleConfirm("PIN")}
                  className="py-2.5 px-4 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors shadow-xs"
                >
                  <CreditCard size={16} /> Kaart ({formatEUR(remainingOrderCents)}
                  )
                </button>
                <button
                  type="button"
                  onClick={() => handleConfirm("Cash")}
                  className="py-2.5 px-4 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors shadow-xs"
                >
                  <Banknote size={16} /> Cash ({formatEUR(remainingOrderCents)})
                </button>
              </div>
              <button
                type="button"
                onClick={() => handleConfirm()}
                className="w-full py-2 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
              >
                <ShoppingCart size={14} /> Toevoegen aan winkelwagen
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setSelectedOptionKey("");
                  setManualCode("");
                  setCustomAmountText("");
                  setError(null);
                  onClose();
                }}
                className="flex-1 py-2.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-semibold text-sm transition-colors"
              >
                Annuleren
              </button>
              <button
                type="button"
                onClick={() => handleConfirm()}
                disabled={
                  !currentSelectionInfo || !parsedAmount.ok || deductCents <= 0
                }
                className="flex-1 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 disabled:bg-zinc-200 disabled:text-zinc-400 text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors shadow-xs"
              >
                <Gift size={16} />{" "}
                {deductCents > 0
                  ? `Toepassen (${formatEUR(deductCents)})`
                  : "Toepassen"}
              </button>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};
