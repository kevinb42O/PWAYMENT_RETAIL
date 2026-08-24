import type {
  CommercialReturnPolicy,
  CustomerInsightSettings,
  PaceRecommendationRule,
} from "../data/merchant";
import type { Product, Transaction } from "../types";

export type CustomerInsightKind = "return-window" | "brand-affinity" | "recommendation-rule";

export interface CustomerInsight {
  id: string;
  kind: CustomerInsightKind;
  priority: number;
  tone: "flow" | "attention" | "success";
  title: string;
  compact: string;
  detail: string;
  expiresAt?: number;
  evidence: {
    transactionId?: number;
    lineId?: string;
    productId?: string;
    brand?: string;
    categoryId?: string;
    ruleId?: string;
  }[];
  action?: {
    kind: "catalog";
    label: string;
    productIds: string[];
    filterLabel: string;
  };
  reason?: string;
}

interface BuildCustomerInsightsInput {
  customerId: string;
  transactions: Transaction[];
  products: Product[];
  policy?: CommercialReturnPolicy;
  settings?: CustomerInsightSettings;
  recommendationRules?: PaceRecommendationRule[];
  now?: number;
  timezone?: string;
}

const daySerial = (timestamp: number, timezone: string): number => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(timestamp));
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return Date.UTC(Number(value.year), Number(value.month) - 1, Number(value.day));
};

