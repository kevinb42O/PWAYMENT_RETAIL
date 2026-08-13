import { beforeEach, describe, expect, it } from "vitest";
import {
  customerDisplayConfigSnapshot,
  DEFAULT_CUSTOMER_DISPLAY_CONFIG,
  useCustomerDisplaySettings,
} from "./settings";

describe("customer display settings", () => {
  beforeEach(() => {
    useCustomerDisplaySettings.setState({ configsByStore: {} });
  });

  it("is opt-in and disabled by default", () => {
    expect(customerDisplayConfigSnapshot("store-a")).toEqual(
      DEFAULT_CUSTOMER_DISPLAY_CONFIG,
    );
    expect(customerDisplayConfigSnapshot("store-a").enabled).toBe(false);
  });

  it("keeps owner choices isolated per store", () => {
    useCustomerDisplaySettings.getState().updateConfig("store-a", {
      enabled: true,
      idleHeadline: "Welkom in Store A",
    });

    expect(customerDisplayConfigSnapshot("store-a")).toMatchObject({
      enabled: true,
      idleHeadline: "Welkom in Store A",
    });
    expect(customerDisplayConfigSnapshot("store-b")).toEqual(
      DEFAULT_CUSTOMER_DISPLAY_CONFIG,
    );
  });

  it("can be reset without affecting another store", () => {
    const settings = useCustomerDisplaySettings.getState();
    settings.updateConfig("store-a", { enabled: true });
    settings.updateConfig("store-b", { idleHeadline: "Store B" });
    useCustomerDisplaySettings.getState().resetConfig("store-a");

    expect(customerDisplayConfigSnapshot("store-a")).toEqual(
      DEFAULT_CUSTOMER_DISPLAY_CONFIG,
    );
    expect(customerDisplayConfigSnapshot("store-b").idleHeadline).toBe(
      "Store B",
    );
  });
});
