import { describe, expect, it } from "vitest";
import { createStoreConfigurationDraft } from "../onboarding/storeConfiguration";
import { assessCatalogCapabilityReadiness } from "./catalogCapabilityReadiness";

const parsed = (headers: string[], rows: string[][]) => ({
  format: "csv" as const,
  headers,
  rows,
});

describe("assessCatalogCapabilityReadiness", () => {
  it("does not invent a deep requirement from ordinary SKU and EAN fields", () => {
    const result = assessCatalogCapabilityReadiness(
      parsed(["Naam", "SKU", "EAN", "Voorraad"], [["T-shirt", "TEE-1", "5410000000011", "4"]]),
      [],
      createStoreConfigurationDraft(),
    );

    expect(result.blockingFindings).toEqual([]);
  });

  it("requires an explicit merchant decision before importing variant data", () => {
    const result = assessCatalogCapabilityReadiness(
      parsed(["Productnaam", "Maat", "Kleur"], [["T-shirt", "S", "Blauw"], ["T-shirt", "M", "Blauw"]]),
      [],
      createStoreConfigurationDraft(),
    );

    expect(result.blockingFindings).toEqual([
      expect.objectContaining({
        capability: "variant-matrix",
        status: "profile-decision",
      }),
    ]);
  });

  it("allows reviewed variants because the relational catalog importer preserves their option tuple", () => {
    const configuration = createStoreConfigurationDraft();
    configuration.capabilities["variant-matrix"] = "required";

    const result = assessCatalogCapabilityReadiness(
      parsed(["Productnaam", "Maat"], [["T-shirt", "S"]]),
      [{ source: "Maat", target: "variant-option:Maat", confidence: 1 }],
      configuration,
    );

    expect(result.findings).toEqual([
      expect.objectContaining({ capability: "variant-matrix", status: "ready" }),
    ]);
  });

  it("requires a profile decision for an extra identifier instead of flattening it", () => {
    const result = assessCatalogCapabilityReadiness(
      parsed(["Artikel", "EAN 2"], [["Kabel", "5410000000011"]]),
      [{ source: "EAN 2", target: "identifier:ean", confidence: 1 }],
      createStoreConfigurationDraft(),
    );

    expect(result.blockingFindings).toEqual([
      expect.objectContaining({ capability: "multiple-identifiers", status: "profile-decision" }),
    ]);
  });

  it("never lets a source silently override a not-needed profile choice", () => {
    const configuration = createStoreConfigurationDraft();
    configuration.capabilities["lot-traceability"] = "not-needed";

    const result = assessCatalogCapabilityReadiness(
      parsed(["Artikel", "Batch"], [["Thee", "B-2026-01"]]),
      [],
      configuration,
    );

    expect(result.blockingFindings[0]).toMatchObject({
      capability: "lot-traceability",
      status: "profile-conflict",
    });
  });

  it("keeps declared deep workflows blocked until their dedicated importer exists", () => {
    const configuration = createStoreConfigurationDraft();
    configuration.capabilities["serial-numbers"] = "required";

    const result = assessCatalogCapabilityReadiness(
      parsed(["Artikel", "IMEI"], [["Telefoon", "356789012345678"]]),
      [],
      configuration,
    );

    expect(result.blockingFindings[0]).toMatchObject({
      capability: "serial-numbers",
      status: "catalog-workflow-pending",
    });
  });

  it("allows a reviewed customer-price mapping because the flat importer preserves price tiers", () => {
    const configuration = createStoreConfigurationDraft();
    configuration.capabilities["customer-pricing"] = "required";

    const result = assessCatalogCapabilityReadiness(
      parsed(["Artikel", "Prijs B2B"], [["Kabel", "14,95"]]),
      [{ source: "Prijs B2B", target: "price:b2b", confidence: 1 }],
      configuration,
    );

    expect(result.findings).toEqual([
      expect.objectContaining({
        capability: "customer-pricing",
        status: "ready",
      }),
    ]);
  });
});
