import type { FinancialCost, Transaction } from "../types";
import { transactionCommerceFinancials } from "./financial";

export const FINANCIAL_COST_CATEGORIES = [
  { key: "premises", label: "Pand & huur" },
  { key: "utilities", label: "Nutsvoorzieningen" },
  { key: "personnel", label: "Personeel" },
  { key: "payments", label: "Verkoop & betalingen" },
  { key: "inventory", label: "Voorraadgerelateerd" },
  { key: "marketing", label: "Marketing" },
  { key: "administration", label: "Administratie & advies" },
  { key: "insurance", label: "Verzekeringen" },
  { key: "financing", label: "Financiering" },
  { key: "taxes", label: "Belastingen & heffingen" },
  { key: "investments", label: "Investeringen & afschrijving" },
  { key: "owner", label: "Eigenaarsvergoedingen" },
  { key: "other", label: "Andere kosten" },
] as const;

export const financialCategoryLabel = (cost: Pick<FinancialCost, "category" | "customCategory">) =>
  cost.customCategory?.trim() ||
  FINANCIAL_COST_CATEGORIES.find((category) => category.key === cost.category)?.label ||
  "Andere kosten";

const DAY_MS = 86_400_000;

const dateParts = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const timestamp = Date.UTC(year, month - 1, day);
  const date = new Date(timestamp);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) return null;
  return { year, month, day, timestamp };
};

const daysInMonth = (year: number, month: number) =>
  new Date(Date.UTC(year, month, 0)).getUTCDate();

const addMonths = (timestamp: number, months: number, anchorDay: number) => {
  const date = new Date(timestamp);
  const monthIndex = date.getUTCMonth() + months;
  const year = date.getUTCFullYear() + Math.floor(monthIndex / 12);
  const month = ((monthIndex % 12) + 12) % 12;
  return Date.UTC(year, month, Math.min(anchorDay, daysInMonth(year, month + 1)));
};

export const financialCostAmountExVatCents = (cost: FinancialCost): number => {
  if (cost.vatRate === 0) return cost.amountCents;
  if (cost.amountMode === "excluding-vat") return cost.amountCents;
  return Math.round(cost.amountCents / (1 + cost.vatRate / 100));
};

export const financialCostVatCents = (cost: FinancialCost): number => {
  const excluding = financialCostAmountExVatCents(cost);
  return cost.amountMode === "including-vat"
    ? cost.amountCents - excluding
    : Math.round((excluding * cost.vatRate) / 100);
};

/** Cost that actually burdens the result: net amount plus non-recoverable VAT. */
export const financialManagementCostCents = (cost: FinancialCost): number => {
  const vat = financialCostVatCents(cost);
  const recoverable = Math.round((vat * cost.vatRecoverablePercent) / 100);
  return financialCostAmountExVatCents(cost) + vat - recoverable;
};

const recurrenceMonths = (cost: FinancialCost) =>
  cost.frequency === "monthly" ? 1 : cost.frequency === "quarterly" ? 3 : 12;

/** Allocate a recurring accrual over a half-open timestamp range. */
export const allocateFinancialCostCents = (
  cost: FinancialCost,
  rangeStart: number,
  rangeEndExclusive: number,
): number => {
  if (rangeEndExclusive <= rangeStart) return 0;
  const start = dateParts(cost.startDate);
  if (!start) return 0;
  const fullAmount = financialManagementCostCents(cost);
  if (cost.frequency === "once" || cost.kind === "one-off") {
    const archivedAt = cost.status === "archived"
      ? dateParts(cost.updatedAt.slice(0, 10))?.timestamp
      : undefined;
    if (archivedAt != null && start.timestamp > archivedAt) return 0;
    return start.timestamp >= rangeStart && start.timestamp < rangeEndExclusive
      ? fullAmount
      : 0;
  }

  const endInclusive = cost.endDate ? dateParts(cost.endDate)?.timestamp : undefined;
  const archivedInclusive = cost.status === "archived"
    ? dateParts(cost.updatedAt.slice(0, 10))?.timestamp
    : undefined;
  const activeEnd = Math.min(
    endInclusive == null ? Number.POSITIVE_INFINITY : endInclusive + DAY_MS,
    archivedInclusive == null ? Number.POSITIVE_INFINITY : archivedInclusive + DAY_MS,
  );
  if (start.timestamp >= rangeEndExclusive || activeEnd <= rangeStart) return 0;

  const intervalMonths = recurrenceMonths(cost);
  let intervalStart = start.timestamp;
  let intervalEnd = addMonths(intervalStart, intervalMonths, start.day);
  while (intervalEnd <= rangeStart && intervalEnd < activeEnd) {
    intervalStart = intervalEnd;
    intervalEnd = addMonths(intervalStart, intervalMonths, start.day);
  }

  let total = 0;
  while (intervalStart < rangeEndExclusive && intervalStart < activeEnd) {
    const effectiveEnd = Math.min(intervalEnd, activeEnd);
    const overlapStart = Math.max(intervalStart, rangeStart);
    const overlapEnd = Math.min(effectiveEnd, rangeEndExclusive);
    if (overlapEnd > overlapStart) {
      const intervalDays = Math.max(1, Math.round((intervalEnd - intervalStart) / DAY_MS));
      const overlapDays = Math.round((overlapEnd - overlapStart) / DAY_MS);
      total += Math.round((fullAmount * overlapDays) / intervalDays);
    }
    intervalStart = intervalEnd;
    intervalEnd = addMonths(intervalStart, intervalMonths, start.day);
  }
  return total;
};

