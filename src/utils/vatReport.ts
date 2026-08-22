import type { DailyReport } from "../types";

export type VatReportLine = NonNullable<DailyReport["totalVatBreakdown"]>[number];

type VatReportSource = Pick<
  DailyReport,
  | "totalVat12Cents"
  | "totalVat21Cents"
  | "totalExclVat12Cents"
  | "totalExclVat21Cents"
  | "totalVatBreakdown"
>;

const isValidLine = (line: VatReportLine) =>
  [0, 6, 12, 21].includes(line.rate) &&
  [line.grossCents, line.exclCents, line.vatCents].every(Number.isSafeInteger) &&
  line.grossCents === line.exclCents + line.vatCents;

/**
 * Returns the complete, immutable VAT summary for a report. Pre-generic-VAT
 * reports are projected from their 12%/21% columns so historic reports stay
 * printable during the rollout.
 */
export const vatBreakdownForReport = (report: VatReportSource): VatReportLine[] => {
  const candidate = report.totalVatBreakdown ?? [];
  const stored = candidate.filter(isValidLine);
  const hasUniqueRates = new Set(stored.map((line) => line.rate)).size === stored.length;
  if (stored.length > 0 && stored.length === candidate.length && hasUniqueRates) {
    return [...stored].sort((left, right) => left.rate - right.rate);
  }

  return [
    {
      rate: 12 as const,
      grossCents: report.totalExclVat12Cents + report.totalVat12Cents,
      exclCents: report.totalExclVat12Cents,
      vatCents: report.totalVat12Cents,
    },
    {
      rate: 21 as const,
      grossCents: report.totalExclVat21Cents + report.totalVat21Cents,
      exclCents: report.totalExclVat21Cents,
      vatCents: report.totalVat21Cents,
    },
  ].filter((line) => line.grossCents !== 0 || line.vatCents !== 0);
};