const formatDay = (day: number) =>
  new Intl.DateTimeFormat("nl-BE", {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(day + 12 * 60 * 60 * 1000));

const returnedByOriginalLine = (transactions: Transaction[]) => {
  const returned = new Map<string, number>();
  for (const transaction of transactions) {
    if (transaction.kind !== "refund" || transaction.originalTransactionId == null) continue;
    for (const item of transaction.items) {
      const key = `${transaction.originalTransactionId}:${item.lineId}`;
      returned.set(key, (returned.get(key) ?? 0) + item.quantity);
    }
  }
  return returned;
};

const normalizedBrand = (value: string | undefined) => value?.trim().replace(/\s+/g, " ") ?? "";
const sizeLabel = (product: Product) => {
  const size = Object.entries(product.variantOptions ?? {}).find(
    ([key]) => key.trim().toLocaleLowerCase("nl-BE") === "maat" || key.trim().toLocaleLowerCase("en") === "size",
  )?.[1];
  return size ?? product.variant;
};

export const buildCustomerInsights = ({
  customerId,
  transactions,
  products,
  policy,
  settings,
  recommendationRules = [],
  now = Date.now(),
  timezone = "Europe/Brussels",
}: BuildCustomerInsightsInput): CustomerInsight[] => {
  if (!customerId || !settings?.enabled) return [];

  const customerRows = transactions.filter(
    (row) => row.customerId === customerId && row.source !== "demo",
  );
  const returned = returnedByOriginalLine(customerRows);
  const sales = customerRows.filter((row) => (row.kind ?? "sale") === "sale" && row.isFinalized === 1 && row.id != null);
  const insights: CustomerInsight[] = [];
  const today = daySerial(now, timezone);

  if (settings.returnRemindersEnabled && policy?.enabled) {
    for (const sale of sales) {
      const salePolicy = sale.merchantSnapshot?.commercialReturnPolicy ?? policy;
      const effectiveFrom = Date.parse(salePolicy.effectiveFrom);
      if (!salePolicy.enabled || !Number.isFinite(effectiveFrom) || sale.timestamp < effectiveFrom) continue;
      const deadline = daySerial(sale.timestamp, timezone) + salePolicy.windowDays * 86_400_000;
      const daysRemaining = Math.round((deadline - today) / 86_400_000);
      if (daysRemaining < 0 || daysRemaining > salePolicy.reminderLeadDays) continue;

      for (const item of sale.items) {
        const productType = item.product.productType ?? "merchandise";
        if (productType === "service" || productType === "gift-card") continue;
        if (salePolicy.excludedProductTypes.includes(productType as "service" | "gift-card")) continue;
        if (salePolicy.excludedCategoryIds.includes(item.product.category)) continue;
        const remaining = item.quantity - (returned.get(`${sale.id}:${item.lineId}`) ?? 0);
        if (remaining <= 0) continue;
        const variant = sizeLabel(item.product);
        const productLabel = [item.product.name, variant ? `maat ${variant}` : null].filter(Boolean).join(" · ");
        insights.push({
          id: `return:${customerId}:${sale.id}:${item.lineId}:${deadline}`,
          kind: "return-window",
          priority: daysRemaining === 0 ? 88 : 78,
          tone: "attention",
          title: daysRemaining === 0 ? "Retourtermijn eindigt vandaag" : `Nog ${daysRemaining} ${daysRemaining === 1 ? "dag" : "dagen"} retourtermijn`,
          compact: `${productLabel} · commercieel retourneerbaar t/m ${formatDay(deadline)}.`,
          detail: `Aangekocht op ${formatDay(daySerial(sale.timestamp, timezone))}. Vraag gerust of alles in orde is; de medewerker beslist altijd zelf wat relevant is.`,
          expiresAt: deadline + 86_400_000,
          evidence: [{ transactionId: sale.id, lineId: item.lineId, productId: item.product.id }],
        });
      }
    }
  }

  if (settings.brandAffinityEnabled) {
    const cutoff = now - settings.brandLookbackDays * 86_400_000;
    const brandTransactions = new Map<string, { label: string; transactionIds: Set<number>; evidence: CustomerInsight["evidence"] }>();
    for (const sale of sales) {
      if (sale.timestamp < cutoff || sale.id == null) continue;
      for (const item of sale.items) {
        const brand = normalizedBrand(item.product.brand);
        if (!brand) continue;
        const remaining = item.quantity - (returned.get(`${sale.id}:${item.lineId}`) ?? 0);
        if (remaining <= 0) continue;
        const key = brand.toLocaleLowerCase("nl-BE");
        const bucket = brandTransactions.get(key) ?? { label: brand, transactionIds: new Set<number>(), evidence: [] };
        bucket.transactionIds.add(sale.id);
        bucket.evidence.push({ transactionId: sale.id, lineId: item.lineId, productId: item.product.id, brand });
        brandTransactions.set(key, bucket);
      }
    }

    for (const [brandKey, bucket] of brandTransactions) {
      if (bucket.transactionIds.size < settings.minimumBrandTransactions) continue;
      const available = products.filter(
        (product) => product.isActive !== false && normalizedBrand(product.brand).toLocaleLowerCase("nl-BE") === brandKey && (product.stockQty == null || product.stockQty > 0),
      ).length;
      if (available === 0) continue;
      insights.push({
        id: `brand:${customerId}:${brandKey}`,
        kind: "brand-affinity",
        priority: 55,
        tone: "flow",
        title: `Terugkerende interesse in ${bucket.label}`,
        compact: `${bucket.transactionIds.size} eerdere aankopen · ${available} ${available === 1 ? "artikel" : "artikelen"} van dit merk beschikbaar.`,
        detail: "Dit is een feitelijk aankooppatroon, geen voorspeld smaakprofiel. Gebruik het alleen wanneer het natuurlijk in het gesprek past.",
        evidence: bucket.evidence,
      });
    }
  }

  const recommendationCutoff = now - settings.brandLookbackDays * 86_400_000;
  const purchasedLines = sales.flatMap((sale) => sale.timestamp < recommendationCutoff || sale.id == null
    ? []
    : sale.items.flatMap((item) => {
      const remaining = item.quantity - (returned.get(`${sale.id}:${item.lineId}`) ?? 0);
      return remaining > 0 ? [{ sale, item }] : [];
    }));
  const availableProducts = products.filter(
    (product) => product.isActive !== false && (product.stockQty == null || product.stockQty > 0),
  );
  const matches = (product: Product, match: PaceRecommendationRule["trigger"]) => {
    if (match.kind === "product") return product.id === match.value;
    if (match.kind === "category") return product.category === match.value;
    return normalizedBrand(product.brand).toLocaleLowerCase("nl-BE")
      === normalizedBrand(match.value).toLocaleLowerCase("nl-BE");
  };

  for (const rule of recommendationRules) {
    if (!rule.enabled || rule.scope !== "store") continue;
    const validFrom = rule.validFrom ? Date.parse(rule.validFrom) : Number.NEGATIVE_INFINITY;
    const validUntil = rule.validUntil ? Date.parse(rule.validUntil) : Number.POSITIVE_INFINITY;
    if ((rule.validFrom && !Number.isFinite(validFrom)) || (rule.validUntil && !Number.isFinite(validUntil))) continue;
    if (now < validFrom || now > validUntil) continue;

    const sourceLines = purchasedLines.filter(({ item }) => matches(item.product, rule.trigger));
    if (sourceLines.length === 0) continue;
    const targets = availableProducts.filter((product) => matches(product, rule.recommendation));
    if (targets.length === 0) continue;

    const sourceTransactionCount = new Set(sourceLines.map(({ sale }) => sale.id)).size;
    insights.push({
      id: `rule:${customerId}:${rule.id}`,
      kind: "recommendation-rule",
      priority: Math.min(100, Math.max(1, Math.round(rule.priority))),
      tone: rule.priority >= 80 ? "attention" : "flow",
      title: rule.name,
      compact: `${targets.length} ${targets.length === 1 ? "passend artikel" : "passende artikelen"} beschikbaar · ${rule.reason}`,
      detail: `Waarom: ${rule.reason} Bewijs: ${sourceTransactionCount} relevante ${sourceTransactionCount === 1 ? "aankoop" : "aankopen"} binnen deze winkel. Dit opent alleen een catalogusfilter; er wordt niets aan het winkelmandje toegevoegd.`,
      expiresAt: Number.isFinite(validUntil) ? validUntil : undefined,
      reason: rule.reason,
      action: {
        kind: "catalog",
        label: targets.length === 1 ? "Bekijk artikel" : `Bekijk ${targets.length} artikelen`,
        productIds: targets.map((product) => product.id),
        filterLabel: rule.name,
      },
      evidence: sourceLines.map(({ sale, item }) => ({
        transactionId: sale.id,
        lineId: item.lineId,
        productId: item.product.id,
        brand: item.product.brand,
        categoryId: item.product.category,
        ruleId: rule.id,
      })),
    });
  }

  return insights.sort((left, right) => right.priority - left.priority || left.id.localeCompare(right.id));
};
