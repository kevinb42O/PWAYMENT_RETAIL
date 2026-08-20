/**
 * Belgium rounds the amount settled in cash to the nearest five euro cents.
 * Product prices and VAT remain exact cents; only the cash settlement changes.
 */
export const CASH_ROUNDING_INCREMENT_CENTS = 5;
/** Belgian anti-money-laundering ceiling for a cash payment. */
export const MAX_CASH_PAYMENT_CENTS = 300_000;

/**
 * Return the amount that must actually be collected in cash. Values ending in
 * 1 or 2 cents round down; values ending in 3 or 4 cents round up.
 */
export const roundCashSettlementCents = (commercialCashCents: number): number => {
  if (!Number.isSafeInteger(commercialCashCents) || commercialCashCents < 0) {
    throw new RangeError("Cash amount must be a non-negative integer number of cents.");
  }
  // The statutory rule applies only above €0,05; a smaller total remains due
  // in full and must never be silently forgiven.
  if (commercialCashCents <= CASH_ROUNDING_INCREMENT_CENTS) {
    return commercialCashCents;
  }
  return Math.round(commercialCashCents / CASH_ROUNDING_INCREMENT_CENTS)
    * CASH_ROUNDING_INCREMENT_CENTS;
};

/** Positive means the rounded cash settlement is higher than the price. */
export const cashRoundingAdjustmentCents = (commercialCashCents: number): number =>
  roundCashSettlementCents(commercialCashCents) - commercialCashCents;

/**
 * The amount represented by the payment tender ledger. It differs from the
 * commercial/VAT total only for a cash sale with statutory five-cent rounding.
 */
export const settlementTotalCents = (transaction: {
  totalCents: number;
  roundingAdjustmentCents?: number;
}): number => transaction.totalCents + (transaction.roundingAdjustmentCents ?? 0);
