import { MAX_CASH_PAYMENT_CENTS } from "./cashRounding";

const COMMON_TENDER_AMOUNTS_CENTS = [
  500, 1_000, 2_000, 5_000, 10_000, 20_000, 50_000, 100_000, 200_000, 300_000,
];

export const formatCashEntry = (cents: number): string =>
  `${Math.floor(Math.max(0, cents) / 100)},${String(Math.max(0, cents) % 100).padStart(2, "0")}`;

export const sanitizeCashEntry = (value: string): string => {
  const normalized = value
    .replace(/[\s\u00a0\u202f]/g, "")
    .replace(/€|EUR/gi, "")
    .replace(/\./g, ",")
    .replace(/[^\d,]/g, "");
  const commaAt = normalized.indexOf(",");
  const integerPart = (commaAt < 0 ? normalized : normalized.slice(0, commaAt)).slice(0, 7);
  if (commaAt < 0) return integerPart;
  const decimalPart = normalized.slice(commaAt + 1).replace(/,/g, "").slice(0, 2);
  return `${integerPart || "0"},${decimalPart}`;
};

export const cashEntryToCents = (value: string): number => {
  if (!value) return 0;
  const [integerPart = "0", decimalPart = ""] = value.split(",");
  return Number(integerPart || 0) * 100 + Number(`${decimalPart}00`.slice(0, 2));
};

export const cashQuickAmounts = (
  totalCents: number,
  limitCents = MAX_CASH_PAYMENT_CENTS,
): number[] => COMMON_TENDER_AMOUNTS_CENTS
  .filter((amount) => amount > totalCents && amount <= limitCents)
  .slice(0, 4);
