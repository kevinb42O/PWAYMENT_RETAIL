import { afterEach, describe, expect, it, vi } from "vitest";
import { isPosAccessNetworkError, posAccessErrorMessage } from "./service";

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

describe("POS access error presentation", () => {
  it("extracts safe domain messages", () => {
    expect(posAccessErrorMessage("pos-access:owner-required:Alleen de eigenaar kan dit doen.")).toBe(
      "Alleen de eigenaar kan dit doen.",
    );
  });

  it("does not expose the database conflict error in the UI", () => {
    expect(posAccessErrorMessage(
      "there is no unique or exclusion constraint matching the ON CONFLICT specification",
    )).toBe("De kassabeveiliging kon niet worden geactiveerd. Vernieuw de pagina en probeer opnieuw.");
  });
});
