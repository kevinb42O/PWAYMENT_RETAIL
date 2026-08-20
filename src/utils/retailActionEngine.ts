import {
  BusinessAction,
  InventoryForecastConfidence,
  InventoryForecastModel,
  InventoryForecastTrend,
  InventoryForecastUrgency,
  Product,
  ReorderActionItem,
  Transaction,
  WebshopOrder,
} from '../types';

const DAY_MS = 24 * 60 * 60 * 1000;

export const MISSING_SUPPLIER = 'Leverancier ontbreekt';

export interface InventoryForecastOptions {
  /** Maximum sales history considered by the model. */
  historyWindowDays?: number;
  /** Desired stock after a replenishment, excluding minimum/safety stock. */
  targetCoverDays?: number;
  /** How far ahead a row becomes an actionable recommendation. */
  actionHorizonDays?: number;
  /** Confirmed/reserved webshop demand available to the current client. */
  webshopOrders?: WebshopOrder[];
}

const normalizePositiveInteger = (value: number | undefined, fallback: number) =>
  Number.isFinite(value) && value! > 0 ? Math.round(value!) : fallback;

const forecastConfidence = (
  observedDays: number,
  soldUnits: number,
  activeSalesDays: number,
): InventoryForecastConfidence => {
  if (observedDays < 60 || soldUnits < 4 || activeSalesDays < 2) return 'low';
  if (observedDays < 180 || soldUnits < 12 || activeSalesDays < 6) return 'medium';
  return 'high';
};

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

const sumLast = (values: number[], days: number) =>
  values.slice(Math.max(0, values.length - days)).reduce((sum, value) => sum + value, 0);

const sumPreviousWindow = (values: number[], offsetDays: number, windowDays: number) => {
  const end = Math.max(0, values.length - offsetDays);
  const start = Math.max(0, end - windowDays);
  return values.slice(start, end).reduce((sum, value) => sum + value, 0);
};

/** Syntetos-Boylan corrected Croston forecast for intermittent retail demand. */
const crostonDailyRate = (dailySales: number[], alpha = 0.15) => {
  const firstSaleIndex = dailySales.findIndex((quantity) => quantity > 0);
  if (firstSaleIndex < 0) return 0;
  const activeDays = dailySales.filter((quantity) => quantity > 0).length;
  const total = dailySales.reduce((sum, quantity) => sum + quantity, 0);
  if (activeDays < 2) return total / Math.max(1, dailySales.length);

  let demandSize = dailySales[firstSaleIndex];
  let interval = Math.max(1, firstSaleIndex + 1);
  let elapsed = 1;
  for (let index = firstSaleIndex + 1; index < dailySales.length; index += 1) {
    const quantity = dailySales[index];
    if (quantity > 0) {
      demandSize += alpha * (quantity - demandSize);
      interval += alpha * (elapsed - interval);
      elapsed = 1;
    } else {
      elapsed += 1;
    }
  }
  return (1 - alpha / 2) * (demandSize / Math.max(1, interval));
};

const regularDemandRate = (
  rate30: number,
  rate90: number,
  longRate: number,
  observedDays: number,
) => {
  if (observedDays < 30) return longRate;
  if (observedDays < 90) return rate30 * 0.7 + longRate * 0.3;
  return rate30 * 0.55 + rate90 * 0.3 + longRate * 0.15;
};

const trendFromRates = (
  rate7: number,
  rate30: number,
  previous30Rate: number | null,
): { trend: InventoryForecastTrend; factor: number } => {
  const comparisonRate = previous30Rate != null && previous30Rate > 0
    ? previous30Rate
    : rate30 > 0 ? rate30 : null;
  const currentRate = previous30Rate != null && previous30Rate > 0 ? rate30 : rate7;
  if (comparisonRate == null || currentRate <= 0) {
    return rate30 > 0 ? { trend: 'falling', factor: 0.88 } : { trend: 'unknown', factor: 1 };
  }
  const ratio = currentRate / comparisonRate;
  if (ratio >= 1.25) return { trend: 'rising', factor: 1 + clamp(ratio - 1, 0, 0.5) * 0.25 };
  if (ratio <= 0.75) return { trend: 'falling', factor: 1 - clamp(1 - ratio, 0, 0.5) * 0.25 };
  return { trend: 'stable', factor: 1 };
};

