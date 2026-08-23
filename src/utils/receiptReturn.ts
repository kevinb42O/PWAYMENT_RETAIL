import type { Transaction } from "../types";
import {
  isValidReceiptBarcode,
  normalizeReceiptBarcode,
} from "./receiptBarcode";

export type ReceiptReturnLookup =
  | { status: "found"; barcode: string; transaction: Transaction }
  | { status: "invalid" | "not-found" | "not-sale" | "demo"; barcode: string; message: string };

/** Resolve a scanned receipt without ever treating a scan as permission to refund. */
export const resolveReceiptReturn = (
  transactions: Transaction[],
  rawBarcode: string,
): ReceiptReturnLookup => {
  const barcode = normalizeReceiptBarcode(rawBarcode);
  if (!isValidReceiptBarcode(barcode)) {
    return {
      status: "invalid",
      barcode,
      message: "Scan een geldige PWAYMENT-ticketbarcode of voer de 20 cijfers in.",
    };
  }

  const transaction = transactions.find(
    (row) => normalizeReceiptBarcode(row.receiptBarcode) === barcode,
  );
  if (!transaction) {
    return {
      status: "not-found",
      barcode,
      message: "Dit kassaticket staat niet in de lokale winkeldata. Vernieuw de synchronisatie of zoek het kassaticket handmatig op.",
    };
  }
  if ((transaction.kind ?? "sale") !== "sale") {
    return {
      status: "not-sale",
      barcode,
      message: "Dit is een creditnota. Alleen een oorspronkelijke verkoop kan worden geretourneerd.",
    };
  }
  if ((transaction.source ?? "live") === "demo") {
    return {
      status: "demo",
      barcode,
      message: "Demo-omzet kan niet als echte retour worden geboekt.",
    };
  }
  return { status: "found", barcode, transaction };
};

/** Remaining quantities are derived from linked corrections; createRefund validates again atomically. */
export const remainingReturnQuantities = (
  original: Transaction,
  transactions: Transaction[],
): Record<string, number> => {
  const alreadyReturned = new Map<string, number>();
  for (const transaction of transactions) {
    if (
      transaction.kind !== "refund" ||
      transaction.originalTransactionId !== original.id
    ) {
      continue;
    }
    for (const item of transaction.items) {
      alreadyReturned.set(
        item.lineId,
        (alreadyReturned.get(item.lineId) ?? 0) + item.quantity,
      );
    }
  }

  return Object.fromEntries(
    original.items.map((item) => [
      item.lineId,
      Math.max(0, item.quantity - (alreadyReturned.get(item.lineId) ?? 0)),
    ]),
  );
};
