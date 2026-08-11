import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { formatEUR } from "./money";
import { format } from "date-fns";

export interface InvoiceLineItem {
  id?: string;
  description: string;
  quantity: number;
  unitPriceExclCents: number;
  vatRate: number; // e.g. 21, 12, 6, 0
  totalExclCents: number;
  totalVatCents: number;
  totalInclCents: number;
}

export interface InvoiceParty {
  name: string;
  legalName?: string;
  addressLine1: string;
  addressLine2?: string;
  postalCode?: string;
  city?: string;
  country?: string;
  vatNumber?: string; // e.g. BE 0123.456.789
  email?: string;
  phone?: string;
  iban?: string; // e.g. BE68 5390 0754 7011
  bic?: string; // e.g. GEBABE99
  rpr?: string; // e.g. RPR Gent, afdeling Gent
}

export interface InvoiceData {
  invoiceNumber: string;
  invoiceDate: string | Date;
  dueDate: string | Date;
  deliveryDate?: string | Date;
  status: "Voldaan" | "In afwachting" | "Vervallen" | "Gedeeltelijk";
  type?: "subscription" | "sale" | "credit_note";
  structuredCommunication?: string; // e.g. +++081/2026/00042+++
  reference?: string;
  seller: InvoiceParty;
  buyer: InvoiceParty;
  items: InvoiceLineItem[];
  paymentMethod?: string;
  paymentTimestamp?: number | Date;
  notes?: string;
}

/** Default seller profile for Pwayment Retail software invoices */
export const DEFAULT_PWAYMENT_SELLER: InvoiceParty = {
  name: "PWAYMENT BV",
  legalName: "Pwayment Software & Financial Retail Solutions BV",
  addressLine1: "Kouter 12, 9000 Gent",
  addressLine2: "België",
  vatNumber: "BE 0789.456.123",
  iban: "BE89 3630 1827 4910",
  bic: "KREDBEBB",
  rpr: "RPR Gent, Afdeling Gent",
  email: "facturatie@pwayment.com",
  phone: "+32 9 234 56 78",
};

/**
  Formats date input safely to dd/MM/yyyy string
 */
const formatDateStr = (d: string | Date | undefined): string => {
  if (!d) return "-";
  try {
    const dateObj = typeof d === "string" ? new Date(d) : d;
    if (isNaN(dateObj.getTime())) return String(d);
    return format(dateObj, "dd/MM/yyyy");
  } catch {
    return String(d);
  }
};

/**
 * Builds a printable commercial document from an immutable transaction snapshot.
 * Legal/fiscal qualification depends on the merchant configuration and deployment.
 */