const forecastUrgency = (
  currentStockQty: number,
  minStockQty: number,
  estimatedDaysCover: number | null,
  estimatedDaysUntilReorder: number | null,
  averageDailySales: number,
): InventoryForecastUrgency => {
  if (currentStockQty <= 0) return 'out';
  if (averageDailySales <= 0 || estimatedDaysCover == null) return 'no-sales';
  if (currentStockQty <= minStockQty || (estimatedDaysUntilReorder != null && estimatedDaysUntilReorder <= 7)) return 'critical';
  if (estimatedDaysUntilReorder != null && estimatedDaysUntilReorder <= 30) return 'soon';
  if (estimatedDaysUntilReorder != null && estimatedDaysUntilReorder <= 60) return 'watch';
  return 'healthy';
};

type DemandEvent = {
  productId: string;
  timestamp: number;
  quantity: number;
};

const saleLineKey = (transactionId: number, lineId: string) =>
  `${transactionId}:${lineId}`;

/**
 * Demand is based on net fulfilled sales, not on every positive transaction
 * line. A refund is linked to its original sale, so it reduces that sale's
 * quantity rather than becoming a second sale on the date of the return.
 */
const buildNetDemandEvents = (
  transactions: Transaction[],
  webshopOrders: WebshopOrder[],
  windowStart: number,
  now: number,
): DemandEvent[] => {
  const originalSalesById = new Map<number, Transaction>();
  for (const transaction of transactions) {
    if ((transaction.kind ?? 'sale') === 'sale' && transaction.id != null) {
      originalSalesById.set(transaction.id, transaction);
    }
  }

  const refundedByOriginalLine = new Map<string, number>();
  for (const transaction of transactions) {
    if (
      transaction.kind !== 'refund'
      || transaction.timestamp < windowStart
      || transaction.timestamp > now
      || transaction.originalTransactionId == null
    ) continue;
    const original = originalSalesById.get(transaction.originalTransactionId);
    if (!original || original.timestamp < windowStart || original.timestamp > now) continue;
    for (const line of transaction.items) {
      const key = saleLineKey(transaction.originalTransactionId, line.lineId);
      refundedByOriginalLine.set(
        key,
        (refundedByOriginalLine.get(key) ?? 0) + Math.max(0, line.quantity),
      );
    }
  }

  const events: DemandEvent[] = [];
  for (const transaction of transactions) {
    if (
      (transaction.kind ?? 'sale') !== 'sale'
      || transaction.timestamp < windowStart
      || transaction.timestamp > now
    ) continue;
    for (const line of transaction.items) {
      const refundedQuantity = transaction.id == null
        ? 0
        : refundedByOriginalLine.get(saleLineKey(transaction.id, line.lineId)) ?? 0;
      const quantity = Math.max(0, line.quantity - refundedQuantity);
      if (quantity > 0) {
        events.push({
          productId: line.product.id,
          timestamp: transaction.timestamp,
          quantity,
        });
      }
    }
  }

  for (const order of webshopOrders) {
    if (
      order.createdAt < windowStart
      || order.createdAt > now
      || order.status === 'cancelled'
      || order.inventoryStatus === 'released'
      || (order.inventoryStatus !== 'reserved' && order.inventoryStatus !== 'committed')
    ) continue;
    for (const line of order.lines) {
      if (line.quantity > 0) {
        events.push({
          productId: line.productId,
          timestamp: order.createdAt,
          quantity: line.quantity,
        });
      }
    }
  }
  return events;
};

/**
 * Build an explainable stock forecast for every active, stock-tracked product.
 *
 * The model deliberately stays explainable. It blends 30-, 90- and long-term
 * rates, adjusts regular sellers for recent trend, uses Croston/SBA for sparse
 * demand and adds a bounded same-season correction when at least a year of
 * history exists. Confidence remains visible so thin data never looks certain.
 */
