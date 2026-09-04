export interface PaceTodayItem {
  id: string;
  priority: number;
  title: string;
  detail: string;
  nextQuestion: string;
}

export interface PaceTodayBriefing {
  generatedAt: string | null;
  timezone: string | null;
  basis: string | null;
  items: PaceTodayItem[];
}

export interface PaceReplenishmentRow {
  id: string;
  name: string;
  variant: string | null;
  sku: string | null;
  stockQty: number;
  minStockQty: number | null;
}

export interface PaceReplenishmentProposal {
  productCount: number;
  quantityToMinimum: number;
  rows: PaceReplenishmentRow[];
}

export interface PaceTodayWebshopQueueRow {
  id: string;
  number: string;
  fulfillmentStatus: string;
  deliveryMode: string;
  totalCents: number;
  createdAt: string | null;
}

export interface PaceTodayServiceQueueRow {
  id: string;
  number: string;
  assetType: string;
  route: string;
  substatus: string;
  updatedAt: string | null;
}

export interface PaceTodayOperationalQueues {
  basis: string | null;
  webshopOrders: PaceTodayWebshopQueueRow[];
  blockedServiceOrders: PaceTodayServiceQueueRow[];
}

export interface PaceCustomerRadarRow {
  kind: string;
  id: string;
  name: string;
  title: string;
  detail: string;
  visits: number;
  totalSpendCents: number;
  daysSinceVisit: number | null;
  nextQuestion: string;
  priority: number;
}

export interface PaceMarginWatchRow {
  kind: string;
  id: string;
  name: string;
  title: string;
  detail: string;
  amountCents: number;
  ratioPercent: number | null;
  nextQuestion: string;
  priority: number;
}

export interface PaceCustomerMarginWatch {
  basis: string | null;
  customerAttributionPercent: number | null;
  costCoveragePercent: number | null;
  marginReady: boolean;
  customerSignals: PaceCustomerRadarRow[];
  marginSignals: PaceMarginWatchRow[];
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;

const asText = (value: unknown): string | null => typeof value === "string" && value.trim() ? value.trim() : null;
const asNumber = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) ? value : null;

export const parsePaceTodayBriefing = (value: unknown): PaceTodayBriefing | null => {
  const root = asRecord(value);
  if (!root || !Array.isArray(root.items)) return null;
  const items = root.items.flatMap((raw) => {
    const item = asRecord(raw);
    const id = item && asText(item.id);
    const title = item && asText(item.title);
    if (!item || !id || !title) return [];
    return [{
      id,
      priority: asNumber(item.priority) ?? 99,
      title,
      detail: asText(item.detail) ?? "Controleer dit aandachtspunt in de winkelgegevens.",
      nextQuestion: asText(item.nextQuestion) ?? "",
    }];
  }).sort((a, b) => a.priority - b.priority || a.title.localeCompare(b.title, "nl"));
  return {
    generatedAt: asText(root.generatedAt),
    timezone: asText(root.timezone),
    basis: asText(root.basis),
    items,
  };
};

export const parsePaceReplenishmentRows = (value: unknown): PaceReplenishmentRow[] => {
  const root = asRecord(value);
  if (!root || !Array.isArray(root.rows)) return [];
  return root.rows.flatMap((raw) => {
    const row = asRecord(raw);
    const id = row && asText(row.id);
    const name = row && asText(row.name);
    const stockQty = row && asNumber(row.stockQty);
    if (!row || !id || !name || stockQty === null) return [];
    return [{
      id,
      name,
      variant: asText(row.variant),
      sku: asText(row.sku),
      stockQty,
      minStockQty: asNumber(row.minStockQty),
    }];
  });
};

export const emptyPaceTodayOperationalQueues = (): PaceTodayOperationalQueues => ({ basis: null, webshopOrders: [], blockedServiceOrders: [] });

