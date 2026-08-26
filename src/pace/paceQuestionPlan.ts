import { pacePeriodFromQuestion, type PaceAnalyticsDimension, type PaceAnalyticsDomain, type PaceAnalyticsMeasure, type PaceAnalyticsPeriodPreset, type PaceAnalyticsPlan } from "./paceAnalyticsPlan.js";
import type { PaceRecordEntity, PaceRecordPlan } from "./paceRecordPlan.js";

export type PaceReadToolName =
  | "sales.vat_breakdown"
  | "sales.tender_breakdown"
  | "gift_cards.summary"
  | "workforce.leave_summary"
  | "inventory.location_stock";

export interface PaceReadToolCall {
  name: PaceReadToolName;
  period: PaceAnalyticsPlan["period"];
  search: string;
  status: string;
  limit: number;
}

export interface PaceQuestionPlan {
  version: 1;
  intent: "knowledge" | "analytics" | "record" | "inventory_action" | "mixed" | "clarify";
  analytics: PaceAnalyticsPlan[];
  record: PaceRecordPlan | null;
  tools: PaceReadToolCall[];
  inventoryAction: boolean;
  broadContext: boolean;
  needsComposition: boolean;
  clarification: string | null;
  confidence: number;
}

const DOMAINS = new Set<PaceAnalyticsDomain>(["sales", "inventory", "customers", "workforce", "operations"]);
const MEASURES = new Set<PaceAnalyticsMeasure>([
  "revenue", "gross_profit", "margin", "transactions", "units", "average_ticket", "discount", "refunds",
  "stock_quantity", "stock_cost_value", "stock_retail_value", "days_without_sale", "days_of_cover",
  "customer_spend", "customer_visits", "customer_recency", "scheduled_hours", "sales_per_scheduled_hour",
  "status_count", "cash_difference", "void_value",
]);
const DIMENSIONS = new Set<PaceAnalyticsDimension>([
  "total", "weekday", "hour", "day", "week", "month", "year", "product", "category", "brand", "supplier",
  "employee", "payment_method", "source", "customer", "status", "reason",
]);
const PERIODS = new Set<PaceAnalyticsPeriodPreset>([
  "all_time", "today", "yesterday", "last_7_days", "last_30_days", "last_60_days", "last_90_days",
  "this_week", "last_week", "this_month", "last_month", "this_year", "last_year", "custom",
]);
const RECORDS = new Set<PaceRecordEntity>([
  "transaction", "product", "customer", "gift_card", "daily_report", "purchase_order", "webshop_order",
  "service_order", "stock_movement", "employee", "leave_request", "audit_entry",
]);
const INTENTS = new Set<PaceQuestionPlan["intent"]>(["knowledge", "analytics", "record", "inventory_action", "mixed", "clarify"]);
const READ_TOOLS = new Set<PaceReadToolName>([
  "sales.vat_breakdown", "sales.tender_breakdown", "gift_cards.summary", "workforce.leave_summary", "inventory.location_stock",
]);
const ISO_DATE = /^20\d{2}-\d{2}-\d{2}$/;

const object = (value: unknown): Record<string, unknown> | null => value && typeof value === "object" && !Array.isArray(value)
  ? value as Record<string, unknown>
  : null;

const cleanSearch = (value: unknown) => typeof value === "string" ? value.trim().slice(0, 160) : "";

const parseAnalytics = (value: unknown): PaceAnalyticsPlan | null => {
  const raw = object(value);
  const periodRaw = object(raw?.period);
  if (!raw || !periodRaw || !DOMAINS.has(raw.domain as PaceAnalyticsDomain) || !MEASURES.has(raw.measure as PaceAnalyticsMeasure)
    || !DIMENSIONS.has(raw.dimension as PaceAnalyticsDimension) || !PERIODS.has(periodRaw.preset as PaceAnalyticsPeriodPreset)) return null;
  const preset = periodRaw.preset as PaceAnalyticsPeriodPreset;
  const start = typeof periodRaw.start === "string" && ISO_DATE.test(periodRaw.start) ? periodRaw.start : undefined;
  const end = typeof periodRaw.end === "string" && ISO_DATE.test(periodRaw.end) ? periodRaw.end : undefined;
  if (preset === "custom" && (!start || !end || start >= end)) return null;
  const filtersRaw = object(raw.filters);
  return {
    version: 1,
    domain: raw.domain as PaceAnalyticsDomain,
    measure: raw.measure as PaceAnalyticsMeasure,
    dimension: raw.dimension as PaceAnalyticsDimension,
    period: { preset, ...(start ? { start } : {}), ...(end ? { end } : {}) },
    filters: {
      ...(cleanSearch(filtersRaw?.search) ? { search: cleanSearch(filtersRaw?.search) } : {}),
      ...(cleanSearch(filtersRaw?.status) ? { status: cleanSearch(filtersRaw?.status).toLocaleLowerCase("nl-BE") } : {}),
      ...(cleanSearch(filtersRaw?.category) ? { category: cleanSearch(filtersRaw?.category) } : {}),
    },
    sort: raw.sort === "asc" ? "asc" : "desc",
    limit: Math.min(25, Math.max(1, Number.isInteger(raw.limit) ? Number(raw.limit) : 12)),
    comparison: raw.comparison === "previous_period" ? "previous_period" : "none",
    rationale: typeof raw.rationale === "string" ? raw.rationale.slice(0, 160) : "Gemini queryplan",
  };
};

