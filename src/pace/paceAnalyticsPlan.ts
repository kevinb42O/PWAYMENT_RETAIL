export type PaceAnalyticsDomain = "sales" | "inventory" | "customers" | "workforce" | "operations";

export type PaceAnalyticsMeasure =
  | "revenue"
  | "gross_profit"
  | "margin"
  | "transactions"
  | "units"
  | "average_ticket"
  | "discount"
  | "refunds"
  | "stock_quantity"
  | "stock_cost_value"
  | "stock_retail_value"
  | "days_without_sale"
  | "days_of_cover"
  | "customer_spend"
  | "customer_visits"
  | "customer_recency"
  | "scheduled_hours"
  | "sales_per_scheduled_hour"
  | "status_count"
  | "cash_difference"
  | "void_value";

export type PaceAnalyticsDimension =
  | "total"
  | "weekday"
  | "hour"
  | "day"
  | "week"
  | "month"
  | "year"
  | "product"
  | "category"
  | "brand"
  | "supplier"
  | "employee"
  | "payment_method"
  | "source"
  | "customer"
  | "status"
  | "reason";

export type PaceAnalyticsPeriodPreset =
  | "all_time"
  | "today"
  | "yesterday"
  | "last_7_days"
  | "last_30_days"
  | "last_60_days"
  | "last_90_days"
  | "this_week"
  | "last_week"
  | "this_month"
  | "last_month"
  | "this_year"
  | "last_year"
  | "custom";

export interface PaceAnalyticsPlan {
  version: 1;
  domain: PaceAnalyticsDomain;
  measure: PaceAnalyticsMeasure;
  dimension: PaceAnalyticsDimension;
  period: { preset: PaceAnalyticsPeriodPreset; start?: string; end?: string };
  filters: { search?: string; status?: string; category?: string };
  sort: "asc" | "desc";
  limit: number;
  comparison: "none" | "previous_period";
  rationale: string;
}

const has = (value: string, pattern: RegExp) => pattern.test(value);

const monthNumber: Record<string, number> = {
  januari: 1, februari: 2, maart: 3, april: 4, mei: 5, juni: 6,
  juli: 7, augustus: 8, september: 9, oktober: 10, november: 11, december: 12,
};

const validIsoDate = (year: number, month: number, day: number) => {
  const value = new Date(Date.UTC(year, month - 1, day));
  return value.getUTCFullYear() === year && value.getUTCMonth() === month - 1 && value.getUTCDate() === day
    ? value.toISOString().slice(0, 10)
    : null;
};

