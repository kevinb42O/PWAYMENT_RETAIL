import { describe, expect, it } from "vitest";
import { generateHash } from "./crypto";
import { hashCredential, verifyCredential } from "./credentials";

describe("credential hashing", () => {
  it("uses a unique salt and verifies only the matching secret", async () => {
    const first = await hashCredential("sterk-wachtwoord", "password");
    const second = await hashCredential("sterk-wachtwoord", "password");
    expect(first).not.toBe(second);
    expect(
      (await verifyCredential("sterk-wachtwoord", "password", first)).valid,
    ).toBe(true);
    expect((await verifyCredential("verkeerd", "password", first)).valid).toBe(
      false,
    );
  });

  it("accepts a legacy hash once and marks it for upgrade", async () => {
    const legacy = await generateHash("pwayment:123456");
    expect(await verifyCredential("123456", "pin", legacy)).toEqual({
      valid: true,
      needsUpgrade: true,
    });
  });
});
