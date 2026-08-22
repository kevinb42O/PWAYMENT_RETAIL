import { describe, expect, it } from "vitest";
import {
  capabilityCodesForIndustry,
  completeStoreConfiguration,
  configuredVatFallback,
  createStoreConfigurationDraft,
  isCompleteStoreConfiguration,
  normalizeStoreConfiguration,
  recommendedModulesForIndustry,
  recommendedStartView,
  withConfiguredModule,
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
    expect(normalized.modules.workforce).toBe(true);
    expect(normalized.firstRunCompleted).toBe(true);
  });

  it("upgrades a legacy V1 store configuration without inferring retail needs", () => {
    const normalized = normalizeStoreConfiguration({
      version: 1,
      industry: "fashion",
      modules: { catalog: true },
    });

    expect(normalized.version).toBe(2);
    expect(normalized.industry).toBe("fashion");
    expect(normalized.capabilities["variant-matrix"]).toBe("unknown");
    expect(normalized.capabilities["serial-numbers"]).toBe("unknown");
  });

  it("uses the chosen retail profile to ask relevant questions without setting answers", () => {
    expect(capabilityCodesForIndustry("fashion")).toContain("variant-matrix");
    expect(capabilityCodesForIndustry("fashion")).toContain("webshop-variants");
    expect(capabilityCodesForIndustry("food")).toContain("lot-traceability");
    expect(capabilityCodesForIndustry("food")).toContain("measurable-quantities");
    expect(createStoreConfigurationDraft().capabilities["lot-traceability"]).toBe("unknown");
  });

  it("accepts only a complete V2 retail contract for account creation", () => {
    const complete = completeStoreConfiguration(
      { ...createStoreConfigurationDraft(), industry: "fashion" },
      "2026-08-22T12:00:00.000Z",
    );

    expect(isCompleteStoreConfiguration(complete)).toBe(true);
    expect(isCompleteStoreConfiguration({ ...complete, completedAt: "not-a-date" })).toBe(false);
    expect(isCompleteStoreConfiguration({ ...complete, industry: "restaurant" })).toBe(false);
    expect(isCompleteStoreConfiguration({
      ...complete,
      capabilities: { ...complete.capabilities, "variant-matrix": "enabled-by-client" },
    })).toBe(false);
    expect(isCompleteStoreConfiguration({
      ...complete,
      capabilities: { ...complete.capabilities, "variant-matrix": "enabled" },
    })).toBe(false);
    expect(isCompleteStoreConfiguration({
      ...complete,
      capabilities: { ...complete.capabilities, "variant-matrix": "blocked" },
    })).toBe(false);
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
          workforce: false,
          webshop: false,
          insights: false,
        },
      }),
    ).toBe("service");
  });

  it("uses a configured VAT rate and keeps mixed catalogs safe at 21 percent", () => {
    const draft = createStoreConfigurationDraft();
    expect(configuredVatFallback({ ...draft, defaultVat: "6" })).toBe(6);
    expect(configuredVatFallback({ ...draft, defaultVat: "0" })).toBe(0);
    expect(configuredVatFallback({ ...draft, defaultVat: "mixed" })).toBe(21);
  });

  it("changes one navigation module without losing the rest of the store setup", () => {
    const configured = completeStoreConfiguration(createStoreConfigurationDraft(), "2026-08-13T12:00:00.000Z");
    const next = withConfiguredModule(configured, "service", false);

    expect(next.modules.service).toBe(false);
    expect(next.modules.catalog).toBe(configured.modules.catalog);
    expect(next.industry).toBe(configured.industry);
    expect(next.completedAt).toBe(configured.completedAt);
  });

  it("keeps workforce and Integration Hub independently configurable", () => {
    const configured = createStoreConfigurationDraft();
    const withoutWorkforce = withConfiguredModule(configured, "workforce", false);
    const withoutHub = withConfiguredModule(withoutWorkforce, "catalog", false);

    expect(withoutHub.modules.workforce).toBe(false);
    expect(withoutHub.modules.catalog).toBe(false);
    expect(withoutHub.modules.service).toBe(configured.modules.service);
  });
});
