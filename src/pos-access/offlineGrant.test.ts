import { webcrypto } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  getCachedOfflineDevice,
  saveOfflineGrant,
  unlockOfflineGrant,
} from "./offlineGrant";

describe("encrypted offline POS grants", () => {
  beforeEach(() => {
    localStorage.clear();
    Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
  });

  it("uses the PIN to identify and decrypt the correct operator without storing it", async () => {
    const expiresAt = new Date(Date.now() + 3_600_000).toISOString();
    await saveOfflineGrant({
      storeId: "store-1",
      installationId: "installation-1",
      pin: "486205",
      token: "server-offline-token",
      expiresAt,
      operator: { id: "operator-1", displayName: "Sophie", role: "cashier" },
      device: { id: "device-1", name: "iPad toonbank", status: "active", offlineGraceHours: 24 },
    });

    const persisted = Array.from({ length: localStorage.length }, (_, index) =>
      localStorage.getItem(localStorage.key(index) ?? "") ?? "",
    ).join(" ");
    expect(persisted).not.toContain("486205");
    expect(persisted).not.toContain("server-offline-token");
    expect(persisted).not.toContain("Sophie");
    expect(getCachedOfflineDevice("store-1", "installation-1")).toMatchObject({ id: "device-1" });
    expect(await unlockOfflineGrant("store-1", "installation-1", "739184")).toBeNull();
    expect(await unlockOfflineGrant("store-1", "installation-1", "486205")).toMatchObject({
      token: "server-offline-token",
      operator: { id: "operator-1", displayName: "Sophie" },
      device: { id: "device-1" },
    });
  });

  it("does not cache an already expired grant", async () => {
    await saveOfflineGrant({
      storeId: "store-1",
      installationId: "installation-1",
      pin: "486205",
      token: "expired-token",
      expiresAt: new Date(Date.now() - 1).toISOString(),
      operator: { id: "operator-1", displayName: "Sophie", role: "cashier" },
      device: { id: "device-1", name: "Kassa", status: "active", offlineGraceHours: 24 },
    });
    expect(getCachedOfflineDevice("store-1", "installation-1")).toBeNull();
  });
});
