import { describe, expect, it } from "vitest";
import { convertTransactionToInvoiceData } from "./invoicePdfGenerator";
import { calculateTotals } from "./vat";
import type { OrderItem, Transaction } from "../types";

const merchant = {
  name: "Testwinkel BV",
  legalName: "Testwinkel BV",
  addressLine1: "Teststraat 1",
  addressLine2: "9000 Gent",
  vatNumber: "BE0123456789",
};

const item = (id: string, priceCents: number, vatRate: 12 | 21): OrderItem => ({
  lineId: id,
  quantity: 1,
  product: {
    id,
    name: id,
    category: "test",
    priceCents,
    costPriceCents: 0,
    vatRate,
  },
});

describe("convertTransactionToInvoiceData", () => {
  it("keeps total, VAT and invoice recipient snapshot aligned with the booked sale", () => {
    const items = [item("12-percent", 100, 12), item("21-percent", 100, 21)];
    const totals = calculateTotals(items, 1);
    const transaction: Transaction = {
      id: 42,
      tableId: 1,
      items,
      subtotalCents: totals.subtotal,
      discountCents: totals.discount,
      totalCents: totals.total,
      vat12Cents: totals.vat12,
      vat21Cents: totals.vat21,
      paymentMethod: "PIN",
      timestamp: Date.UTC(2026, 7, 15),
      isFinalized: 1,
      documentNumber: "POS-2026-00000042",
      invoiceNumber: "INV-2026-00000042",
      documentRequest: {
        type: "invoice-b2b",
        recipient: {
          name: "An De Smet",
          companyName: "De Smet Retail BV",
          addressLine1: "Stationsstraat 12",
          postalCode: "9000",
          city: "Gent",
          countryCode: "BE",
          vatNumber: "BE0987654321",
        },
      },
    };

    const invoice = convertTransactionToInvoiceData(transaction, merchant);

    expect(invoice.invoiceNumber).toBe("INV-2026-00000042");
    expect(invoice.buyer.legalName).toBe("De Smet Retail BV");
    expect(invoice.buyer.addressLine2).toBe("9000 Gent, BE");
    expect(invoice.items.reduce((sum, line) => sum + line.totalInclCents, 0)).toBe(totals.total);
    expect(invoice.items.reduce((sum, line) => sum + line.totalVatCents, 0)).toBe(totals.vat12 + totals.vat21);
    expect(invoice.items.reduce((sum, line) => sum + line.totalExclCents, 0)).toBe(totals.exclVat12 + totals.exclVat21);
  });
});
