import { describe, expect, it } from "vitest";
import { canOpenInventoryWorkspace } from "./access";

const allowed = {
  role: "owner" as const,
  moduleEnabled: true,
  entitled: true,
  platformEnabled: true,
};

describe("inventory workspace access matrix", () => {
  it.each(["owner", "manager"] as const)("allows the %s role when every gate is enabled", (role) => {
    expect(canOpenInventoryWorkspace({ ...allowed, role })).toBe(true);
  });

  it.each(["cashier", null] as const)("denies the %s role", (role) => {
    expect(canOpenInventoryWorkspace({ ...allowed, role })).toBe(false);
  });

  it.each(["moduleEnabled", "entitled", "platformEnabled"] as const)("fails closed when %s is disabled", (gate) => {
    expect(canOpenInventoryWorkspace({ ...allowed, [gate]: false })).toBe(false);
  });
});
