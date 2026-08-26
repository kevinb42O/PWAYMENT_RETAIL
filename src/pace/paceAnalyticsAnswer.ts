import type { PaceAnalyticsMeasure, PaceAnalyticsPlan } from "./paceAnalyticsPlan.js";

interface AnalyticsRow {
  label?: unknown;
  metricValue?: unknown;
  revenueCents?: unknown;
  grossProfitCents?: unknown;
  marginPercent?: unknown;
  transactionCount?: unknown;
  refundCount?: unknown;
  refundCents?: unknown;
  discountCents?: unknown;
  units?: unknown;
  tradingDays?: unknown;
  averageTicketCents?: unknown;
  stockQuantity?: unknown;
  stockCostValueCents?: unknown;
  stockRetailValueCents?: unknown;
  daysWithoutSale?: unknown;
  daysOfCover?: unknown;
  unitsSold30Days?: unknown;
  spendCents?: unknown;
  visitCount?: unknown;
  lastVisitAt?: unknown;
  daysSinceLastVisit?: unknown;
  scheduledMinutes?: unknown;
  salesPerScheduledHourCents?: unknown;
  amountCents?: unknown;
  voidCount?: unknown;
  count?: unknown;
  operation?: unknown;
  status?: unknown;
  cashDifferenceCents?: unknown;
  reason?: unknown;
  occurredAt?: unknown;
}

interface AnalyticsContext {
  unavailable?: unknown;
  query?: unknown;
  period?: unknown;
  basis?: unknown;
  dataQuality?: unknown;
  rows?: unknown;
}

const numberValue = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) ? value : null;
const textValue = (value: unknown) => typeof value === "string" ? value : null;
const euros = (cents: number) => new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR" }).format(cents / 100);
const number = (value: number, maximumFractionDigits = 1) => new Intl.NumberFormat("nl-BE", { maximumFractionDigits }).format(value);
const date = (value: string) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat("nl-BE", { day: "numeric", month: "long", year: "numeric" }).format(parsed);
};

const moneyMeasures = new Set<PaceAnalyticsMeasure>([
  "revenue", "gross_profit", "average_ticket", "discount", "refunds", "stock_cost_value", "stock_retail_value",
  "customer_spend", "sales_per_scheduled_hour", "cash_difference", "void_value",
]);

const metricLabel: Record<PaceAnalyticsMeasure, string> = {
  revenue: "Netto-omzet",
  gross_profit: "Brutowinst",
  margin: "Brutomarge",
  transactions: "Verkopen",
  units: "Stuks",
  average_ticket: "Gemiddelde verkoop",
  discount: "Korting",
  refunds: "Retourwaarde",
  stock_quantity: "Voorraad",
  stock_cost_value: "Voorraad tegen kostprijs",
  stock_retail_value: "Voorraad tegen verkoopprijs",
  days_without_sale: "Stilstand",
  days_of_cover: "Voorraaddekking",
  customer_spend: "Klantwaarde",
  customer_visits: "Bezoeken",
  customer_recency: "Dagen sinds laatste bezoek",
  scheduled_hours: "Geplande uren",
  sales_per_scheduled_hour: "Omzet per gepland uur",
  status_count: "Aantal",
  cash_difference: "Absoluut kasverschil",
  void_value: "Geannuleerde waarde",
};

const planMetricLabel = (plan: PaceAnalyticsPlan) =>
  plan.domain === "sales" && plan.dimension === "weekday" && plan.measure === "revenue"
    ? "Gemiddelde dagomzet"
    : metricLabel[plan.measure];

const domainTitle: Record<PaceAnalyticsPlan["domain"], string> = {
  sales: "Verkoopanalyse",
  inventory: "Voorraadanalyse",
  customers: "Klantanalyse",
  workforce: "Teamanalyse",
  operations: "Operationele analyse",
};

const formatMetric = (measure: PaceAnalyticsMeasure, value: number) => {
  if (moneyMeasures.has(measure)) return euros(value);
  if (measure === "margin") return `${number(value)}%`;
  if (measure === "days_without_sale" || measure === "customer_recency") return `${number(value, 0)} dagen`;
  if (measure === "days_of_cover") return `${number(value)} dagen`;
  if (measure === "scheduled_hours") return `${number(value)} uur`;
  if (measure === "stock_quantity" || measure === "units") return `${number(value)} stuks`;
  return number(value);
};

const rowLabel = (plan: PaceAnalyticsPlan, value: string) =>
  plan.dimension === "day" ? date(value) : value;

const periodLabel = (period: unknown) => {
  if (!period || typeof period !== "object") return "gekozen periode";
  const value = period as Record<string, unknown>;
  const preset = textValue(value.preset);
  const labels: Record<string, string> = {
    all_time: "volledige historiek",
    today: "vandaag",
    yesterday: "gisteren",
    last_7_days: "laatste 7 dagen",
    last_30_days: "laatste 30 dagen",
    last_60_days: "laatste 60 dagen",
    last_90_days: "laatste 90 dagen",
    this_week: "deze week",
    last_week: "vorige week",
    this_month: "deze maand",
    last_month: "vorige maand",
    this_year: "dit jaar",
    last_year: "vorig jaar",
    current_stock_with_30_and_90_day_velocity: "huidige voorraad met verkoopritme van 30 en 90 dagen",
    current_status: "huidige status",
  };
  if (preset && labels[preset]) return labels[preset];
  const start = textValue(value.start);
  const end = textValue(value.endExclusive);
  if (start && end) return `${date(start)} tot ${date(new Date(new Date(end).getTime() - 1).toISOString())}`;
  return preset ?? "gekozen periode";
};

