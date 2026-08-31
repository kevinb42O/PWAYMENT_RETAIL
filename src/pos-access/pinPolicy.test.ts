import { describe, expect, it } from "vitest";
import { isSafePosPin, posPinPolicyError } from "./pinPolicy";

describe("POS PIN policy", () => {
  it("requires exactly six numeric digits", () => {
    expect(isSafePosPin("12345")).toBe(false);
    expect(isSafePosPin("1234567")).toBe(false);
    expect(isSafePosPin("12A456")).toBe(false);
    expect(posPinPolicyError("123")).toContain("exact 6 cijfers");
  });

  it("rejects common sequences and repeated digits", () => {
    for (const pin of ["000000", "111111", "123456", "654321", "121212", "112233"]) {
      expect(isSafePosPin(pin), pin).toBe(false);
    }
  });

  it("accepts non-trivial six-digit PINs", () => {
    expect(isSafePosPin("486205")).toBe(true);
    expect(isSafePosPin("739184")).toBe(true);
  });
});