export function createInvoicePdf(data: InvoiceData): jsPDF {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth(); // 210mm
  const pageHeight = doc.internal.pageSize.getHeight(); // 297mm
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;

  // Colors
  const primaryColor = [15, 23, 42]; // Slate-900
  const lightBg = [248, 250, 252]; // Slate-50

  // Header background bar
  doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.rect(0, 0, pageWidth, 28, "F");

  // Brand Name & Subtitle
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(data.seller.name || "PWAYMENT", margin, 14);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(203, 213, 225); // Slate-300
  doc.text("RETAIL POS & FINANCIAL INVOICING", margin, 20);

  // Document Title & Status on Top Right
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(255, 255, 255);
  doc.text(
    data.type === "credit_note" ? "CORRECTIEDOCUMENT" : "VERKOOPDOCUMENT",
    pageWidth - margin,
    14,
    { align: "right" },
  );

  // Status Badge in Header
  const statusText = (data.status || "VOLDAAN").toUpperCase();
  doc.setFontSize(8);
  const statusWidth = doc.getTextWidth(statusText) + 8;
  const badgeX = pageWidth - margin - statusWidth;
  doc.setFillColor(
    data.status === "Voldaan" ? 16 : 245,
    data.status === "Voldaan" ? 185 : 158,
    data.status === "Voldaan" ? 129 : 11,
  );
  doc.roundedRect(badgeX, 17, statusWidth, 6, 1.5, 1.5, "F");
  doc.setTextColor(255, 255, 255);
  doc.text(statusText, badgeX + statusWidth / 2, 21, { align: "center" });

  let cursorY = 36;

  // Metadata Box (Factuurnummer, Datum, etc.)
  doc.setFillColor(lightBg[0], lightBg[1], lightBg[2]);
  doc.roundedRect(margin, cursorY, contentWidth, 22, 2, 2, "F");
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(margin, cursorY, contentWidth, 22, 2, 2, "S");

  const metaCols = [
    { label: "FACTUURNUMMER", value: data.invoiceNumber },
    { label: "FACTUURDAYUM", value: formatDateStr(data.invoiceDate) },
    { label: "VERVALDATUM", value: formatDateStr(data.dueDate) },
    {
      label: "RELEVANTE PERIODE",
      value: formatDateStr(data.deliveryDate || data.invoiceDate),
    },
  ];

  const colStep = contentWidth / 4;
  metaCols.forEach((col, idx) => {
    const x = margin + idx * colStep + 5;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139); // Slate-500
    doc.text(col.label, x, cursorY + 7);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42); // Slate-900
    doc.text(col.value, x, cursorY + 15);
  });

  cursorY += 28;

  // 2-Column Parties Section (Leverancier vs Klant)
  const colW = (contentWidth - 10) / 2;

  // SELLER BOX
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text("LEVERANCIER (VERKOPER)", margin, cursorY);
  doc.setLineWidth(0.3);
  doc.setDrawColor(226, 232, 240);
  doc.line(margin, cursorY + 2, margin + colW, cursorY + 2);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(data.seller.legalName || data.seller.name, margin, cursorY + 8);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text(data.seller.addressLine1, margin, cursorY + 13);
  if (data.seller.addressLine2)
    doc.text(data.seller.addressLine2, margin, cursorY + 17);

  let sY = cursorY + (data.seller.addressLine2 ? 21 : 17);
  doc.setFont("helvetica", "bold");
  doc.text(`BTW-nr: ${data.seller.vatNumber || "-"}`, margin, sY);
  if (data.seller.iban)
    doc.text(
      `IBAN: ${data.seller.iban} (${data.seller.bic || ""})`,
      margin,
      sY + 4,
    );
  if (data.seller.rpr) doc.text(data.seller.rpr, margin, sY + 8);

  // BUYER BOX
  const buyerX = margin + colW + 10;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text("KLANT / FACTURATIE-ADRES", buyerX, cursorY);
  doc.line(buyerX, cursorY + 2, buyerX + colW, cursorY + 2);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(
    data.buyer.legalName || data.buyer.name || "Particuliere Klant",
    buyerX,
    cursorY + 8,
  );

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text(
    data.buyer.addressLine1 || "Adres op te vragen",
    buyerX,
    cursorY + 13,
  );
  if (data.buyer.addressLine2)
    doc.text(data.buyer.addressLine2, buyerX, cursorY + 17);

  let bY = cursorY + (data.buyer.addressLine2 ? 21 : 17);
  doc.setFont("helvetica", "bold");
  if (data.buyer.vatNumber) {
    doc.text(`BTW-nr: ${data.buyer.vatNumber}`, buyerX, bY);
  } else {
    doc.text("BTW-status: Particulier (Geen BTW-nr)", buyerX, bY);
  }
  if (data.buyer.email) doc.text(`E-mail: ${data.buyer.email}`, buyerX, bY + 4);
  if (data.buyer.phone) doc.text(`Tel: ${data.buyer.phone}`, buyerX, bY + 8);

  cursorY += 42;

  // STRUCTURED COMMUNICATION & PAYMENT NOTICE BAR
  if (data.structuredCommunication || data.paymentMethod) {
    doc.setFillColor(241, 245, 249);
    doc.roundedRect(margin, cursorY, contentWidth, 12, 1.5, 1.5, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85);

    const commText = data.structuredCommunication
      ? `Gestructureerde Mededeling: ${data.structuredCommunication}`
      : `Referentie: ${data.invoiceNumber}`;
    const payText = `Betaalmethode: ${data.paymentMethod || "SEPA / Incasso"}`;

    doc.text(commText, margin + 4, cursorY + 7.5);
    doc.text(payText, pageWidth - margin - 4, cursorY + 7.5, {
      align: "right",
    });
    cursorY += 16;
  }

  // LINE ITEMS TABLE (jspdf-autotable)
  const tableData = data.items.map((item) => [
    item.description,
    String(item.quantity),
    formatEUR(item.unitPriceExclCents),
    `${item.vatRate}%`,
    formatEUR(item.totalExclCents),
    formatEUR(item.totalInclCents),
  ]);

  autoTable(doc, {
    startY: cursorY,
    margin: { left: margin, right: margin },
    head: [
      [
        "Omschrijving / Dienst",
        "Aantal",
        "Prijs Excl.",
        "BTW %",
        "Bedrag Excl.",
        "Bedrag Incl.",
      ],
    ],
    body: tableData,
    theme: "striped",
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontSize: 8,
      fontStyle: "bold",
      halign: "left",
    },
    bodyStyles: {
      fontSize: 8.5,
      textColor: [30, 41, 59],
    },
    columnStyles: {
      0: { cellWidth: "auto" },
      1: { halign: "center", cellWidth: 16 },
      2: { halign: "right", cellWidth: 28 },
      3: { halign: "center", cellWidth: 18 },
      4: { halign: "right", cellWidth: 28 },
      5: { halign: "right", cellWidth: 28 },
    },
    styles: {
      cellPadding: 3,
    },
  });

  // Get bottom Y of table
  // @ts-ignore
  cursorY = doc.lastAutoTable ? doc.lastAutoTable.finalY + 8 : cursorY + 40;

  // Calculate VAT Breakdown totals
  const vatMap = new Map<
    number,
    { exclCents: number; vatCents: number; inclCents: number }
  >();
  let totalExclCents = 0;
  let totalVatCents = 0;
  let totalInclCents = 0;

  data.items.forEach((item) => {
    totalExclCents += item.totalExclCents;
    totalVatCents += item.totalVatCents;
    totalInclCents += item.totalInclCents;

    const existing = vatMap.get(item.vatRate) || {
      exclCents: 0,
      vatCents: 0,
      inclCents: 0,
    };
    existing.exclCents += item.totalExclCents;
    existing.vatCents += item.totalVatCents;
    existing.inclCents += item.totalInclCents;
    vatMap.set(item.vatRate, existing);
  });

  // FINANCIAL SUMMARY & VAT BREAKDOWN
  const summaryBoxWidth = 85;

  // VAT BREAKDOWN TABLE (LEFT)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  doc.text("BTW UITSPLITSING (VERPLICHT WETTELIJK)", margin, cursorY);

  const vatRows = Array.from(vatMap.entries()).map(([rate, vals]) => [
    `${rate}%`,
    formatEUR(vals.exclCents),
    formatEUR(vals.vatCents),
    formatEUR(vals.inclCents),
  ]);

  autoTable(doc, {
    startY: cursorY + 3,
    margin: { left: margin, right: margin + summaryBoxWidth + 8 },
    head: [["Tarief", "Maatstaf", "BTW-bedrag", "Totaal"]],
    body: vatRows,
    theme: "plain",
    headStyles: {
      fillColor: [241, 245, 249],
      textColor: [71, 85, 105],
      fontSize: 7.5,
      fontStyle: "bold",
    },
    bodyStyles: {
      fontSize: 8,
      textColor: [51, 65, 85],
    },
    columnStyles: {
      0: { cellWidth: 16, halign: "center" },
      1: { halign: "right" },
      2: { halign: "right" },
      3: { halign: "right" },
    },
    styles: { cellPadding: 2 },
  });

  // GRAND TOTALS SUMMARY BOX (RIGHT)
  const sumX = pageWidth - margin - summaryBoxWidth;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  doc.text("FINANCIEEL OVERZICHT", sumX, cursorY);

  doc.setFillColor(248, 250, 252);
  doc.roundedRect(sumX, cursorY + 3, summaryBoxWidth, 34, 2, 2, "F");
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(sumX, cursorY + 3, summaryBoxWidth, 34, 2, 2, "S");

  let sYPos = cursorY + 10;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text("Subtotaal Excl. BTW:", sumX + 4, sYPos);
  doc.text(formatEUR(totalExclCents), sumX + summaryBoxWidth - 4, sYPos, {
    align: "right",
  });

  sYPos += 6;
  doc.text("Totaal BTW-bedrag:", sumX + 4, sYPos);
  doc.text(formatEUR(totalVatCents), sumX + summaryBoxWidth - 4, sYPos, {
    align: "right",
  });

  sYPos += 8;
  doc.setFillColor(15, 23, 42);
  doc.rect(sumX, sYPos - 4, summaryBoxWidth, 14, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.text("TOTAAL TE BETALEN:", sumX + 4, sYPos + 3);
  doc.text(formatEUR(totalInclCents), sumX + summaryBoxWidth - 4, sYPos + 3, {
    align: "right",
  });

  // Update Y
  const autoTableState = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable;
  const lastTableY = autoTableState
    ? autoTableState.finalY
    : cursorY + 40;
  cursorY = Math.max(lastTableY, cursorY + 45) + 10;

  // STATUTORY LEGAL CLAUSES & PEPPOL FOOTER
  const footerY = pageHeight - 35;
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.3);
  doc.line(margin, footerY, pageWidth - margin, footerY);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);

  const legalNotice =
    "Wettelijke vermelding: Behoudens tegenbericht binnen 8 dagen wordt deze factuur als aanvaard beschouwd. " +
    "Bij laattijdige betaling is van rechtswege en zonder ingebrekestelling een moratoire intrest van 10% per jaar en een schadebeding van 10% (min. € 40,-) verschuldigd (Art. 5 Wet 02/08/2002). " +
    "Alle geleverde goederen blijven eigendom van de verkoper tot volledige betaling.";

  doc.text(doc.splitTextToSize(legalNotice, contentWidth), margin, footerY + 4);

  // Bottom Line: IBAN + Peppol BIS v3 + Page counter
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(15, 23, 42);

  const ibanLine = `IBAN: ${data.seller.iban || "-"} | BIC: ${data.seller.bic || "-"} | RPR: ${data.seller.rpr || "-"}`;
  doc.text(ibanLine, margin, footerY + 16);

  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 116, 139);
  doc.text(
    "Gegenereerd uit de opgeslagen transactiesnapshot",
    pageWidth - margin,
    footerY + 16,
    { align: "right" },
  );

  doc.setFontSize(6.5);
  doc.text(
    `Gegenereerd door Pwayment Retail • Referentie: ${data.invoiceNumber}`,
    margin,
    footerY + 22,
  );

  return doc;
}

