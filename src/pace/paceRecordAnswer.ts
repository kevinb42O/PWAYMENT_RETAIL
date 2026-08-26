interface RecordContext {
  unavailable?: unknown;
  entity?: unknown;
  basis?: unknown;
  rows?: unknown;
}

const entityLabels: Record<string, string> = {
  transaction: "Transacties",
  product: "Producten",
  customer: "Klanten",
  gift_card: "Cadeaubonnen",
  daily_report: "Z-rapporten",
  purchase_order: "Inkooporders",
  webshop_order: "Webshoporders",
  service_order: "Hersteldossiers",
  stock_movement: "Voorraadbewegingen",
  employee: "Medewerkers",
  leave_request: "Verlofaanvragen",
  audit_entry: "Auditregels",
};

const labels: Record<string, string> = {
  status: "Status", paymentStatus: "Betaling", inventoryStatus: "Voorraadstatus", fulfillmentStatus: "Fulfilment",
  kind: "Type", occurredAt: "Datum", createdAt: "Aangemaakt", updatedAt: "Bijgewerkt", submittedAt: "Ingediend",
  orderedAt: "Besteld", expectedDeliveryAt: "Verwachte levering", receivedAt: "Ontvangen", expiresAt: "Vervalt",
  totalCents: "Totaal", subtotalCents: "Subtotaal", discountCents: "Korting", shippingCents: "Verzending",
  balanceCents: "Saldo", initialCents: "Startwaarde", priceCents: "Verkoopprijs", costPriceCents: "Kostprijs",
  expectedCashCents: "Verwacht cash", countedCashCents: "Geteld cash", cashDifferenceCents: "Kasverschil",
  stockQty: "Voorraad", minStockQty: "Minimumvoorraad", quantityDelta: "Mutatie", quantityBefore: "Voor", quantityAfter: "Na",
  orderedQty: "Besteld", receivedQty: "Ontvangen", unitCostCents: "Eenheidskost",
  paymentMethod: "Betaalwijze", source: "Bron", cashier: "Kassier", supplier: "Leverancier", owner: "Eigenaar",
  category: "Categorie", brand: "Merk", variant: "Variant", sku: "SKU", barcode: "Barcode", priceGroup: "Prijsgroep",
  visitCount: "Bezoeken", totalSpentCents: "Totale besteding", lastVisitAt: "Laatste bezoek", active: "Actief",
  route: "Route", substatus: "Substatus", assetType: "Toesteltype", identifier: "Identificatie",
  reason: "Reden", adjustmentReason: "Correctiereden", returnDisposition: "Voorraadbestemming", user: "Gebruiker",
  startDate: "Van", endDate: "Tot", totalMinutes: "Duur", coverageRisk: "Bezettingsrisico", leaveType: "Verloftype",
  employeeNumber: "Personeelsnummer", startDateEmployee: "In dienst", endDateEmployee: "Uit dienst",
};

const money = (value: number) => new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR" }).format(value / 100);
const numeric = (value: number) => new Intl.NumberFormat("nl-BE", { maximumFractionDigits: 2 }).format(value);
const date = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("nl-BE", { day: "numeric", month: "long", year: "numeric", hour: value.includes("T") ? "2-digit" : undefined, minute: value.includes("T") ? "2-digit" : undefined }).format(parsed);
};

const primaryLabel = (row: Record<string, unknown>, index: number) => {
  for (const key of ["documentNumber", "invoiceNumber", "orderNumber", "reference", "number", "name", "productName", "employeeName", "maskedCode", "action"]) {
    if (typeof row[key] === "string" && row[key]) return String(row[key]);
  }
  if (typeof row.reportNumber === "number") return `Z-rapport ${row.reportNumber}`;
  return `Resultaat ${index + 1}`;
};

const formatValue = (key: string, value: unknown) => {
  if (typeof value === "number") {
    if (key.endsWith("Cents")) return money(value);
    if (key === "totalMinutes") return `${numeric(value / 60)} uur`;
    if (["stockQty", "minStockQty", "quantityDelta", "quantityBefore", "quantityAfter", "visitCount", "orderedQty", "receivedQty"].includes(key)) return numeric(value);
  }
  if (typeof value === "boolean") return value ? "ja" : "nee";
  if (typeof value === "string" && (key.endsWith("At") || key.endsWith("Date"))) return date(value);
  if (typeof value === "string" || typeof value === "number") return String(value);
  return null;
};

export const renderPaceRecordAnswer = (rawContext: unknown): string | null => {
  if (!rawContext || typeof rawContext !== "object") return null;
  const context = rawContext as RecordContext;
  if (context.unavailable === true || typeof context.entity !== "string" || !Array.isArray(context.rows)) return null;
  const heading = entityLabels[context.entity] ?? "Gevonden gegevens";
  if (context.rows.length === 0) return `## ${heading}\n\n- Geen overeenkomende records gevonden.`;
  const lines = [`## ${heading}`, ""];
  context.rows.slice(0, 20).forEach((rawRow, index) => {
    if (!rawRow || typeof rawRow !== "object") return;
    const row = rawRow as Record<string, unknown>;
    lines.push(`- ${primaryLabel(row, index)}`);
    let detailCount = 0;
    for (const [key, value] of Object.entries(row)) {
      if (detailCount >= 6 || ["id", "name", "productName", "employeeName", "documentNumber", "invoiceNumber", "orderNumber", "reference", "number", "maskedCode", "action", "lines", "totals"].includes(key) || value == null) continue;
      const formatted = formatValue(key, value);
      if (!formatted) continue;
      lines.push(`  - ${labels[key] ?? key}: ${formatted}`);
      detailCount += 1;
    }
    if (Array.isArray(row.lines) && row.lines.length > 0) lines.push(`  - Regels: ${row.lines.length} getoond`);
  });
  if (typeof context.basis === "string" && context.basis) lines.push("", "## Onderbouwing", "", `- ${context.basis}.`);
  return lines.join("\n");
};

