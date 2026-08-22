import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("../lib/supabase", () => ({
  isSupabaseConfigured: true,
  supabase: { rpc },
}));

import { assertRetailVatServerSupport } from "./retailPlatformCapabilities";

describe("assertRetailVatServerSupport", () => {
  beforeEach(() => {
    rpc.mockReset();
    localStorage.clear();
  });

  it("does not make a remote capability request for a legacy 12/21 sale", async () => {
    await expect(assertRetailVatServerSupport("store-1", [12, 21])).resolves.toBeUndefined();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("requires the server to confirm all generic retail VAT rates", async () => {
    rpc.mockResolvedValue({
      data: {
        schemaVersion: 2,
        genericVatSnapshots: true,
        supportedVatRates: [0, 6, 12, 21],
      },
      error: null,
    });

    await expect(assertRetailVatServerSupport("store-1", [0, 6, 21])).resolves.toBeUndefined();
    expect(rpc).toHaveBeenCalledWith("get_retail_platform_capabilities", {
      target_store_id: "store-1",
    });
  });

  it("fails closed when the connected server has not received the VAT migration", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "function does not exist" } });

    await expect(assertRetailVatServerSupport("store-1", [6])).rejects.toThrow(
      "centrale winkel ondersteunt",
    );
  });
});
