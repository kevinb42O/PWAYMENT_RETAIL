import type { OrderItem, Transaction } from "../types";

/**
 * Customer-facing receipt values. Keeping these rules outside each renderer
 * prevents the on-screen and thermal receipts from silently drifting apart.
 */
export const receiptDocumentReference = (transaction: Transaction): string => {
  if (transaction.documentNumber) return transaction.documentNumber;
  if (transaction.id != null) return `LEGACY-${String(transaction.id).padStart(5, "0")}`;
  return "NOG-NIET-TOEGEKEND";
};

export const receiptFingerprint = (transaction: Transaction, timestamp: string): string =>
  `${timestamp}-R${transaction.tableId}-${receiptDocumentReference(transaction)}`;

/** A private approval/audit reason must never be exposed on a customer ticket. */
export const receiptDiscountLabel = (): string => "Korting";

/** Show the selling variant without relying on a live product catalogue lookup. */
export const receiptItemDescription = (item: OrderItem): string => {
  if (item.giftCardOperation) {
    const action = item.giftCardOperation.action === "issue" ? "uitgifte" : "oplading";
    return `Cadeaubon – ${action} (${item.giftCardOperation.code})`;
  }
  return [item.product.name, item.product.variant].filter(Boolean).join(" — ");
};

/**
 * Wraps receipt text without dropping characters. Long unbroken words are
 * split only when necessary, which keeps barcode-like product names legible.
 */
export const wrapReceiptText = (text: string, width: number): string[] => {
  const normalized = text.trim().replace(/\s+/g, " ");
  if (!normalized) return [""];

  const lines: string[] = [];
  let line = "";
  for (const word of normalized.split(" ")) {
    if (!line) {
      line = word;
      continue;
    }
    if (line.length + 1 + word.length <= width) {
      line += ` ${word}`;
      continue;
    }
    lines.push(line);
    line = word;
  }
  if (line) lines.push(line);

  return lines.flatMap((entry) => {
    if (entry.length <= width) return [entry];
    return Array.from({ length: Math.ceil(entry.length / width) }, (_, index) =>
      entry.slice(index * width, (index + 1) * width),
    );
  });
};
