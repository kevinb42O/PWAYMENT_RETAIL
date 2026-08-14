import { describe, expect, it } from "vitest";
import { formatTrialRemaining } from "./useEntitlementClock";

describe("formatTrialRemaining", () => {
  it("shows elapsed-day precision instead of rounding a nearly full trial to 30 days", () => {
    expect(formatTrialRemaining((29 * 24 + 23) * 60 * 60_000 + 59 * 60_000))
      .toBe("29 dagen · 23 uur resterend");
  });

  it("shows hours and minutes in the final day", () => {
    expect(formatTrialRemaining(7 * 60 * 60_000 + 42 * 60_000))
      .toBe("07:42 resterend");
  });

  it("switches to the Basis message exactly at expiry", () => {
    expect(formatTrialRemaining(0)).toBe("Trial afgelopen · Basis actief");
  });
});
