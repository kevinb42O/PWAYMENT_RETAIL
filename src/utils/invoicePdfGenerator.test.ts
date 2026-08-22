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

const item = (id: string, priceCents: number, vatRate: 0 | 6 | 12 | 21): OrderItem => ({
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

  it("keeps a cash rounding adjustment separate from commercial invoice VAT totals", () => {
    const items = [item("cash-rounding", 1002, 21)];
    const totals = calculateTotals(items, 0);
    const transaction: Transaction = {
      id: 43,
      tableId: 1,
      items,
      subtotalCents: totals.subtotal,
      discountCents: totals.discount,
      totalCents: totals.total,
      vat12Cents: totals.vat12,
      vat21Cents: totals.vat21,
      roundingAdjustmentCents: -2,
      paymentMethod: "Cash",
      timestamp: Date.UTC(2026, 7, 15),
      isFinalized: 1,
      documentNumber: "POS-2026-00000043",
    };

    const invoice = convertTransactionToInvoiceData(transaction, merchant);

    expect(invoice.items.reduce((sum, line) => sum + line.totalInclCents, 0)).toBe(1002);
    expect(invoice.cashRoundingAdjustmentCents).toBe(-2);
  });

  it("keeps zero and reduced-rate retail lines at their booked VAT rate", () => {
    const items = [
      item("zero-rated", 100, 0),
      item("reduced", 106, 6),
      item("intermediate", 112, 12),
      item("standard", 121, 21),
    ];
    const totals = calculateTotals(items, 3);
    const transaction: Transaction = {
      id: 44,
      tableId: 1,
      items,
      subtotalCents: totals.subtotal,
      discountCents: totals.discount,
      totalCents: totals.total,
      vatBreakdown: totals.vatBreakdown,
      vat12Cents: totals.vat12,
      vat21Cents: totals.vat21,
      paymentMethod: "PIN",
      timestamp: Date.UTC(2026, 7, 15),
      isFinalized: 1,
      documentNumber: "POS-2026-00000044",
    };

    const invoice = convertTransactionToInvoiceData(transaction, merchant);

    expect(invoice.items.map((line) => line.vatRate)).toEqual([0, 6, 12, 21]);
    expect(invoice.items.reduce((sum, line) => sum + line.totalInclCents, 0))
      .toBe(totals.total);
    expect(invoice.items.find((line) => line.vatRate === 0)?.totalVatCents).toBe(0);
  });
});
