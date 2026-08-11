import type { PaymentTender, Transaction } from "../types";
import { transactionTenders } from "./financial";

export interface ReceiptPaymentRow {
  label: string;
  amountCents: number;
  method: PaymentTender["method"];
}

/**
 * Expand the canonical tender ledger into receipt rows.
 *
 * Gift-card allocations carry the card codes, while the tender ledger can
 * contain one Cadeaubon row per card. Expand those allocations only once so a
 * receipt never prints N allocations for each of the N gift-card tenders.
 */
export const receiptPaymentRows = (
  transaction: Transaction,
): ReceiptPaymentRow[] => {
  const allocations = transaction.giftCardAllocations ?? [];
  const rows: ReceiptPaymentRow[] = [];
  let giftCardAllocationsPrinted = false;

  for (const tender of transactionTenders(transaction)) {
    if (tender.method === "Cadeaubon" && allocations.length > 0) {
      if (!giftCardAllocationsPrinted) {
        rows.push(
          ...allocations.map((allocation) => ({
            label: `Cadeaubon (${allocation.code})`,
            amountCents: allocation.amountCents,
            method: "Cadeaubon" as const,
          })),
        );
        giftCardAllocationsPrinted = true;
      }
      continue;
    }

    rows.push({
      label: tender.method,
      amountCents: tender.amountCents,
      method: tender.method,
    });
  }

  return rows;
};