const exclusiveEnd = (iso: string) => {
  const value = new Date(`${iso}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
};

const explicitDateRange = (question: string): PaceAnalyticsPlan["period"] | null => {
  const iso = question.match(/\b(20\d{2}-\d{2}-\d{2})\b.*?\b(?:tot|t\/m|en)\b.*?\b(20\d{2}-\d{2}-\d{2})\b/);
  if (iso) return { preset: "custom", start: iso[1], end: exclusiveEnd(iso[2]) };
  const numeric = question.match(/\b(\d{1,2})[/.](\d{1,2})[/.](20\d{2})\b.*?\b(?:tot|t\/m|en)\b.*?\b(\d{1,2})[/.](\d{1,2})[/.](20\d{2})\b/);
  if (numeric) {
    const start = validIsoDate(Number(numeric[3]), Number(numeric[2]), Number(numeric[1]));
    const end = validIsoDate(Number(numeric[6]), Number(numeric[5]), Number(numeric[4]));
    if (start && end) return { preset: "custom", start, end: exclusiveEnd(end) };
  }
  const named = question.match(/\b(\d{1,2})\s+(januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december)\s+(20\d{2})\b.*?\b(?:tot|t\/m|en)\b.*?\b(\d{1,2})\s+(januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december)\s+(20\d{2})\b/);
  if (named) {
    const start = validIsoDate(Number(named[3]), monthNumber[named[2]], Number(named[1]));
    const end = validIsoDate(Number(named[6]), monthNumber[named[5]], Number(named[4]));
    if (start && end) return { preset: "custom", start, end: exclusiveEnd(end) };
  }
  return null;
};

export const pacePeriodFromQuestion = (question: string): PaceAnalyticsPlan["period"] => {
  const explicit = explicitDateRange(question);
  if (explicit) return explicit;
  const year = question.match(/\b(20\d{2})\b/);
  if (year) return { preset: "custom", start: `${year[1]}-01-01`, end: `${Number(year[1]) + 1}-01-01` };
  if (has(question, /\b(vandaag|today|aujourd['’]?hui)\b/)) return { preset: "today" };
  if (has(question, /\b(gisteren|yesterday|hier)\b/)) return { preset: "yesterday" };
  if (has(question, /\b(deze|this|huidige)\s+week\b.*\b(vorige|last)\s+week\b/)) return { preset: "this_week" };
  if (has(question, /\b(deze|this|huidige)\s+maand\b.*\b(vorige|last)\s+maand\b/)) return { preset: "this_month" };
  if (has(question, /\b(dit|this|huidige)\s+jaar\b.*\b(vorig|last)\s+jaar\b/)) return { preset: "this_year" };
  if (has(question, /\b(vorige|afgelopen|last)\s+week\b/)) return { preset: "last_week" };
  if (has(question, /\b(deze|this|huidige)\s+week\b/)) return { preset: "this_week" };
  if (has(question, /\b(vorige|afgelopen|last)\s+maand\b/)) return { preset: "last_month" };
  if (has(question, /\b(deze|this|huidige)\s+maand\b/)) return { preset: "this_month" };
  if (has(question, /\b(vorig|afgelopen|last)\s+jaar\b/)) return { preset: "last_year" };
  if (has(question, /\b(dit|this|huidige)\s+jaar\b/)) return { preset: "this_year" };
  const days = question.match(/\b(?:laatste|afgelopen|last|past)\s+(7|30|60|90)\s+dagen?\b/);
  if (days) return { preset: `last_${days[1]}_days` as PaceAnalyticsPeriodPreset };
  if (has(question, /\b(all[ -]?time|altijd|volledige historiek|historisch gezien|historique complet)\b/)) return { preset: "all_time" };
  return { preset: "last_30_days" };
};

const limitFromQuestion = (question: string) => {
  const explicit = question.match(/\b(?:top|eerste|beste|slechtste)\s+(\d{1,2})\b/);
  if (explicit) return Math.min(25, Math.max(1, Number(explicit[1])));
  if (has(question, /\b(welke|wat|wie)\b.*\b(beste|slechtste|hoogste|laagste|meeste|minste)\b/)) return 5;
  return 12;
};

const comparisonFromQuestion = (question: string): PaceAnalyticsPlan["comparison"] =>
  has(question, /\b(vergelijk|tegenover|versus|vs\.?|verschil|gestegen|gedaald|groei|evolutie|trend)\b/)
    ? "previous_period"
    : "none";

const isAnalyticalQuestion = (question: string) => has(
  question,
  /\b(hoeveel|welke|wat|wie|beste|slechtste|hoogste|laagste|meeste|minste|gemiddeld|totaal|omzet|marge|winst|verkoop|verkocht|transact|korting|retour|voorraad|stock|klant|bezoek|kassier|medewerker|shift|rooster|webshop|service|herstel|bestel|purchase|void|annul|kasverschil|prestatie|analyse|toon|rangschik|vergelijk)\w*/,
);

/**
 * Fast, deterministic first-pass planner. It deliberately emits only a small
 * enum vocabulary. The database validates the same vocabulary again, so user
 * text can never become SQL. Unknown/free product terms remain a bounded search
 * hint and are only used with parameterized ILIKE predicates.
 */
export const planPaceAnalyticsQuestion = (rawQuestion: string): PaceAnalyticsPlan | null => {
  const question = rawQuestion.trim().toLocaleLowerCase("nl-BE");
  if (!question || !isAnalyticalQuestion(question)) return null;
  if (
    has(question, /\b(wat betekent|hoe werkt|leg uit|waar (?:zie|beheer|voeg|vind)|waarom kan)\b/)
    && !has(question, /\b(hoeveel|beste|slechtste|hoogste|laagste|meeste|minste|gemiddeld|totaal|analyse|toon|rangschik|vergelijk|gestegen|gedaald)\w*/)
  ) return null;

  const period = pacePeriodFromQuestion(question);
  const comparison = comparisonFromQuestion(question);
  const sort: PaceAnalyticsPlan["sort"] = has(question, /\b(slechtste|laagste|minste)\b/) ? "asc" : "desc";
  const limit = limitFromQuestion(question);

  if (has(question, /\b(webshop|online order|service(?:order)?|herstel|herstelling|purchase order|bestelorder|void|annulering|kasverschil)\w*/)) {
    const measure: PaceAnalyticsMeasure = has(question, /kasverschil/) ? "cash_difference"
      : has(question, /\b(void|annulering)\w*/) ? "void_value"
        : "status_count";
    const status = question.match(/\b(open|pending|processing|ready|completed|cancelled|canceled|betaald|onbetaald|verzonden|afgehaald|afgerond|geannuleerd)\b/)?.[1];
    return { version: 1, domain: "operations", measure, dimension: measure === "status_count" ? "status" : has(question, /reden/) ? "reason" : "employee", period, filters: status ? { status } : {}, sort, limit, comparison, rationale: "operationele status- of uitzonderingsanalyse" };
  }

  if (has(question, /\b(rooster|shift|gepland|planning|personeel|kassier|medewerker|verkoper|team)\w*/)) {
    const measure: PaceAnalyticsMeasure = has(question, /per\s+(?:gepland\s+)?uur/) ? "sales_per_scheduled_hour"
      : has(question, /\b(uur|uren|rooster|gepland|planning)\w*/) ? "scheduled_hours"
        : has(question, /marge|winst/) ? "gross_profit" : "revenue";
    return { version: 1, domain: "workforce", measure, dimension: "employee", period, filters: {}, sort, limit, comparison, rationale: "team- en roosteranalyse" };
  }

  if (has(question, /\b(klantwaarde|beste\s+klant|topklant|klanten?\s+(?:zijn|hebben|gaven|besteed)|customer value|bezoek|retentie|terugker|afgehaakt|slapend|loyaal)\w*/)) {
    const measure: PaceAnalyticsMeasure = has(question, /\b(laatst|recent|afgehaakt|slapend|dagen|langst\s+niet)\w*/) ? "customer_recency"
      : has(question, /\b(bezoek|aankopen|transact)\w*/) ? "customer_visits"
        : "customer_spend";
    return { version: 1, domain: "customers", measure, dimension: "customer", period, filters: {}, sort: measure === "customer_recency" ? "desc" : sort, limit, comparison, rationale: "klantwaarde- en bezoekanalyse" };
  }

  if (has(question, /\b(voorraad|stock|stockout|dekking|cover|stof happen|stagnant|slow|traag|stil|vastzittend|leverancier)\w*/)) {
    const measure: PaceAnalyticsMeasure = has(question, /\b(stof happen|niet verkocht|ouder|oudste|stil|stilstand|stagnant|slow|traag)\b/) ? "days_without_sale"
      : has(question, /\b(cover|stockout|dekking)\b|raakt.*\bop\b/) ? "days_of_cover"
        : has(question, /\b(kostwaarde|vastzittende kost|inkoopwaarde)\b/) ? "stock_cost_value"
          : has(question, /\b(retailwaarde|verkoopwaarde)\b/) ? "stock_retail_value"
            : "stock_quantity";
    const dimension: PaceAnalyticsDimension = has(question, /leverancier/) ? "supplier" : has(question, /categorie/) ? "category" : "product";
    return { version: 1, domain: "inventory", measure, dimension, period, filters: {}, sort: measure === "days_of_cover" && has(question, /raakt.*op|stockout/) ? "asc" : sort, limit, comparison, rationale: "voorraadpositie en verkoopsnelheid" };
  }

  if (!has(question, /\b(omzet|marge|winst|verkoop|verkop|verkocht|transact|ticket|mand|stuks|aantal|korting|retour|betaal|categorie|product|artikel|merk|bron|kanaal|dag|week|maand|jaar|uur)\w*/)) return null;

  const measure: PaceAnalyticsMeasure = has(question, /\b(brutowinst|gross profit|winst)\b/) ? "gross_profit"
    : has(question, /\b(marge|margin)\b/) ? "margin"
      : has(question, /\b(gemiddeld(?:e)?\s+(?:ticket|verkoop|bon|mand)|average ticket|basket)\b/) ? "average_ticket"
        : has(question, /\b(korting|discount)\w*/) ? "discount"
          : has(question, /\b(retour|refund)\w*/) ? "refunds"
            : has(question, /\b(betaal|payment|cash|kaart|pin)\w*/) && has(question, /\b(meest|minst|vaak|gebruik)\w*/) ? "transactions"
              : has(question, /\b(stuks|units|aantal producten)\b/) ? "units"
                : has(question, /\b(transacties|verkopen|aantal verkopen)\b/) && !has(question, /omzet/) ? "transactions"
                  : "revenue";
  const dimension: PaceAnalyticsDimension = has(question, /\b(weekdag|dag van de week|verkoopsdag)\b/) ? "weekday"
    : has(question, /\b(uur|tijdstip|moment van de dag)\b/) ? "hour"
      : has(question, /\b(per dag|dagelijks|datum)\b/) ? "day"
        : has(question, /\b(per week|wekelijks)\b/) ? "week"
          : has(question, /\b(per maand|maandelijks)\b/) ? "month"
            : has(question, /\b(per jaar|jaarlijks)\b/) ? "year"
              : has(question, /\b(categorie|afdeling)\w*/) ? "category"
                : has(question, /\b(merk|brand)\w*/) ? "brand"
                  : has(question, /\b(product|artikel|sku)\w*/) ? "product"
                    : has(question, /\b(kassier|medewerker|verkoper)\w*/) ? "employee"
                      : has(question, /\b(betaal|payment|cash|kaart|pin)\w*/) ? "payment_method"
                        : has(question, /\b(bron|kanaal|source)\w*/) ? "source"
                          : "total";

  return { version: 1, domain: "sales", measure, dimension, period, filters: {}, sort, limit, comparison, rationale: "verkoopanalyse" };
};

/** Build at most three independent plans for compound questions. */
export const planPaceAnalyticsQuestions = (rawQuestion: string): PaceAnalyticsPlan[] => {
  const clauses = rawQuestion
    .split(/(?:[?;\n]+|\s+en\s+(?=(?:welke|wat|wie|hoeveel|toon|geef|vergelijk|waar)))/i)
    .map((value) => value.trim())
    .filter((value) => value.length >= 4);
  const candidates = clauses.length > 1 ? clauses : [rawQuestion];
  const plans = candidates.map(planPaceAnalyticsQuestion).filter((plan): plan is PaceAnalyticsPlan => plan !== null);
  if (plans.length === 0 && clauses.length > 1) {
    const fallback = planPaceAnalyticsQuestion(rawQuestion);
    if (fallback) plans.push(fallback);
  }
  const seen = new Set<string>();
  return plans.filter((plan) => {
    const key = JSON.stringify([plan.domain, plan.measure, plan.dimension, plan.period, plan.filters]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 3);
};

const isoDate = (value: Date) => value.toISOString().slice(0, 10);
const utcDate = (year: number, month: number, day: number) => new Date(Date.UTC(year, month, day));
const addUtcDays = (value: Date, days: number) => new Date(value.getTime() + days * 86_400_000);

const previousPeriod = (period: PaceAnalyticsPlan["period"], now: Date): PaceAnalyticsPlan["period"] | null => {
  const today = utcDate(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  if (period.preset === "today") return { preset: "yesterday" };
  if (period.preset === "this_week") return { preset: "last_week" };
  if (period.preset === "this_month") return { preset: "last_month" };
  if (period.preset === "this_year") return { preset: "last_year" };
  if (period.preset === "yesterday") return { preset: "custom", start: isoDate(addUtcDays(today, -2)), end: isoDate(addUtcDays(today, -1)) };
  const dayCount = period.preset.match(/^last_(7|30|60|90)_days$/)?.[1];
  if (dayCount) {
    const days = Number(dayCount);
    return { preset: "custom", start: isoDate(addUtcDays(today, -(days * 2 - 1))), end: isoDate(addUtcDays(today, -(days - 1))) };
  }
  if (period.preset === "last_week") {
    const weekday = (today.getUTCDay() + 6) % 7;
    const currentWeekStart = addUtcDays(today, -weekday);
    return { preset: "custom", start: isoDate(addUtcDays(currentWeekStart, -14)), end: isoDate(addUtcDays(currentWeekStart, -7)) };
  }
  if (period.preset === "last_month") {
    const startLastMonth = utcDate(today.getUTCFullYear(), today.getUTCMonth() - 1, 1);
    return { preset: "custom", start: isoDate(utcDate(today.getUTCFullYear(), today.getUTCMonth() - 2, 1)), end: isoDate(startLastMonth) };
  }
  if (period.preset === "last_year") return { preset: "custom", start: `${today.getUTCFullYear() - 2}-01-01`, end: `${today.getUTCFullYear() - 1}-01-01` };
  if (period.preset === "custom" && period.start && period.end) {
    const start = new Date(`${period.start}T00:00:00Z`);
    const end = new Date(`${period.end}T00:00:00Z`);
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && end > start) {
      const duration = end.getTime() - start.getTime();
      return { preset: "custom", start: isoDate(new Date(start.getTime() - duration)), end: period.start };
    }
  }
  return null;
};

/** Expand explicit trend/comparison requests without asking the database for extra rows. */
export const expandPaceAnalyticsComparisons = (plans: PaceAnalyticsPlan[], now = new Date()): PaceAnalyticsPlan[] => plans.flatMap((plan) => {
  if (plan.comparison !== "previous_period") return [plan];
  const previous = previousPeriod(plan.period, now);
  if (!previous) return [{ ...plan, comparison: "none" as const }];
  return [
    { ...plan, comparison: "none" as const },
    { ...plan, period: previous, comparison: "none" as const, rationale: `${plan.rationale} · vorige vergelijkbare periode` },
  ];
}).slice(0, 4);
