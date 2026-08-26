import { describe, expect, it } from "vitest";
import { buildPaceEvidence, publicCitations, redactPaceSummary } from "./evidence";

describe("PACE evidence normalization", () => {
  it("builds stable, bounded evidence and public citations", () => {
    const input = [{
      sourceKind: "aggregate" as const,
      sourceName: "analytics.query",
      label: "Omzetanalyse",
      freshness: "period" as const,
      context: { generatedAt: "2026-08-26T12:00:00Z", basis: "finalized transactions", period: { start: "2026-08-01", endExclusive: "2026-09-01" }, rows: [{ revenueCents: 12345 }] },
    }];
    const first = buildPaceEvidence(input);
    const second = buildPaceEvidence(input);
    expect(first).toHaveLength(1);
    expect(first[0].digest).toBe(second[0].digest);
    expect(first[0].digest).toMatch(/^[0-9a-f]{64}$/);
    expect(publicCitations(first)).toEqual([expect.objectContaining({ key: "E1", label: "Omzetanalyse", freshness: "period" })]);
  });

  it("drops unavailable contexts", () => {
    expect(buildPaceEvidence([{ sourceKind: "record", sourceName: "records.lookup", label: "Records", context: { unavailable: true } }])).toEqual([]);
  });

  it("removes direct contact data from evidence and summaries", () => {
    const evidence = buildPaceEvidence([{ sourceKind: "record", sourceName: "records.lookup", label: "Klant", context: {
      name: "Jan", email: "jan@example.com", phone: "+32 470 12 34 56", notes: "privé",
    } }]);
    expect(JSON.stringify(evidence[0].facts)).toContain("Jan");
    expect(JSON.stringify(evidence[0].facts)).not.toContain("jan@example.com");
    expect(redactPaceSummary("Contact jan@example.com via +32 470 12 34 56")).toBe("Contact [e-mail verwijderd] via [telefoon verwijderd]");
  });
});