export const buildInventoryForecast = (
  products: Product[],
  transactions: Transaction[],
  now = Date.now(),
  options: InventoryForecastOptions = {},
): ReorderActionItem[] => {
  const historyWindowDays = normalizePositiveInteger(options.historyWindowDays, 730);
  const targetCoverDays = normalizePositiveInteger(options.targetCoverDays, 30);
  const windowStart = now - historyWindowDays * DAY_MS;
  const demandEvents = buildNetDemandEvents(
    transactions,
    options.webshopOrders ?? [],
    windowStart,
    now,
  );
  const earliestObservedDemand = demandEvents.reduce<number | null>(
    (earliest, event) => earliest == null ? event.timestamp : Math.min(earliest, event.timestamp),
    null,
  );
  const observedDays = earliestObservedDemand == null
    ? 0
    : Math.min(historyWindowDays, Math.max(1, Math.ceil((now - earliestObservedDemand) / DAY_MS) + 1));
  const observationStart = observedDays === 0 ? now : now - (observedDays - 1) * DAY_MS;
  const eventsByProduct = new Map<string, Array<{ timestamp: number; quantity: number }>>();

  for (const event of demandEvents) {
    const events = eventsByProduct.get(event.productId) ?? [];
    events.push({ timestamp: event.timestamp, quantity: event.quantity });
    eventsByProduct.set(event.productId, events);
  }

  return products
    .filter((product) => product.isActive !== false && product.stockQty != null)
    .map((product) => {
      const currentStockQty = Math.max(0, product.stockQty ?? 0);
      const minStockQty = Math.max(0, product.minStockQty ?? 0);
      const events = eventsByProduct.get(product.id) ?? [];
      const dailySales = Array.from({ length: observedDays }, () => 0);
      for (const event of events) {
        const dayIndex = clamp(Math.floor((event.timestamp - observationStart) / DAY_MS), 0, Math.max(0, observedDays - 1));
        if (dailySales[dayIndex] != null) dailySales[dayIndex] += event.quantity;
      }
      const days7 = Math.min(7, observedDays);
      const days30 = Math.min(30, observedDays);
      const days90 = Math.min(90, observedDays);
      const soldLast7Days = sumLast(dailySales, 7);
      const soldLast30Days = sumLast(dailySales, 30);
      const soldLast90Days = sumLast(dailySales, 90);
      const soldAll = dailySales.reduce((sum, quantity) => sum + quantity, 0);
      const activeSalesDays = dailySales.filter((quantity) => quantity > 0).length;
      const activeSalesDays90 = dailySales.slice(Math.max(0, dailySales.length - 90)).filter((quantity) => quantity > 0).length;
      const rate7 = days7 > 0 ? soldLast7Days / days7 : 0;
      const rate30 = days30 > 0 ? soldLast30Days / days30 : 0;
      const rate90 = days90 > 0 ? soldLast90Days / days90 : 0;
      const longRate = observedDays > 0 ? soldAll / observedDays : 0;
      const previous30Days = Math.min(30, Math.max(0, observedDays - 30));
      const previous30Units = sumPreviousWindow(dailySales, 30, 30);
      const previous30Rate = previous30Days > 0 ? previous30Units / previous30Days : null;
      const intermittent = soldAll > 0 && days90 > 0 && activeSalesDays90 / days90 < 0.18;
      const trendResult = intermittent
        ? { trend: 'unknown' as const, factor: 1 }
        : trendFromRates(rate7, rate30, previous30Rate);
      let dailyRate = intermittent
        ? crostonDailyRate(dailySales) * 0.75 + longRate * 0.25
        : regularDemandRate(rate30, rate90, longRate, observedDays) * trendResult.factor;
      let forecastModel: InventoryForecastModel = observedDays < 14 || soldAll < 2
        ? 'insufficient'
        : intermittent ? 'intermittent' : 'recent-blend';

      const seasonalStart = now - 365 * DAY_MS;
      const seasonalEnd = seasonalStart + 30 * DAY_MS;
      const seasonalUnits = events
        .filter((event) => event.timestamp >= seasonalStart && event.timestamp < seasonalEnd)
        .reduce((sum, event) => sum + event.quantity, 0);
      const seasonalRate = seasonalUnits / 30;
      const rawSeasonalFactor = longRate > 0 ? seasonalRate / longRate : 1;
      const meaningfulSeasonalDifference = rawSeasonalFactor <= 0.75 || rawSeasonalFactor >= 1.25;
      if (
        observedDays >= 365
        && seasonalUnits >= 3
        && activeSalesDays >= 6
        && longRate > 0
        && meaningfulSeasonalDifference
      ) {
        const seasonalFactor = clamp(rawSeasonalFactor, 0.5, 1.5);
        dailyRate *= 0.7 + 0.3 * seasonalFactor;
        forecastModel = 'seasonal-blend';
      }

      const estimatedDaysCover = dailyRate > 0 ? currentStockQty / dailyRate : null;
      const daysUntilMinimum = dailyRate > 0
        ? Math.max(0, (currentStockQty - minStockQty) / dailyRate)
        : null;
      const estimatedStockoutAt = estimatedDaysCover == null
        ? null
        : now + estimatedDaysCover * DAY_MS;
      const estimatedReorderAt = daysUntilMinimum == null
        ? null
        : now + daysUntilMinimum * DAY_MS;
      const replenishmentQty = Math.ceil(dailyRate * targetCoverDays);
      // When the minimum will be reached later, propose the quantity that will
      // restore the target cover at that moment. If the product is already
      // below minimum, also repair the current safety-stock deficit.
      const suggestedQty = Math.max(
        0,
        replenishmentQty + Math.max(0, minStockQty - currentStockQty),
      );
      const confidence = forecastConfidence(observedDays, soldAll, activeSalesDays);

      return {
        productId: product.id,
        productName: product.name,
        supplier: product.supplier?.trim() || MISSING_SUPPLIER,
        currentStockQty,
        minStockQty,
        observedDays,
        activeSalesDays,
        soldLast7Days,
        soldLast30Days,
        soldLast90Days,
        averageDailySales: dailyRate,
        estimatedDaysCover,
        estimatedStockoutAt,
        estimatedReorderAt,
        estimatedDaysUntilReorder: daysUntilMinimum,
        confidence,
        forecastModel,
        trend: trendResult.trend,
        urgency: forecastUrgency(currentStockQty, minStockQty, estimatedDaysCover, daysUntilMinimum, dailyRate),
        targetCoverDays,
        suggestedQty,
        selectedQty: suggestedQty,
        unitCostCents: product.costPriceCents,
      } satisfies ReorderActionItem;
    })
    .sort((a, b) => {
      const urgencyRank: Record<InventoryForecastUrgency, number> = {
        out: 0,
        critical: 1,
        soon: 2,
        watch: 3,
        healthy: 4,
        'no-sales': 5,
      };
      const urgencyDifference = urgencyRank[a.urgency] - urgencyRank[b.urgency];
      if (urgencyDifference !== 0) return urgencyDifference;
      const aCover = a.estimatedDaysCover ?? Number.POSITIVE_INFINITY;
      const bCover = b.estimatedDaysCover ?? Number.POSITIVE_INFINITY;
      return aCover - bCover || b.soldLast30Days - a.soldLast30Days || a.productName.localeCompare(b.productName);
    });
};

