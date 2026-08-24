import type {
  CommercialReturnPolicy,
  CustomerInsightSettings,
} from "../data/merchant";
import type { Product, Transaction } from "../types";

export type CustomerInsightKind = "return-window" | "brand-affinity" | "automatic-recommendation";

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
  evidenceSummary?: string;
}

export interface ServerPaceRecommendation {
  productId: string;
  pairSaleCount: number;
  confidence: number;
}

interface BuildCustomerInsightsInput {
  customerId: string;
  transactions: Transaction[];
  products: Product[];
  policy?: CommercialReturnPolicy;
  settings?: CustomerInsightSettings;
  now?: number;
  timezone?: string;
  serverRecommendations?: ServerPaceRecommendation[];
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
  now = Date.now(),
  timezone = "Europe/Brussels",
  serverRecommendations = [],
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
        if (salePolicy.excludedCategoryIds.includes(
          item.product.categorySnapshot?.rootId ?? item.product.category,
        )) continue;
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
      );
      if (available.length === 0) continue;
      insights.push({
        id: `brand:${customerId}:${brandKey}`,
        kind: "brand-affinity",
        priority: 55,
        tone: "flow",
        title: `Terugkerende interesse in ${bucket.label}`,
        compact: `${bucket.transactionIds.size} eerdere aankopen · ${available.length} ${available.length === 1 ? "artikel" : "artikelen"} van dit merk beschikbaar.`,
        detail: "Dit is een feitelijk aankooppatroon, geen voorspeld smaakprofiel. Gebruik het alleen wanneer het natuurlijk in het gesprek past.",
        evidence: bucket.evidence,
        action: {
          kind: "catalog",
          label: available.length === 1 ? "Bekijk artikel" : `Bekijk ${available.length} artikelen`,
          productIds: available.map((product) => product.id),
          filterLabel: `Merkinteresse · ${bucket.label}`,
        },
      });
    }
  }

  const recommendationCutoff = now - settings.brandLookbackDays * 86_400_000;
  const globalReturned = returnedByOriginalLine(transactions);
  const allSales = transactions.filter((row) =>
    (row.kind ?? "sale") === "sale"
    && row.isFinalized === 1
    && row.source !== "demo"
    && row.timestamp >= recommendationCutoff
    && row.id != null,
  );
  const purchasedProductIds = new Set(sales.flatMap((sale) => sale.timestamp < recommendationCutoff
    ? []
    : sale.items.flatMap((item) => item.quantity - (returned.get(`${sale.id}:${item.lineId}`) ?? 0) > 0 ? [item.product.id] : [])));
  const availableProducts = products.filter(
    (product) => product.isActive !== false && (product.stockQty == null || product.stockQty > 0),
  );
  const availableById = new Map(availableProducts.map((product) => [product.id, product]));
  const affinities = new Map<string, { sourceId: string; pairCount: number; sourceCount: number; transactionIds: Set<number> }>();
  for (const sourceId of purchasedProductIds) {
    let sourceCount = 0;
    const candidateCounts = new Map<string, { pairCount: number; transactionIds: Set<number> }>();
    for (const sale of allSales) {
      const saleProductIds = new Set(sale.items.flatMap((item) => item.quantity - (globalReturned.get(`${sale.id}:${item.lineId}`) ?? 0) > 0 ? [item.product.id] : []));
      if (!saleProductIds.has(sourceId)) continue;
      sourceCount += 1;
      for (const candidateId of saleProductIds) {
        if (candidateId === sourceId || purchasedProductIds.has(candidateId) || !availableById.has(candidateId)) continue;
        const candidate = candidateCounts.get(candidateId) ?? { pairCount: 0, transactionIds: new Set<number>() };
        candidate.pairCount += 1;
        if (sale.id != null) candidate.transactionIds.add(sale.id);
        candidateCounts.set(candidateId, candidate);
      }
    }
    for (const [candidateId, candidate] of candidateCounts) {
      const current = affinities.get(candidateId);
      if (!current || candidate.pairCount / Math.max(1, sourceCount) > current.pairCount / Math.max(1, current.sourceCount)) {
        affinities.set(candidateId, { sourceId, pairCount: candidate.pairCount, sourceCount, transactionIds: candidate.transactionIds });
      }
    }
  }

  const minimumSupport = allSales.length >= 20 ? 2 : 1;
  const ranked = [...affinities.entries()]
    .filter(([, affinity]) => affinity.pairCount >= minimumSupport)
    .sort(([, left], [, right]) => (right.pairCount / Math.max(1, right.sourceCount)) - (left.pairCount / Math.max(1, left.sourceCount)) || right.pairCount - left.pairCount)
    .slice(0, 4);
  const uniqueServerRecommendations = [...serverRecommendations.reduce((recommendations, recommendation) => {
    const current = recommendations.get(recommendation.productId);
    if (!current || recommendation.confidence > current.confidence || (recommendation.confidence === current.confidence && recommendation.pairSaleCount > current.pairSaleCount)) {
      recommendations.set(recommendation.productId, recommendation);
    }
    return recommendations;
  }, new Map<string, ServerPaceRecommendation>()).values()];
  const serverTargets = uniqueServerRecommendations
    .map((recommendation) => ({ recommendation, product: availableById.get(recommendation.productId) }))
    .filter((entry): entry is { recommendation: ServerPaceRecommendation; product: Product } => Boolean(entry.product))
    .slice(0, 4);
  if (serverTargets.length > 0) {
    const strongest = serverTargets[0].recommendation;
    const targets = serverTargets.map((entry) => entry.product);
    insights.push({
      id: `automatic-server:${customerId}:${targets.map((product) => product.id).join(",")}`,
      kind: "automatic-recommendation",
      priority: Math.min(79, 58 + Math.round(strongest.confidence * 20)),
      tone: "flow",
      title: "Past bij eerdere aankopen",
      compact: `${targets.length} ${targets.length === 1 ? "artikel" : "artikelen"} beschikbaar · automatisch geleerd uit winkelbrede aankoopcombinaties.`,
      detail: `Pace vond dit zelf in ${strongest.pairSaleCount} relevante ${strongest.pairSaleCount === 1 ? "verkoop" : "verkopen"} binnen deze winkel. De centrale score wordt bij iedere nieuwe verkoop incrementeel bijgewerkt. Er wordt niets aan het winkelmandje toegevoegd.`,
      reason: "Automatisch afgeleid uit aankoopcombinaties en actuele voorraad.",
      evidenceSummary: `${strongest.pairSaleCount} relevante ${strongest.pairSaleCount === 1 ? "verkoop" : "verkopen"} · automatisch geleerd`,
      action: { kind: "catalog", label: targets.length === 1 ? "Bekijk artikel" : `Bekijk ${targets.length} artikelen`, productIds: targets.map((product) => product.id), filterLabel: "Pace · automatisch passend" },
      evidence: [],
    });
  } else if (ranked.length > 0) {
    const strongest = ranked[0][1];
    const source = products.find((product) => product.id === strongest.sourceId);
    const confidence = strongest.pairCount / Math.max(1, strongest.sourceCount);
    const targets = ranked.map(([productId]) => availableById.get(productId)!).filter(Boolean);
    insights.push({
      id: `automatic:${customerId}:${strongest.sourceId}:${targets.map((product) => product.id).join(",")}`,
      kind: "automatic-recommendation",
      priority: Math.min(79, 58 + Math.round(confidence * 20)),
      tone: "flow",
      title: source ? `Vaak samen gekozen met ${source.name}` : "Past bij eerdere aankopen",
      compact: `${targets.length} ${targets.length === 1 ? "artikel" : "artikelen"} beschikbaar · automatisch gevonden in echte aankoopcombinaties.`,
      detail: `Pace vond dit zelf in ${strongest.pairCount} relevante ${strongest.pairCount === 1 ? "verkoop" : "verkopen"} binnen deze winkel. De score wordt automatisch sterker of zwakker naarmate nieuwe verkopen binnenkomen. Er wordt niets aan het winkelmandje toegevoegd.`,
      reason: "Automatisch afgeleid uit aankoopcombinaties en actuele voorraad.",
      evidenceSummary: `${strongest.pairCount} relevante ${strongest.pairCount === 1 ? "verkoop" : "verkopen"} · automatisch geleerd`,
      action: {
        kind: "catalog",
        label: targets.length === 1 ? "Bekijk artikel" : `Bekijk ${targets.length} artikelen`,
        productIds: targets.map((product) => product.id),
        filterLabel: "Pace · automatisch passend",
      },
      evidence: [...strongest.transactionIds].map((transactionId) => ({ transactionId, productId: strongest.sourceId })),
    });
  }

  return insights.sort((left, right) => right.priority - left.priority || left.id.localeCompare(right.id));
};