export interface ProfitabilitySnapshot {
  grossRevenueCents: number;
  vatCents: number;
  netRevenueCents: number;
  costOfGoodsCents: number;
  grossProfitCents: number;
  operatingCostsCents: number;
  fixedCostsCents: number;
  variableCostsCents: number;
  operatingResultCents: number;
  grossMarginPercent: number | null;
  operatingMarginPercent: number | null;
  contributionMarginPercent: number | null;
  breakEvenRevenueCents: number | null;
  breakEvenGapCents: number | null;
  transactionCount: number;
  completeCostTransactions: number;
  categoryCosts: Array<{ key: string; label: string; valueCents: number }>;
}

export const buildProfitabilitySnapshot = ({
  transactions,
  costs,
  rangeStart,
  rangeEnd,
}: {
  transactions: Transaction[];
  costs: FinancialCost[];
  rangeStart: number;
  /** Inclusive UI timestamp. */
  rangeEnd: number;
}): ProfitabilitySnapshot => {
  const finalized = transactions.filter(
    (transaction) =>
      transaction.isFinalized === 1 &&
      transaction.timestamp >= rangeStart &&
      transaction.timestamp <= rangeEnd,
  );
  const transactionRows = finalized.map(transactionCommerceFinancials);
  const rangeEndExclusive = rangeEnd + 1;
  const allocated = costs.map((cost) => ({
    cost,
    valueCents: allocateFinancialCostCents(cost, rangeStart, rangeEndExclusive),
  }));
  const byCategory = new Map<string, { label: string; valueCents: number }>();
  for (const row of allocated) {
    const label = financialCategoryLabel(row.cost);
    const key = row.cost.customCategory?.trim()
      ? `custom:${row.cost.customCategory.trim().toLocaleLowerCase("nl-BE")}`
      : row.cost.category;
    const current = byCategory.get(key) ?? { label, valueCents: 0 };
    current.valueCents += row.valueCents;
    byCategory.set(key, current);
  }

  const grossRevenueCents = transactionRows.reduce((sum, row) => sum + row.grossRevenueCents, 0);
  const vatCents = transactionRows.reduce((sum, row) => sum + row.vatCents, 0);
  const netRevenueCents = transactionRows.reduce((sum, row) => sum + row.netRevenueExVatCents, 0);
  const costOfGoodsCents = transactionRows.reduce((sum, row) => sum + row.costOfGoodsCents, 0);
  const grossProfitCents = netRevenueCents - costOfGoodsCents;
  const fixedCostsCents = allocated
    .filter((row) => row.cost.behavior === "fixed")
    .reduce((sum, row) => sum + row.valueCents, 0);
  const variableCostsCents = allocated
    .filter((row) => row.cost.behavior === "variable")
    .reduce((sum, row) => sum + row.valueCents, 0);
  const operatingCostsCents = fixedCostsCents + variableCostsCents;
  const contributionCents = grossProfitCents - variableCostsCents;
  const contributionMarginPercent = netRevenueCents > 0
    ? (contributionCents / netRevenueCents) * 100
    : null;
  const breakEvenRevenueCents =
    contributionMarginPercent != null && contributionMarginPercent > 0
      ? Math.round(fixedCostsCents / (contributionMarginPercent / 100))
      : null;

  return {
    grossRevenueCents,
    vatCents,
    netRevenueCents,
    costOfGoodsCents,
    grossProfitCents,
    operatingCostsCents,
    fixedCostsCents,
    variableCostsCents,
    operatingResultCents: grossProfitCents - operatingCostsCents,
    grossMarginPercent: netRevenueCents > 0 ? (grossProfitCents / netRevenueCents) * 100 : null,
    operatingMarginPercent:
      netRevenueCents > 0
        ? ((grossProfitCents - operatingCostsCents) / netRevenueCents) * 100
        : null,
    contributionMarginPercent,
    breakEvenRevenueCents,
    breakEvenGapCents:
      breakEvenRevenueCents == null ? null : netRevenueCents - breakEvenRevenueCents,
    transactionCount: finalized.length,
    completeCostTransactions: transactionRows.filter((row) => row.completeCostPricing).length,
    categoryCosts: [...byCategory.entries()]
      .map(([key, row]) => ({ key, ...row }))
      .filter((row) => row.valueCents !== 0)
      .sort((left, right) => right.valueCents - left.valueCents),
  };
};

export interface MonthlyProfitabilityPoint extends ProfitabilitySnapshot {
  key: string;
  label: string;
  rangeStart: number;
  rangeEnd: number;
}

export const buildMonthlyProfitability = (
  transactions: Transaction[],
  costs: FinancialCost[],
  now = Date.now(),
  monthCount = 12,
): MonthlyProfitabilityPoint[] => {
  const anchor = new Date(now);
  return Array.from({ length: monthCount }, (_, index) => {
    const month = new Date(anchor.getFullYear(), anchor.getMonth() - (monthCount - 1 - index), 1);
    const rangeStart = month.getTime();
    const rangeEnd = Math.min(
      new Date(month.getFullYear(), month.getMonth() + 1, 1).getTime() - 1,
      now,
    );
    return {
      key: `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`,
      label: new Intl.DateTimeFormat("nl-BE", { month: "short" }).format(month).replace(".", ""),
      rangeStart,
      rangeEnd,
      ...buildProfitabilitySnapshot({ transactions, costs, rangeStart, rangeEnd }),
    };
  });
};
