import { describe, expect, it } from "vitest";
import {
  completeStoreConfiguration,
  configuredVatFallback,
  createStoreConfigurationDraft,
  normalizeStoreConfiguration,
  recommendedModulesForIndustry,
  recommendedStartView,
} from "./storeConfiguration";

describe("store configuration", () => {
  it("recommends repairs for sectors where after-sales service is core", () => {
    expect(recommendedModulesForIndustry("telecom-it").service).toBe(true);
    expect(recommendedModulesForIndustry("bicycles").service).toBe(true);
    expect(recommendedModulesForIndustry("lingerie").service).toBe(false);
  });

  it("normalizes untrusted configuration without disabling existing stores", () => {
    const normalized = normalizeStoreConfiguration({ version: 999 });
    expect(normalized.modules.catalog).toBe(true);
    expect(normalized.modules.service).toBe(true);
    expect(normalized.firstRunCompleted).toBe(true);
  });

  it("routes a new store with existing stock to Integration Hub", () => {
    const draft = createStoreConfigurationDraft();
    const configured = completeStoreConfiguration(
      {
        ...draft,
        catalogSource: "spreadsheet",
        importTiming: "now",
      },
      "2026-08-13T12:00:00.000Z",
    );
    expect(recommendedStartView(configured)).toBe("integration-hub");
    expect(configured.firstRunCompleted).toBe(false);
  });

  it("routes service-only businesses to the repair desk", () => {
    const draft = createStoreConfigurationDraft();
    expect(
      recommendedStartView({
        ...draft,
        modules: {
          catalog: false,
          customers: true,
          service: true,
          webshop: false,
          insights: false,
        },
      }),
    ).toBe("service");
  });

  it("uses a configured VAT rate and keeps mixed catalogs safe at 21 percent", () => {
    const draft = createStoreConfigurationDraft();
    expect(configuredVatFallback({ ...draft, defaultVat: "6" })).toBe(6);
    expect(configuredVatFallback({ ...draft, defaultVat: "mixed" })).toBe(21);
  });
});
