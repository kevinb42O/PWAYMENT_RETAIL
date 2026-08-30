import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  completeStoreConfiguration,
  createStoreConfigurationDraft,
} from "../onboarding/storeConfiguration";

const loadFixtureAuth = async () => {
  vi.resetModules();
  vi.stubEnv("VITE_E2E_BUILD", "true");
  const [{ db }, auth] = await Promise.all([
    import("../db/db"),
    import("./useAuth"),
  ]);
  if (!db.isOpen()) await db.open();
  await Promise.all([db.users.clear(), db.audit.clear()]);
  localStorage.removeItem("pwayment:seedVersion");
  return { db, ...auth };
};

describe("fixture authentication", () => {
  beforeEach(() => vi.stubEnv("VITE_E2E_BUILD", "true"));
  afterEach(() => vi.unstubAllEnvs());

  it("seeds fixture staff, enforces PINs, and records manager approval", async () => {
    const { db, ensureSeedUsers, useAuth } = await loadFixtureAuth();
    await ensureSeedUsers();

    expect(await db.users.count()).toBeGreaterThanOrEqual(4);
    expect(await useAuth.getState().login("u-owner", "000000")).toBe(false);
    expect(await useAuth.getState().login("u-owner", "123456")).toBe(true);
    expect(useAuth.getState()).toMatchObject({
      currentUserId: "u-owner",
      currentRole: "owner",
      unlocked: true,
    });
    expect(useAuth.getState().hasRole("owner")).toBe(true);
    expect(useAuth.getState().hasRole("cashier")).toBe(false);
    expect(await useAuth.getState().verifyCurrentOwnerPin("000000")).toBe(false);
    expect(await useAuth.getState().verifyCurrentOwnerPin("123456")).toBe(true);
    expect(await useAuth.getState().verifyManager("234567")).toBe("u-mgr");
    expect(await useAuth.getState().verifyManager("bad")).toBeNull();
    expect((await db.audit.toArray()).map((entry) => entry.action)).toEqual(
      expect.arrayContaining(["login", "approve"]),
    );
  });

  it("creates an isolated fixture owner only with a valid six-digit PIN", async () => {
    const { db, useAuth } = await loadFixtureAuth();
    const onboardingConfiguration = completeStoreConfiguration({
      ...createStoreConfigurationDraft(),
      industry: "general-retail",
    });
    const invalid = await useAuth.getState().registerAccount({
      firstName: "E2E",
      lastName: "Owner",
      storeName: "Testwinkel",
      email: "owner@example.test",
      password: "CorrectHorseBattery12!",
      pin: "123",
      termsAccepted: true,
      businessUseConfirmed: true,
      onboardingConfiguration,
    });
    expect(invalid).toMatchObject({ success: false });

    const created = await useAuth.getState().registerAccount({
      firstName: "E2E",
      lastName: "Owner",
      storeName: "Testwinkel",
      email: "owner@example.test",
      password: "CorrectHorseBattery12!",
      pin: "654321",
      termsAccepted: true,
      businessUseConfirmed: true,
      onboardingConfiguration,
    });
    expect(created).toEqual({ success: true });
    expect(useAuth.getState()).toMatchObject({
      currentUserName: "E2E Owner",
      currentRole: "owner",
      currentStoreName: "Testwinkel",
      unlocked: true,
    });
    expect((await db.users.toArray()).some((user) => user.email === "owner@example.test")).toBe(true);
  });

  it("authenticates seeded owners by email and rejects incorrect passwords", async () => {
    const { ensureSeedUsers, useAuth } = await loadFixtureAuth();
    await ensureSeedUsers();

    expect(
      await useAuth.getState().loginWithEmail("eigenaar@pwayment.be", "wrong"),
    ).toMatchObject({ success: false });
    expect(
      await useAuth.getState().loginWithEmail("eigenaar@pwayment.be", "password123"),
    ).toEqual({ success: true });
    expect(useAuth.getState().currentUserId).toBe("u-owner");
  });
});