const detailLines = (row: AnalyticsRow, measure: PaceAnalyticsMeasure) => {
  const details: string[] = [];
  const addMoney = (label: string, value: unknown) => { const parsed = numberValue(value); if (parsed != null) details.push(`${label}: ${euros(parsed)}`); };
  const addNumber = (label: string, value: unknown, suffix = "") => { const parsed = numberValue(value); if (parsed != null) details.push(`${label}: ${number(parsed)}${suffix}`); };

  if (measure !== "revenue") addMoney("Netto-omzet", row.revenueCents);
  if (measure !== "gross_profit") addMoney("Brutowinst", row.grossProfitCents);
  if (measure !== "margin") addNumber("Brutomarge", row.marginPercent, "%");
  addNumber("Verkopen", row.transactionCount);
  addNumber("Retouren", row.refundCount);
  if (measure !== "units") addNumber("Stuks", row.units);
  addNumber("Actieve verkoopdagen", row.tradingDays);
  addMoney("Gemiddelde verkoop", row.averageTicketCents);
  if (measure !== "stock_quantity") addNumber("Voorraad", row.stockQuantity, " stuks");
  addNumber("Verkocht in 30 dagen", row.unitsSold30Days, " stuks");
  if (measure !== "days_without_sale") addNumber("Stilstand", row.daysWithoutSale, " dagen");
  if (measure !== "days_of_cover") addNumber("Voorraaddekking", row.daysOfCover, " dagen");
  if (measure !== "customer_visits") addNumber("Bezoeken", row.visitCount);
  if (measure !== "customer_recency") addNumber("Sinds laatste bezoek", row.daysSinceLastVisit, " dagen");
  const lastVisit = textValue(row.lastVisitAt); if (lastVisit) details.push(`Laatste bezoek: ${date(lastVisit)}`);
  addNumber("Geplande uren", numberValue(row.scheduledMinutes) == null ? null : numberValue(row.scheduledMinutes)! / 60, " uur");
  addMoney("Omzet per gepland uur", row.salesPerScheduledHourCents);
  addNumber("Aantal", row.count);
  addNumber("Voids", row.voidCount);
  const status = textValue(row.status); if (status) details.push(`Status: ${status}`);
  const reason = textValue(row.reason); if (reason) details.push(`Reden: ${reason}`);
  const occurredAt = textValue(row.occurredAt); if (occurredAt) details.push(`Datum: ${date(occurredAt)}`);
  return details.slice(0, 4);
};

export const renderPaceAnalyticsAnswer = (rawContexts: unknown[]): string | null => {
  if (!Array.isArray(rawContexts) || rawContexts.length === 0) return null;
  const sections: string[] = [];

  for (const rawContext of rawContexts) {
    if (!rawContext || typeof rawContext !== "object") return null;
    const context = rawContext as AnalyticsContext;
    if (context.unavailable === true || !context.query || typeof context.query !== "object" || !Array.isArray(context.rows)) return null;
    const plan = context.query as PaceAnalyticsPlan;
    const rows = (context.rows as unknown[]).filter((row): row is AnalyticsRow => Boolean(row && typeof row === "object"));
    const selectedMetricLabel = planMetricLabel(plan);
    const heading = rawContexts.length > 1 ? `## ${domainTitle[plan.domain]} · ${selectedMetricLabel} · ${periodLabel(context.period)}` : "## Antwoord";
    if (rows.length === 0) {
      sections.push(`${heading}\n\n- Geen resultaten voor ${periodLabel(context.period)} binnen de gekozen filters.`);
      continue;
    }
    const best = rows[0];
    const bestLabel = rowLabel(plan, textValue(best.label) ?? "Eerste resultaat");
    const bestMetric = numberValue(best.metricValue);
    const direction = plan.sort === "asc" ? "laagste" : "hoogste";
    const intro = bestMetric == null
      ? `${bestLabel} staat bovenaan binnen ${periodLabel(context.period)}.`
      : `${bestLabel} heeft de ${direction} ${selectedMetricLabel.toLocaleLowerCase("nl-BE")}: ${formatMetric(plan.measure, bestMetric)}.`;
    const lines = [heading, "", `- ${intro}`, "", "## Rangschikking", ""];
    for (const row of rows) {
      const label = rowLabel(plan, textValue(row.label) ?? "Onbekend");
      const metric = numberValue(row.metricValue);
      lines.push(`- ${label}`);
      if (metric != null) lines.push(`  - ${selectedMetricLabel}: ${formatMetric(plan.measure, metric)}`);
      for (const detail of detailLines(row, plan.measure)) lines.push(`  - ${detail}`);
    }
    lines.push("", "## Onderbouwing", "", `- Periode: ${periodLabel(context.period)}.`);
    const basis = textValue(context.basis); if (basis) lines.push(`- Definitie: ${basis}.`);
    if (context.dataQuality && typeof context.dataQuality === "object") {
      const quality = context.dataQuality as Record<string, unknown>;
      const coverage = numberValue(quality.costCoveragePercent);
      if (coverage != null && (plan.measure === "gross_profit" || plan.measure === "margin" || plan.measure === "stock_cost_value")) lines.push(`- Kostprijsdekking: ${number(coverage)}%.`);
      if (quality.attendanceAvailable === false && plan.domain === "workforce") lines.push("- Geplande uren zijn roosteruren, geen geregistreerde aanwezigheid.");
    }
    sections.push(lines.join("\n"));
  }
  return sections.join("\n\n");
};
