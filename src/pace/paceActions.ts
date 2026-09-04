export interface PaceReplenishmentActionResult {
  createdOrderIds: string[];
  createdOrderCount: number;
  createdItemCount: number;
  skippedCount: number;
  message: string;
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;

const safeCount = (value: unknown) => typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : 0;

export const parsePaceReplenishmentActionResult = (value: unknown): PaceReplenishmentActionResult | null => {
  const record = asRecord(value);
  if (!record || typeof record.message !== "string") return null;
  const createdOrderIds = Array.isArray(record.createdOrderIds)
    ? record.createdOrderIds.filter((id): id is string => typeof id === "string" && id.length > 0).slice(0, 25)
    : [];
  const skippedCount = Array.isArray(record.skipped) ? record.skipped.length : 0;
  const createdOrderCount = safeCount(record.createdOrderCount);
  if (createdOrderCount !== createdOrderIds.length) return null;
  return {
    createdOrderIds,
    createdOrderCount,
    createdItemCount: safeCount(record.createdItemCount),
    skippedCount,
    message: record.message.trim() || "De Pace-actie is afgerond.",
  };
};