const parseRecord = (value: unknown): PaceRecordPlan | null => {
  const raw = object(value);
  if (!raw || !RECORDS.has(raw.entity as PaceRecordEntity)) return null;
  return {
    version: 1,
    entity: raw.entity as PaceRecordEntity,
    search: cleanSearch(raw.search),
    limit: Math.min(20, Math.max(1, Number.isInteger(raw.limit) ? Number(raw.limit) : 15)),
  };
};

const parseTool = (value: unknown): PaceReadToolCall | null => {
  const raw = object(value);
  if (!raw || !READ_TOOLS.has(raw.name as PaceReadToolName)) return null;
  const periodRaw = object(raw.period) ?? { preset: "last_30_days" };
  if (!PERIODS.has(periodRaw.preset as PaceAnalyticsPeriodPreset)) return null;
  const preset = periodRaw.preset as PaceAnalyticsPeriodPreset;
  const start = typeof periodRaw.start === "string" && ISO_DATE.test(periodRaw.start) ? periodRaw.start : undefined;
  const end = typeof periodRaw.end === "string" && ISO_DATE.test(periodRaw.end) ? periodRaw.end : undefined;
  if (preset === "custom" && (!start || !end || start >= end)) return null;
  return {
    name: raw.name as PaceReadToolName,
    period: { preset, ...(start ? { start } : {}), ...(end ? { end } : {}) },
    search: cleanSearch(raw.search),
    status: cleanSearch(raw.status).toLocaleLowerCase("nl-BE"),
    limit: Math.min(25, Math.max(1, Number.isInteger(raw.limit) ? Number(raw.limit) : 12)),
  };
};

export const parsePaceQuestionPlan = (value: unknown): PaceQuestionPlan | null => {
  const raw = object(value);
  if (!raw || raw.version !== 1 || !INTENTS.has(raw.intent as PaceQuestionPlan["intent"])) return null;
  const analytics = Array.isArray(raw.analytics)
    ? raw.analytics.map(parseAnalytics).filter((plan): plan is PaceAnalyticsPlan => plan !== null).slice(0, 3)
    : [];
  const record = parseRecord(raw.record);
  const tools = Array.isArray(raw.tools)
    ? raw.tools.map(parseTool).filter((tool): tool is PaceReadToolCall => tool !== null).slice(0, 5)
    : [];
  const inventoryAction = raw.inventoryAction === true;
  const broadContext = raw.broadContext === true;
  if (!analytics.length && !record && !tools.length && !inventoryAction && !broadContext && raw.intent !== "knowledge" && raw.intent !== "clarify") return null;
  return {
    version: 1,
    intent: raw.intent as PaceQuestionPlan["intent"],
    analytics,
    record,
    tools,
    inventoryAction,
    broadContext,
    needsComposition: raw.needsComposition === true || tools.length > 0 || [analytics.length > 0, Boolean(record), inventoryAction, broadContext].filter(Boolean).length > 1,
    clarification: typeof raw.clarification === "string" && raw.clarification.trim() ? raw.clarification.trim().slice(0, 240) : null,
    confidence: typeof raw.confidence === "number" && Number.isFinite(raw.confidence) ? Math.min(1, Math.max(0, raw.confidence)) : 0,
  };
};

const explicitSearchAfter = (question: string, pattern: RegExp) => {
  const match = question.match(pattern)?.[1]?.trim();
  return match ? match.replace(/[?.!,;]+$/, "").slice(0, 160) : "";
};

