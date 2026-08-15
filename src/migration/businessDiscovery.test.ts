import { describe, expect, it } from "vitest";
import type { ParsedImportFile } from "../utils/integrationImport";
import { discoverRetailBusiness } from "./businessDiscovery";
import { compileRetailConfiguration } from "./configurationCompiler";

const parse = (headers: string[], rows: string[][]): ParsedImportFile => ({
  format: "csv",
  headers,
  rows,
});

describe("retail business discovery", () => {
  it("proposes a telecom repair setup from legacy service-export evidence", () => {
    const report = discoverRetailBusiness(parse(
      ["Artikelcode", "Productnaam", "IMEI", "Herstelstatus", "Garantie einddatum", "Voorschot", "Prijs B2B", "Voorraad", "BTW"],
      [["TEL-1", "Schermherstel", "356123456789012", "In behandeling", "2027-01-01", "50,00", "79,00", "4", "21"]],
    ), "legacy-repairs.csv");
    const proposal = compileRetailConfiguration(report);

    expect(report.industry).toMatchObject({ value: "telecom-it", confidence: "high" });
    expect(report.capabilityPacks.map((pack) => pack.id)).toEqual(expect.arrayContaining(["core-catalog", "service-desk", "customer-pricing"]));
    expect(proposal.modules.service).toMatchObject({ value: true, status: "proposed" });
    expect(proposal.modules.customers).toMatchObject({ value: true });
    expect(proposal.nodes.find((node) => node.key === "inventory.tracking")).toMatchObject({ value: true });
    expect(proposal.questions.map((question) => question.id)).toContain("question:stock-location");
  });

  it("keeps tax and business-profile ambiguity as an explicit decision", () => {
    const report = discoverRetailBusiness(parse(
      ["Naam", "Verkoopprijs", "Voorraad"],
      [["Board", "99,00", "8"]],
    ), "catalogus.csv");
    const proposal = compileRetailConfiguration(report);

    expect(report.industry).toMatchObject({ value: "general-retail", confidence: "low" });
    expect(proposal.questions.map((question) => question.id)).toEqual(expect.arrayContaining(["question:tax", "question:industry", "question:stock-location"]));
    expect(proposal.readinessChecks.find((check) => check.id === "readiness.configuration")).toMatchObject({ status: "needs-decision" });
  });

  it("makes schema fingerprints stable across equivalent header order", () => {
    const first = discoverRetailBusiness(parse(["Naam", "SKU", "Voorraad"], [["Deck", "A1", "2"]]), "first.csv");
    const second = discoverRetailBusiness(parse(["Voorraad", "SKU", "Naam"], [["2", "A1", "Deck"]]), "second.csv");

    expect(first.sourceFingerprint).toBe(second.sourceFingerprint);
  });
});
