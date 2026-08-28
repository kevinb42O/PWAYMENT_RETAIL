import { describe, expect, it } from "vitest";
import { canOpenInventoryWorkspace, resolveInventoryWorkspaceBuildDefault } from "./access";

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

describe("inventory workspace platform default", () => {
  it("is beschikbaar zonder een verborgen environment override", () => {
    expect(resolveInventoryWorkspaceBuildDefault(undefined)).toBe(true);
    expect(resolveInventoryWorkspaceBuildDefault("")).toBe(true);
  });

  it.each(["false", "0", "off", "no"])("honours the explicit kill-switch value %s", (value) => {
    expect(resolveInventoryWorkspaceBuildDefault(value)).toBe(false);
  });

  it.each(["true", "1", "on", "yes"])("accepts the explicit enable value %s", (value) => {
    expect(resolveInventoryWorkspaceBuildDefault(value)).toBe(true);
  });
});
