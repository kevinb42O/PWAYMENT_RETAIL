import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { formatEUR } from "./money";
import { allocateCents } from "./money";
import { format } from "date-fns";
import { SUPPORTED_VAT_RATES, isSupportedVatRate } from "./vat";

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
  type?: "subscription" | "sale" | "credit_note" | "receipt";
  structuredCommunication?: string; // e.g. +++081/2026/00042+++
  reference?: string;
  seller: InvoiceParty;
  buyer: InvoiceParty;
  items: InvoiceLineItem[];
  paymentMethod?: string;
  paymentTimestamp?: number | Date;
  /** Cash settlement adjustment, deliberately kept outside invoice VAT lines. */
  cashRoundingAdjustmentCents?: number;
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
  const footerY = pageHeight - 35;

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
    data.type === "credit_note" ? "CREDITNOTA" : data.type === "receipt" ? "KASSATICKET" : "FACTUUR",
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
    { label: "FACTUURDATUM", value: formatDateStr(data.invoiceDate) },
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
    // Keep physical footer space clear on every page, not just the last one.
    margin: { left: margin, right: margin, bottom: 55 },
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

  const cashRoundingAdjustmentCents = data.cashRoundingAdjustmentCents ?? 0;
  const hasCashRounding = cashRoundingAdjustmentCents !== 0;
  const summaryBoxHeight = hasCashRounding ? 48 : 34;

  // The financial summary must travel as a unit and never collide with the
  // fixed legal footer. Start a clean final page when the table ended too low.
  if (cursorY > footerY - (summaryBoxHeight + 24)) {
    doc.addPage();
    cursorY = margin;
  }

  // VAT BREAKDOWN TABLE (LEFT)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  doc.text("BTW-UITSPLITSING", margin, cursorY);

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
  doc.roundedRect(sumX, cursorY + 3, summaryBoxWidth, summaryBoxHeight, 2, 2, "F");
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(sumX, cursorY + 3, summaryBoxWidth, summaryBoxHeight, 2, 2, "S");

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
  doc.text(
    hasCashRounding ? "TOTAAL FACTUUR:" : "TOTAAL TE BETALEN:",
    sumX + 4,
    sYPos + 3,
  );
  doc.text(formatEUR(totalInclCents), sumX + summaryBoxWidth - 4, sYPos + 3, {
    align: "right",
  });

  if (hasCashRounding) {
    sYPos += 17;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text("Cashafronding:", sumX + 4, sYPos);
    doc.text(
      `${cashRoundingAdjustmentCents > 0 ? "+" : ""}${formatEUR(cashRoundingAdjustmentCents)}`,
      sumX + summaryBoxWidth - 4,
      sYPos,
      { align: "right" },
    );
    sYPos += 7;
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text("CASH VEREFFEND:", sumX + 4, sYPos);
    doc.text(
      formatEUR(totalInclCents + cashRoundingAdjustmentCents),
      sumX + summaryBoxWidth - 4,
      sYPos,
      { align: "right" },
    );
  }

  // Update Y
  const autoTableState = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable;
  const lastTableY = autoTableState
    ? autoTableState.finalY
    : cursorY + 40;
  cursorY = Math.max(lastTableY, cursorY + 45) + 10;

  // Fixed footer on every page; legal terms belong only on the final page.
  const pageCount = doc.getNumberOfPages();
  const legalNotice = data.notes || "Deze factuur werd uitgereikt vanuit de geregistreerde verkoop.";
  const ibanLine = `IBAN: ${data.seller.iban || "-"} | BIC: ${data.seller.bic || "-"} | RPR: ${data.seller.rpr || "-"}`;
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.3);
    doc.line(margin, footerY, pageWidth - margin, footerY);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text(`Referentie: ${data.invoiceNumber}`, margin, footerY + 22);
    doc.text(`Pagina ${page} / ${pageCount}`, pageWidth - margin, footerY + 22, { align: "right" });
    if (page !== pageCount) continue;

    doc.setFontSize(7);
    doc.text(doc.splitTextToSize(legalNotice, contentWidth), margin, footerY + 4);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(15, 23, 42);
    doc.text(ibanLine, margin, footerY + 16);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139);
    doc.text("Gegenereerd uit een bevroren transactiesnapshot", pageWidth - margin, footerY + 16, { align: "right" });
  }

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
    roundingAdjustmentCents?: number;
    paymentMethod: string;
    documentNumber?: string;
    invoiceNumber?: string;
    invoiceIssuedAt?: number;
    documentRequest?: {
      type: "receipt" | "invoice-b2c" | "invoice-b2b";
      recipient?: {
        customerId?: string;
        name: string;
        companyName?: string;
        addressLine1: string;
        postalCode: string;
        city: string;
        countryCode: string;
        vatNumber?: string;
        email?: string;
        purchaseOrderReference?: string;
      };
    };
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
    invoiceTerms?: string;
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
  const grossLines = t.items.map((item) => {
    const modSum = (item.modifiers ?? []).reduce((s, m) => s + m.deltaCents, 0);
    const unitIncl = item.product.priceCents + modSum;
    const vatRate = item.product.vatRate ?? 21;
    if (!isSupportedVatRate(vatRate)) {
      throw new Error(`Factuur kan BTW-tarief ${String(vatRate)}% niet boeken.`);
    }
    const lineTotalIncl = unitIncl * item.quantity;
    return {
      item,
      unitIncl,
      vatRate,
      lineTotalIncl,
      description:
        item.product.name +
        (item.modifiers?.length
          ? ` (${item.modifiers.map((m) => m.label).join(", ")})`
          : ""),
    };
  });

  // Allocate the cart discount first per VAT rate, then per line. This mirrors
  // the booking engine and guarantees invoice totals reconcile to the sale.
  const discountByLine = new Array(grossLines.length).fill(0);
  const rateGroups = SUPPORTED_VAT_RATES.map((rate) => ({
    rate,
    indices: grossLines.flatMap((line, index) => line.vatRate === rate ? [index] : []),
  })).filter((group) => group.indices.length > 0);
  const rateDiscounts = allocateCents(
    Math.min(t.discountCents, t.subtotalCents),
    rateGroups.map((group) => group.indices.reduce((sum, index) => sum + grossLines[index].lineTotalIncl, 0)),
  );
  rateGroups.forEach((group, groupIndex) => {
    const allocated = allocateCents(rateDiscounts[groupIndex], group.indices.map((index) => grossLines[index].lineTotalIncl));
    group.indices.forEach((index, lineIndex) => { discountByLine[index] = allocated[lineIndex]; });
  });

  const netByLine = grossLines.map((line, index) => line.lineTotalIncl - discountByLine[index]);
  const exclByLine = new Array(grossLines.length).fill(0);
  rateGroups.forEach((group) => {
    const rate = group.rate;
    const groupNet = group.indices.reduce((sum, index) => sum + netByLine[index], 0);
    const groupExcl = Math.round(groupNet / (1 + rate / 100));
    const allocated = allocateCents(groupExcl, group.indices.map((index) => netByLine[index]));
    group.indices.forEach((index, lineIndex) => { exclByLine[index] = allocated[lineIndex]; });
  });
  const items: InvoiceLineItem[] = grossLines.map((line, index) => ({
    description: line.description,
    quantity: line.item.quantity,
    unitPriceExclCents: Math.round(line.unitIncl / (1 + line.vatRate / 100)),
    vatRate: line.vatRate,
    totalExclCents: exclByLine[index] * direction,
    totalVatCents: (netByLine[index] - exclByLine[index]) * direction,
    totalInclCents: netByLine[index] * direction,
  }));

  const txDate = new Date(t.timestamp);
  const formattedDate = format(txDate, "yyyyMMdd");

  return {
    invoiceNumber:
      t.invoiceNumber ??
      t.documentNumber ??
      `POS-${formattedDate}-${String(t.id ?? 1).padStart(4, "0")}`,
    invoiceDate: t.invoiceIssuedAt ? new Date(t.invoiceIssuedAt) : txDate,
    dueDate: txDate,
    deliveryDate: txDate,
    status: "Voldaan",
    type: t.kind === "refund"
      ? "credit_note"
      : t.documentRequest?.type === "invoice-b2c" || t.documentRequest?.type === "invoice-b2b"
        ? "sale"
        : "receipt",
    structuredCommunication: `+++${format(txDate, "MM")}/${format(txDate, "yyyy")}/${String(t.id ?? 1).padStart(5, "0")}+++`,
    paymentMethod: t.paymentMethod,
    cashRoundingAdjustmentCents: t.roundingAdjustmentCents ?? undefined,
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
    buyer: t.documentRequest?.recipient ? {
      name: t.documentRequest.recipient.name,
      legalName: t.documentRequest.recipient.companyName,
      addressLine1: t.documentRequest.recipient.addressLine1,
      addressLine2: `${t.documentRequest.recipient.postalCode} ${t.documentRequest.recipient.city}, ${t.documentRequest.recipient.countryCode}`,
      vatNumber: t.documentRequest.recipient.vatNumber,
      email: t.documentRequest.recipient.email,
    } : {
      name: customer?.name || (t.customerId ? `Klant #${t.customerId}` : "Particuliere Klant"),
      addressLine1: customer?.street ? `${customer.street} ${customer.houseNumber || ""}`.trim() : "Winkelverkoop Balie",
      postalCode: customer?.postalCode,
      city: customer?.city,
      vatNumber: customer?.vatNumber,
      email: customer?.email,
      phone: customer?.phone,
    },
    items,
    reference: t.documentRequest?.recipient?.purchaseOrderReference,
    notes: merchant.invoiceTerms,
  };
}
