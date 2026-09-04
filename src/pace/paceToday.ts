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
