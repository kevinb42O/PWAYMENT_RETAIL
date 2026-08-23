import { describe, expect, it } from "vitest";
import type { Product, Transaction } from "../types";
import { luhnCheckDigit } from "./receiptBarcode";
import { remainingReturnQuantities, resolveReceiptReturn } from "./receiptReturn";

const product: Product = {
  id: "scan-return-product",
  name: "Scanproduct",
  category: "test",
  priceCents: 1000,
  vatRate: 21,
};
const barcodeBody = "9112345678901234567";
const barcode = `${barcodeBody}${luhnCheckDigit(barcodeBody)}`;
const sale: Transaction = {
  id: 42,
  clientRequestId: "scan-return-sale",
  tableId: 1,
  items: [{ lineId: "line-1", product, quantity: 3 }],
  subtotalCents: 3000,
  discountCents: 0,
  totalCents: 3000,
  vat12Cents: 0,
  vat21Cents: 521,
  paymentMethod: "PIN",
  timestamp: 1,
  isFinalized: 1,
  kind: "sale",
  source: "live",
  receiptBarcode: barcode,
};

describe("receipt return lookup", () => {
  it("opens the original sale from a formatted ticket scan", () => {
    expect(resolveReceiptReturn([sale], barcode.replace(/(..)/g, "$1 "))).toMatchObject({
      status: "found",
      barcode,
      transaction: { id: 42 },
    });
  });

  it("does not confuse an unknown valid ticket with a product barcode", () => {
    const otherBody = "9199999999999999999";
    const other = `${otherBody}${luhnCheckDigit(otherBody)}`;
    expect(resolveReceiptReturn([sale], other)).toMatchObject({ status: "not-found" });
  });

  it("selects only quantities that have not already been returned", () => {
    const refund: Transaction = {
      ...sale,
      id: 43,
      clientRequestId: "scan-return-refund",
      kind: "refund",
      originalTransactionId: 42,
      items: [{ ...sale.items[0], quantity: 2 }],
      totalCents: -2000,
    };
    expect(remainingReturnQuantities(sale, [sale, refund])).toEqual({ "line-1": 1 });
  });
});
