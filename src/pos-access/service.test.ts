import { afterEach, describe, expect, it, vi } from "vitest";
import { isPosAccessNetworkError } from "./service";

describe("POS access network fallback classification", () => {
  afterEach(() => vi.restoreAllMocks());

  it("accepts genuine transport failures", () => {
    expect(isPosAccessNetworkError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isPosAccessNetworkError(new Error("Network request failed"))).toBe(true);
  });

  it("does not treat authorization or application failures as offline", () => {
    expect(isPosAccessNetworkError(new Error("pos-access:forbidden:Geen toegang"))).toBe(false);
    expect(isPosAccessNetworkError(new Error("pos-access:device-revoked"))).toBe(false);
  });

  it("honours an explicitly offline browser", () => {
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    expect(isPosAccessNetworkError(new Error("unknown transport failure"))).toBe(true);
  });
});