/**
 * Return only rows that need attention within the configured horizon. This
 * prepares a proposal; the owner still chooses every quantity and no order is
 * transmitted from this function.
 */
export const buildReorderRecommendations = (
  products: Product[],
  transactions: Transaction[],
  now = Date.now(),
  options: InventoryForecastOptions = {},
): ReorderActionItem[] => {
  const actionHorizonDays = normalizePositiveInteger(options.actionHorizonDays, 60);
  return buildInventoryForecast(products, transactions, now, options).filter((row) => {
    if (row.currentStockQty <= row.minStockQty) return row.suggestedQty > 0;
    return row.suggestedQty > 0 && row.estimatedDaysUntilReorder != null && row.estimatedDaysUntilReorder <= actionHorizonDays;
  });
};

export interface InventoryDraftOptions {
  now?: number;
  ownerUserId?: string;
  ownerName?: string;
  idFactory?: () => string;
}

const defaultActionId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `inventory-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

const baselineFromTransactions = (transactions: Transaction[]): BusinessAction['baseline'] => {
  const revenueCents = transactions.reduce((sum, transaction) => sum + transaction.totalCents, 0);
  const costCents = transactions.reduce(
    (sum, transaction) => sum + transaction.items.reduce(
      (lineSum, item) => lineSum + (item.product.costPriceCents ?? 0) * item.quantity,
      0,
    ),
    0,
  );
  return {
    transactionCount: transactions.length,
    revenueCents,
    grossProfitCents: revenueCents - costCents,
  };
};

/**
 * Convert explicitly selected forecast rows into local draft actions, grouped
 * by supplier. This function has no side effects: it never sends a request,
 * mutates stock or writes to IndexedDB.
 */
export const buildInventoryDraftActions = (
  selectedRows: ReorderActionItem[],
  transactions: Transaction[],
  options: InventoryDraftOptions = {},
): BusinessAction[] => {
  const now = options.now ?? Date.now();
  const idFactory = options.idFactory ?? defaultActionId;
  const baseline = baselineFromTransactions(transactions);
  const bySupplier = new Map<string, ReorderActionItem[]>();

  for (const row of selectedRows) {
    if (row.selectedQty <= 0 || row.supplier === MISSING_SUPPLIER) continue;
    const supplierRows = bySupplier.get(row.supplier) ?? [];
    supplierRows.push({ ...row });
    bySupplier.set(row.supplier, supplierRows);
  }

  return [...bySupplier.entries()].map(([supplier, inventoryItems]) => ({
    id: idFactory(),
    type: 'inventory-reorder',
    status: 'draft',
    sourceSignalId: `inventory-forecast:${now}:${supplier}`,
    title: `Concept-inkooporder · ${supplier}`,
    description: `${inventoryItems.length} ${inventoryItems.length === 1 ? 'product' : 'producten'} geselecteerd op basis van voorraad en verkoopritme.`,
    createdAt: now,
    updatedAt: now,
    ownerUserId: options.ownerUserId,
    ownerName: options.ownerName,
    baseline,
    inventoryItems,
  } satisfies BusinessAction));
};
