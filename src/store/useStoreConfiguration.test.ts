import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadFixtureStoreConfiguration = async () => {
  vi.resetModules();
  vi.stubEnv("VITE_E2E_BUILD", "true");
  return import("./useStoreConfiguration");
};

describe("store configuration persistence state", () => {
  beforeEach(() => vi.stubEnv("VITE_E2E_BUILD", "true"));
  afterEach(() => vi.unstubAllEnvs());

  it("normalizes a remote configuration and saves module choices in fixture mode", async () => {
    const { useStoreConfiguration } = await loadFixtureStoreConfiguration();
    const state = useStoreConfiguration.getState();
    state.applyRemote({
      ...state.configuration,
      industry: "telecom-it",
      catalogSource: "spreadsheet",
      importTiming: "now",
      modules: { catalog: true, customers: true, service: true },
    }, "fixture-store");

    expect(useStoreConfiguration.getState()).toMatchObject({
      storeId: "fixture-store",
      hydrated: true,
      configuration: { industry: "telecom-it", importTiming: "now" },
    });
    expect(await useStoreConfiguration.getState().setModuleEnabled("service", false)).toEqual({ success: true });
    expect(useStoreConfiguration.getState().configuration.modules.service).toBe(false);
    await useStoreConfiguration.getState().markFirstRunCompleted();
    expect(useStoreConfiguration.getState().configuration.firstRunCompleted).toBe(true);
  });

  it("keeps a local draft usable before a store has been provisioned", async () => {
    const { useStoreConfiguration } = await loadFixtureStoreConfiguration();
    const initial = useStoreConfiguration.getState().configuration;
    const result = await useStoreConfiguration.getState().save({
      ...initial,
      industry: "bicycles",
      completedAt: "2026-08-14T12:00:00.000Z",
    }, null);

    expect(result).toEqual({ success: true });
    expect(useStoreConfiguration.getState().configuration.industry).toBe("bicycles");
    useStoreConfiguration.getState().reset();
    expect(useStoreConfiguration.getState()).toMatchObject({ storeId: null, hydrated: false });
  });
});
