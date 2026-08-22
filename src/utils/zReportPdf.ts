import { format } from "date-fns";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { MerchantInfo } from "../data/merchant";
import type { DailyReportDetail } from "../services/dailyReportDetail";
import { vatBreakdownForReport } from "./vatReport";

const euro = (cents: number) =>
  new Intl.NumberFormat("nl-BE", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);

const tableEnd = (doc: jsPDF) =>
  (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 0;

const addPageNumbers = (doc: jsPDF) => {
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(`Pagina ${page} van ${pages}`, 195, 290, { align: "right" });
  }
};

export const createZReportPdf = (
  detail: DailyReportDetail,
  merchant: MerchantInfo,
): jsPDF => {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const report = detail.report;
  const totals = report.totals;
  const vatRows = vatBreakdownForReport({
    totalVat12Cents: Number(totals.totalVat12Cents ?? 0),
    totalVat21Cents: Number(totals.totalVat21Cents ?? 0),
    totalExclVat12Cents: Number(totals.totalExclVat12Cents ?? 0),
    totalExclVat21Cents: Number(totals.totalExclVat21Cents ?? 0),
    totalVatBreakdown: totals.totalVatBreakdown,
  });
  const margin = 14;
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFillColor(8, 145, 178);
  doc.rect(0, 0, pageWidth, 29, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(merchant.name || "PWAYMENT", margin, 13);
  doc.setFontSize(15);
  doc.text(`Z-RAPPORT #${report.reportNumber}`, pageWidth - margin, 13, {
    align: "right",
  });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("OFFICIËLE KASSA- EN SHIFTAFSLUITING", margin, 21);
  doc.text(format(report.closedAt, "dd/MM/yyyy HH:mm:ss"), pageWidth - margin, 21, {
    align: "right",
  });

  autoTable(doc, {
    startY: 36,
    margin: { left: margin, right: margin },
    theme: "grid",
    styles: { fontSize: 8.5, cellPadding: 2.3, textColor: [30, 41, 59] },
    headStyles: { fillColor: [241, 245, 249], textColor: [51, 65, 85] },
    head: [["Kassa / shift", "Periode", "Afgesloten door", "Transacties"]],
    body: [[
      `${report.registerName}${report.shiftNumber ? ` · shift ${report.shiftNumber}` : ""}`,
      `${report.openedAt ? format(report.openedAt, "dd/MM HH:mm") : "—"} – ${format(report.closedAt, "dd/MM HH:mm")}`,
      report.closedByUserName ?? "Systeem",
      String(report.transactionCount),
    ]],
  });

  autoTable(doc, {
    startY: tableEnd(doc) + 6,
    margin: { left: margin, right: margin },
    theme: "grid",
    styles: { fontSize: 8.5, cellPadding: 2.3 },
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] },
    head: [["Financieel", "Bedrag", "Betaling", "Bedrag"]],
    body: [
      ["Netto productomzet", euro(Number(totals.totalRevenueCents ?? 0)), "Cash", euro(Number(totals.paymentTotalsCents?.Cash ?? 0))],
      ["Kostprijs", euro(Number(totals.totalCostCents ?? 0)), "Kaart", euro(Number(totals.paymentTotalsCents?.PIN ?? 0))],
      ["Brutowinst", euro(Number(totals.grossProfitCents ?? 0)), "Cadeaubon", euro(Number(totals.paymentTotalsCents?.Cadeaubon ?? 0))],
      ["Kortingen", euro(Number(totals.totalDiscountCents ?? 0)), "Cashafrondingen", euro(Number(totals.totalCashRoundingAdjustmentCents ?? 0))],
      ["Kasverschil", euro(report.cashDifferenceCents), "Verwacht cash", euro(report.expectedCashCents)],
      ...vatRows.map((line, index) => [
        `BTW ${line.rate}%`,
        euro(line.vatCents),
        index === 0 ? "Geteld cash" : "",
        index === 0 ? euro(report.countedCashCents) : "",
      ]),
    ],
    columnStyles: { 1: { halign: "right" }, 3: { halign: "right" } },
  });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text("Verkochte producten", margin, tableEnd(doc) + 9);
  autoTable(doc, {
    startY: tableEnd(doc) + 12,
    margin: { left: margin, right: margin, bottom: 15 },
    theme: "striped",
    styles: { fontSize: 7.6, cellPadding: 1.8 },
    headStyles: { fillColor: [8, 145, 178], textColor: [255, 255, 255] },
    head: [["Product", "SKU", "Verkocht", "Retour", "Netto", "Omzet", "BTW", "Kost", "Marge"]],
    body: detail.products.map((product) => [
      `${product.productName}${product.variant ? ` · ${product.variant}` : ""}`,
      product.sku ?? "—",
      String(product.soldQuantity),
      String(product.returnedQuantity),
      String(product.netQuantity),
      euro(product.netRevenueCents),
      euro(product.vatCents),
      euro(product.costCents),
      euro(product.grossProfitCents),
    ]),
    columnStyles: {
      2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" },
      5: { halign: "right" }, 6: { halign: "right" }, 7: { halign: "right" }, 8: { halign: "right" },
    },
  });

  let y = tableEnd(doc) + 9;
  if (y > 260) {
    doc.addPage();
    y = 18;
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Transacties", margin, y);
  autoTable(doc, {
    startY: y + 3,
    margin: { left: margin, right: margin, bottom: 20 },
    theme: "striped",
    styles: { fontSize: 7.8, cellPadding: 1.8 },
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] },
    head: [["Document", "Tijd", "Type", "Kassier", "Items", "Betaling", "Totaal"]],
    body: detail.transactions.map((transaction) => [
      transaction.documentNumber,
      format(transaction.timestamp, "HH:mm:ss"),
      transaction.kind === "refund" ? "Retour" : "Verkoop",
      transaction.cashierName ?? "—",
      String(transaction.lines.reduce((sum, line) => sum + line.quantity, 0)),
      transaction.tenders.map((tender) => `${tender.method} ${euro(tender.amountCents)}`).join(" + "),
      `${euro(transaction.totalCents)}${transaction.roundingAdjustmentCents === 0 ? "" : `\nCashafronding ${transaction.roundingAdjustmentCents > 0 ? "+" : ""}${euro(transaction.roundingAdjustmentCents)}`}`,
    ]),
    columnStyles: { 4: { halign: "right" }, 6: { halign: "right" } },
  });

  y = tableEnd(doc) + 8;
  if (y > 264) {
    doc.addPage();
    y = 18;
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Integriteitscontrole", margin, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  doc.text(
    `Berekening: ${report.calculationAuthority === "server" ? "server-authoritair" : "historisch/legacy"} · hashversie ${report.hashPayloadVersion}`,
    margin,
    y + 5,
  );
  doc.text(`SHA-256: ${report.hash}`, margin, y + 10, { maxWidth: 180 });
  if (report.cashDifferenceReason)
    doc.text(`Toelichting kasverschil: ${report.cashDifferenceReason}`, margin, y + 15, { maxWidth: 180 });

  addPageNumbers(doc);
  return doc;
};

export const downloadZReportPdf = (
  detail: DailyReportDetail,
  merchant: MerchantInfo,
) => {
  createZReportPdf(detail, merchant).save(
    `Z-rapport-${String(detail.report.reportNumber).padStart(4, "0")}-${format(detail.report.timestamp, "yyyy-MM-dd")}.pdf`,
  );
};