/**
 * Downloads the PDF directly in the user's browser.
 */
export function downloadInvoicePdf(data: InvoiceData, filename?: string): void {
  const doc = createInvoicePdf(data);
  const name = filename || `${data.invoiceNumber || "Factuur"}.pdf`;
  doc.save(name);
}

/**
 * Returns data URL string of PDF for preview iframe.
 */
export function getInvoicePdfDataUrl(data: InvoiceData): string {
  const doc = createInvoicePdf(data);
  return doc.output("datauristring");
}

/**
 * Converts a POS transaction snapshot to printable document data.
 */
export function convertTransactionToInvoiceData(
  t: {
    id?: number | string;
    timestamp: number;
    totalCents: number;
    subtotalCents: number;
    discountCents: number;
    vat12Cents: number;
    vat21Cents: number;
    paymentMethod: string;
    documentNumber?: string;
    kind?: "sale" | "refund";
    customerId?: string;
    items: Array<{
      lineId?: string;
      quantity: number;
      product: { name: string; priceCents: number; vatRate?: number };
      modifiers?: Array<{ label: string; deltaCents: number }>;
    }>;
  },
  merchant: {
    name: string;
    legalName?: string;
    addressLine1: string;
    addressLine2?: string;
    vatNumber?: string;
    iban?: string;
    bic?: string;
    email?: string;
    phone?: string;
    rpr?: string;
  },
  customer?: {
    name: string;
    street?: string;
    houseNumber?: string;
    postalCode?: string;
    city?: string;
    vatNumber?: string;
    email?: string;
    phone?: string;
  } | null,
): InvoiceData {
  const direction = t.kind === "refund" ? -1 : 1;
  const items: InvoiceLineItem[] = t.items.map((item) => {
    const modSum = (item.modifiers ?? []).reduce((s, m) => s + m.deltaCents, 0);
    const unitIncl = item.product.priceCents + modSum;
    const vatRate = item.product.vatRate || 21;
    const unitExcl = Math.round(unitIncl / (1 + vatRate / 100));
    const lineTotalIncl = unitIncl * item.quantity;
    const lineTotalExcl = Math.round(lineTotalIncl / (1 + vatRate / 100));
    const lineVat = lineTotalIncl - lineTotalExcl;

    return {
      description:
        item.product.name +
        (item.modifiers?.length
          ? ` (${item.modifiers.map((m) => m.label).join(", ")})`
          : ""),
      quantity: item.quantity,
      unitPriceExclCents: unitExcl,
      vatRate,
      totalExclCents: lineTotalExcl * direction,
      totalVatCents: lineVat * direction,
      totalInclCents: lineTotalIncl * direction,
    };
  });

  const txDate = new Date(t.timestamp);
  const formattedDate = format(txDate, "yyyyMMdd");

  return {
    invoiceNumber:
      t.documentNumber ??
      `POS-${formattedDate}-${String(t.id ?? 1).padStart(4, "0")}`,
    invoiceDate: txDate,
    dueDate: txDate,
    deliveryDate: txDate,
    status: "Voldaan",
    type: t.kind === "refund" ? "credit_note" : "sale",
    structuredCommunication: `+++${format(txDate, "MM")}/${format(txDate, "yyyy")}/${String(t.id ?? 1).padStart(5, "0")}+++`,
    paymentMethod: t.paymentMethod,
    seller: {
      name: merchant.name,
      legalName: merchant.legalName || merchant.name,
      addressLine1: merchant.addressLine1,
      addressLine2: merchant.addressLine2,
      vatNumber: merchant.vatNumber,
      iban: merchant.iban,
      bic: merchant.bic,
      email: merchant.email,
      phone: merchant.phone,
      rpr: merchant.rpr,
    },
    buyer: {
      name:
        customer?.name ||
        (t.customerId ? `Klant #${t.customerId}` : "Particuliere Klant"),
      addressLine1: customer?.street
        ? `${customer.street} ${customer.houseNumber || ""}`.trim()
        : "Winkelverkoop Balie",
      postalCode: customer?.postalCode,
      city: customer?.city,
      vatNumber: customer?.vatNumber,
      email: customer?.email,
      phone: customer?.phone,
    },
    items,
  };
}