export const parsePaceTodayOperationalQueues = (value: unknown): PaceTodayOperationalQueues => {
  const root = asRecord(value);
  if (!root) return emptyPaceTodayOperationalQueues();
  const webshopOrders = Array.isArray(root.webshopOrders) ? root.webshopOrders.flatMap((raw) => {
    const row = asRecord(raw);
    const id = row && asText(row.id);
    const number = row && asText(row.number);
    const totalCents = row && asNumber(row.totalCents);
    if (!row || !id || !number || totalCents === null) return [];
    return [{ id, number, totalCents, fulfillmentStatus: asText(row.fulfillmentStatus) ?? "", deliveryMode: asText(row.deliveryMode) ?? "", createdAt: asText(row.createdAt) }];
  }) : [];
  const blockedServiceOrders = Array.isArray(root.blockedServiceOrders) ? root.blockedServiceOrders.flatMap((raw) => {
    const row = asRecord(raw);
    const id = row && asText(row.id);
    const number = row && asText(row.number);
    const assetType = row && asText(row.assetType);
    if (!row || !id || !number || !assetType) return [];
    return [{ id, number, assetType, route: asText(row.route) ?? "", substatus: asText(row.substatus) ?? "", updatedAt: asText(row.updatedAt) }];
  }) : [];
  return { basis: asText(root.basis), webshopOrders, blockedServiceOrders };
};

export const emptyPaceCustomerMarginWatch = (): PaceCustomerMarginWatch => ({
  basis: null,
  customerAttributionPercent: null,
  costCoveragePercent: null,
  marginReady: false,
  customerSignals: [],
  marginSignals: [],
});

export const parsePaceCustomerMarginWatch = (value: unknown): PaceCustomerMarginWatch => {
  const root = asRecord(value);
  if (!root) return emptyPaceCustomerMarginWatch();
  const quality = asRecord(root.dataQuality);
  const customerSignals = Array.isArray(root.customerSignals) ? root.customerSignals.flatMap((raw) => {
    const row = asRecord(raw);
    const kind = row && asText(row.kind);
    const id = row && asText(row.id);
    const name = row && asText(row.name);
    const title = row && asText(row.title);
    const detail = row && asText(row.detail);
    const visits = row && asNumber(row.visits);
    const totalSpendCents = row && asNumber(row.totalSpendCents);
    if (!row || !kind || !id || !name || !title || !detail || visits === null || totalSpendCents === null) return [];
    return [{
      kind, id, name, title, detail, visits, totalSpendCents,
      daysSinceVisit: asNumber(row.daysSinceVisit),
      nextQuestion: asText(row.nextQuestion) ?? "",
      priority: asNumber(row.priority) ?? 99,
    }];
  }) : [];
  const marginSignals = Array.isArray(root.marginSignals) ? root.marginSignals.flatMap((raw) => {
    const row = asRecord(raw);
    const kind = row && asText(row.kind);
    const id = row && asText(row.id);
    const name = row && asText(row.name);
    const title = row && asText(row.title);
    const detail = row && asText(row.detail);
    const amountCents = row && asNumber(row.amountCents);
    if (!row || !kind || !id || !name || !title || !detail || amountCents === null) return [];
    return [{
      kind, id, name, title, detail, amountCents,
      ratioPercent: asNumber(row.ratioPercent),
      nextQuestion: asText(row.nextQuestion) ?? "",
      priority: asNumber(row.priority) ?? 99,
    }];
  }) : [];
  return {
    basis: asText(root.basis),
    customerAttributionPercent: quality && asNumber(quality.customerAttributionPercent),
    costCoveragePercent: quality && asNumber(quality.costCoveragePercent),
    marginReady: quality?.marginReady === true,
    customerSignals: customerSignals.sort((a, b) => a.priority - b.priority || b.totalSpendCents - a.totalSpendCents || a.name.localeCompare(b.name, "nl")),
    marginSignals: marginSignals.sort((a, b) => a.priority - b.priority || b.amountCents - a.amountCents || a.name.localeCompare(b.name, "nl")),
  };
};

/**
 * A transparent calculation, not an order quantity. It merely shows how many
 * units are needed to get back to each merchant-defined minimum level.
 */
export const buildPaceReplenishmentProposal = (rows: PaceReplenishmentRow[]): PaceReplenishmentProposal | null => {
  const eligibleRows = rows.filter((row) => row.minStockQty !== null && row.stockQty <= row.minStockQty);
  if (eligibleRows.length === 0) return null;
  return {
    productCount: eligibleRows.length,
    quantityToMinimum: eligibleRows.reduce((total, row) => total + Math.max(0, (row.minStockQty ?? 0) - row.stockQty), 0),
    rows: eligibleRows,
  };
};

export const paceTodaySignalId = (id: string) => `today:${id}`;