/** Safe availability fallback when Gemini planning is unavailable or invalid. */
export const planPaceReadTools = (rawQuestion: string): PaceReadToolCall[] => {
  const question = rawQuestion.trim().toLocaleLowerCase("nl-BE");
  const period = pacePeriodFromQuestion(question);
  const tool = (name: PaceReadToolName, search = "", status = ""): PaceReadToolCall => ({ name, period, search, status, limit: 12 });
  const tools: PaceReadToolCall[] = [];
  if (/\b(btw|omzetbelasting|vat)\b/.test(question) && /\b(tarief|aangifte|bedrag|hoeveel|overzicht|uitsplits|per)\w*/.test(question)) {
    tools.push(tool("sales.vat_breakdown"));
  }
  if (/\b(splitbetaling|split payment|tender|betaalregels?|deelbetaling)\w*/.test(question)) {
    tools.push(tool("sales.tender_breakdown"));
  }
  if (/\b(cadeaubon|gift ?card)\w*/.test(question) && /\b(verval|verlopen|saldo|ledger|event|opwaard|inwissel|uitgift|actief|geblokkeerd)\w*/.test(question)) {
    tools.push(tool("gift_cards.summary", "", /\b(verval|verlopen)\w*/.test(question) ? "expiring" : ""));
  }
  if (/\b(verlofsaldo|verlof saldo|leave balance|open verlof|verlofaanvragen?)\w*/.test(question)) {
    const search = explicitSearchAfter(rawQuestion, /\b(?:van|voor)\s+([\p{L}][\p{L}'’ -]{1,80})/iu);
    tools.push(tool("workforce.leave_summary", search, /\b(open|pending)\b/.test(question) ? "pending" : ""));
  }
  if (/\b(voorraadlocatie|stocklocatie|magazijn|warehouse|backroom|winkelvloer|per locatie|op locatie)\w*/.test(question)) {
    const search = explicitSearchAfter(rawQuestion, /\b(?:locatie|magazijn|warehouse|backroom)\s+([\p{L}\d][\p{L}\d'’ _-]{0,80})/iu);
    tools.push(tool("inventory.location_stock", search));
  }
  return tools.slice(0, 5);
};

export const PACE_PLANNER_INSTRUCTIONS = `Je plant read-only vragen voor PWAYMENT, een Belgisch multi-tenant retailplatform.
Geef uitsluitend één JSON-object. Verzin geen records, cijfers, rechten of SQL.

Kies meerdere databronnen wanneer de vraag meerdere onderdelen of domeinen combineert. Gebruik record alleen voor een concreet record, nummer, naam, SKU of barcode. Gebruik analytics voor tellingen, totalen, rangschikkingen, trends en vergelijkingen. Een woord zoals status betekent niet automatisch recordlookup.

Zet in search uitsluitend de echte naam, code, SKU, barcode of categorie waarnaar gezocht wordt. Kopieer nooit de hele vraag naar search. Laat search leeg wanneer er geen expliciete zoekterm is.

Beschikbare analytics:
- domains: sales, inventory, customers, workforce, operations
- measures: revenue, gross_profit, margin, transactions, units, average_ticket, discount, refunds, stock_quantity, stock_cost_value, stock_retail_value, days_without_sale, days_of_cover, customer_spend, customer_visits, customer_recency, scheduled_hours, sales_per_scheduled_hour, status_count, cash_difference, void_value
- dimensions: total, weekday, hour, day, week, month, year, product, category, brand, supplier, employee, payment_method, source, customer, status, reason
- periods: all_time, today, yesterday, last_7_days, last_30_days, last_60_days, last_90_days, this_week, last_week, this_month, last_month, this_year, last_year, custom

Beschikbare records: transaction, product, customer, gift_card, daily_report, purchase_order, webshop_order, service_order, stock_movement, employee, leave_request, audit_entry.

Gespecialiseerde read-only tools:
- sales.vat_breakdown: wettelijke BTW-bedragen en omzet per tarief voor een periode
- sales.tender_breakdown: echte tenderregels, inclusief splitbetalingen, per betaalmethode
- gift_cards.summary: actuele saldi, vervaldata en eventtypes; gebruik status=expiring voor vervallende kaarten
- workforce.leave_summary: verlofsaldo en aanvragen per medewerker/type; search bevat alleen een expliciete medewerkersnaam
- inventory.location_stock: on-hand, gereserveerd en beschikbaar per voorraadlocatie en product
Iedere tool heeft period, search, status en limit. Gebruik tools in plaats van een approximatieve gewone analyticsquery wanneer de vraag over deze gegevens gaat.

inventoryAction is alleen voor concreet advies over trage voorraad, verkoopsstilstand, bundels of veilige korting.
broadContext is voor winkeloverzicht, modules, abonnement, algemene operationele toestand of wanneer een how-to-antwoord actuele winkelcontext nodig heeft.
intent=clarify alleen als twee wezenlijk verschillende interpretaties mogelijk zijn. Geef dan één korte clarification.
needsComposition=true bij samengestelde vragen, advies, uitleg naast cijfers, of meerdere databronnen.

Schema:
{"version":1,"intent":"knowledge|analytics|record|inventory_action|mixed|clarify","analytics":[],"record":null,"tools":[],"inventoryAction":false,"broadContext":false,"needsComposition":false,"clarification":null,"confidence":0.0}`;
