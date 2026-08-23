import React from "react";
import type { MerchantInfo } from "../data/merchant";
import type { Transaction } from "../types";
import { ReceiptTicket } from "./ReceiptTicket";

/** Shared sample and renderer for every editable kassaticket preview. */
const merchantTicketPreviewTransaction: Transaction = {
  id: 1024,
  documentNumber: "VOORBEELD-2026-00001024",
  tableId: 1,
  items: [
    {
      lineId: "preview-1",
      product: {
        id: "preview-deck",
        name: "Maple Deck 8.25",
        category: "decks",
        priceCents: 6995,
        costPriceCents: 3350,
        vatRate: 21,
        brand: "Shop Decks",
        sku: "DECK-825",
        barcode: "2000000000018",
      },
      quantity: 1,
    },
    {
      lineId: "preview-2",
      product: {
        id: "preview-service",
        name: "Grip aanbrengen",
        category: "services",
        priceCents: 500,
        costPriceCents: 0,
        vatRate: 21,
      },
      quantity: 1,
    },
  ],
  subtotalCents: 7495,
  vat12Cents: 0,
  vat21Cents: 1301,
  totalCents: 7495,
  discountCents: 0,
  paymentMethod: "PIN",
  timestamp: Date.now(),
  isFinalized: 1,
  userName: "Kassa 1",
};

export const MerchantTicketPreview: React.FC<{ merchant: MerchantInfo }> = ({ merchant }) => (
  <ReceiptTicket transaction={merchantTicketPreviewTransaction} merchantOverride={merchant} />
);
