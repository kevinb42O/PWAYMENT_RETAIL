import { describe, expect, it } from "vitest";
import type { DailyReport } from "../types";
import { vatBreakdownForReport } from "./vatReport";

const legacyReport = {
  totalVat12Cents: 120,
  totalVat21Cents: 210,
  totalExclVat12Cents: 1_000,
  totalExclVat21Cents: 1_000,
} as Pick<
  DailyReport,
  | "totalVat12Cents"
  | "totalVat21Cents"
  | "totalExclVat12Cents"
  | "totalExclVat21Cents"
  | "totalVatBreakdown"
>;

describe("vatBreakdownForReport", () => {
  it("projects historic 12/21 reports without changing their totals", () => {
    expect(vatBreakdownForReport(legacyReport)).toEqual([
      { rate: 12, grossCents: 1_120, exclCents: 1_000, vatCents: 120 },
      { rate: 21, grossCents: 1_210, exclCents: 1_000, vatCents: 210 },
    ]);
  });

  it("uses generic retail rates when the persisted breakdown is valid", () => {
    expect(vatBreakdownForReport({
      ...legacyReport,
      totalVatBreakdown: [
        { rate: 21, grossCents: 121, exclCents: 100, vatCents: 21 },
        { rate: 0, grossCents: 100, exclCents: 100, vatCents: 0 },
        { rate: 6, grossCents: 106, exclCents: 100, vatCents: 6 },
      ],
    })).toEqual([
      { rate: 0, grossCents: 100, exclCents: 100, vatCents: 0 },
      { rate: 6, grossCents: 106, exclCents: 100, vatCents: 6 },
      { rate: 21, grossCents: 121, exclCents: 100, vatCents: 21 },
    ]);
  });

  it("falls back to legacy columns when the stored data is malformed", () => {
    expect(vatBreakdownForReport({
      ...legacyReport,
      totalVatBreakdown: [{ rate: 6, grossCents: 105, exclCents: 100, vatCents: 6 }],
    })).toEqual(vatBreakdownForReport(legacyReport));
  });

  it("never silently drops a malformed rate line from an otherwise valid snapshot", () => {
    expect(vatBreakdownForReport({
      ...legacyReport,
      totalVatBreakdown: [
        { rate: 6, grossCents: 106, exclCents: 100, vatCents: 6 },
        { rate: 21, grossCents: 121, exclCents: 100, vatCents: 20 },
      ],
    })).toEqual(vatBreakdownForReport(legacyReport));
  });
});
