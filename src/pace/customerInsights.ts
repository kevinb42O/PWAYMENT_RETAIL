import type {
  CommercialReturnPolicy,
  CustomerInsightSettings,
} from "../data/merchant";
import type { Product, Transaction } from "../types";

export type CustomerInsightKind = "return-window" | "brand-affinity";

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
  }[];
}

interface BuildCustomerInsightsInput {
  customerId: string;
  transactions: Transaction[];
  products: Product[];
  policy?: CommercialReturnPolicy;
  settings?: CustomerInsightSettings;
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

  return insights.sort((left, right) => right.priority - left.priority || left.id.localeCompare(right.id));
};
