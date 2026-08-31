import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hashCredential } from "../utils/credentials";

describe("fixture POS operator access", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_E2E_BUILD", "true");
  });

  afterEach(() => vi.unstubAllEnvs());

  it("identifies the operator from the PIN alone and clears identity on lock", async () => {
    vi.resetModules();
    const [{ db }, { useAuth }, { usePosAccess }] = await Promise.all([
      import("../db/db"),
      import("../auth/useAuth"),
      import("./usePosAccess"),
    ]);
    if (!db.isOpen()) await db.open();
    await db.users.clear();
    await db.users.put({
      id: "operator-sophie",
      name: "Sophie",
      role: "cashier",
      pinHash: await hashCredential("486205", "pin"),
    });
    useAuth.setState({ unlocked: true, accountUserId: "account-owner", accountRole: "owner" });
    usePosAccess.getState().reset();
    await usePosAccess.getState().initialize(null);

    expect(usePosAccess.getState().status).toBe("locked");
    expect(await usePosAccess.getState().unlock("111111")).toBe(false);
    expect(await usePosAccess.getState().unlock("486205")).toBe(true);
    expect(usePosAccess.getState().operator).toMatchObject({ displayName: "Sophie", role: "cashier" });
    expect(useAuth.getState()).toMatchObject({ currentUserId: "operator-sophie", currentRole: "cashier" });

    await usePosAccess.getState().lock();
    expect(usePosAccess.getState().status).toBe("locked");
    expect(useAuth.getState()).toMatchObject({ currentUserId: null, currentRole: null });
  });

  it("emits a session proof online and an offline grant proof only for the captured operator", async () => {
    vi.resetModules();
    const { getPosActionAttribution, usePosAccess } = await import("./usePosAccess");
    usePosAccess.setState({
      status: "active",
      operator: { id: "operator-1", displayName: "Sophie", role: "cashier" },
      device: { id: "device-1", name: "Kassa", status: "active", offlineGraceHours: 24 },
      sessionToken: "online-session-token",
    });
    expect(getPosActionAttribution("operator-1")).toMatchObject({
      operator_id: "operator-1",
      operator_device_id: "device-1",
      operator_session_token: "online-session-token",
    });
    expect(getPosActionAttribution("operator-2")).not.toHaveProperty("operator_session_token");

    usePosAccess.setState({ sessionToken: "offline:offline-grant-token" });
    expect(getPosActionAttribution("operator-1")).toMatchObject({
      operator_offline_grant_token: "offline-grant-token",
    });
  });
});
