import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useAuth } from "../auth/useAuth";
import { activateTenantDatabase, db } from "../db/db";
import type { FinancialCost } from "../types";
import { useFinancialWorkspace } from "./useFinancialWorkspace";

const example: FinancialCost = {
  id: "rent",
  kind: "recurring",
  name: "Huur",
  category: "premises",
  amountCents: 100_000,
  amountMode: "excluding-vat",
  vatRate: 0,
  vatRecoverablePercent: 0,
  behavior: "fixed",
  frequency: "monthly",
  startDate: "2026-01-01",
  status: "active",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("owner financial workspace store", () => {
  beforeEach(async () => {
    activateTenantDatabase(`financial-test-${crypto.randomUUID()}`);
    await db.open();
    useAuth.setState({ currentRole: "owner", currentStoreId: "store-owner" });
    useFinancialWorkspace.getState().reset();
  });

  afterEach(async () => {
    db.close();
    await db.delete();
    activateTenantDatabase(null);
    useFinancialWorkspace.getState().reset();
  });

  it("commits the local record and durable mutation atomically", async () => {
    await useFinancialWorkspace.getState().saveCost(example);
    expect(await db.financial_costs.get("rent")).toEqual(example);
    expect(await db.outbox.where("kind").equals("financial_workspace_mutation").count()).toBe(1);
    expect(useFinancialWorkspace.getState().costs).toEqual([example]);
  });

  it("archives instead of deleting financial history", async () => {
    await useFinancialWorkspace.getState().saveCost(example);
    await useFinancialWorkspace.getState().archiveCost(example.id);
    expect(await db.financial_costs.get("rent")).toMatchObject({
      status: "archived",
      endDate: new Date().toISOString().slice(0, 10),
    });
    expect(await db.outbox.where("kind").equals("financial_workspace_mutation").count()).toBe(2);
  });

  it("refuses manager mutations even when called outside the UI", async () => {
    useAuth.setState({ currentRole: "manager" });
    await expect(useFinancialWorkspace.getState().saveCost(example)).rejects.toThrow(
      "Alleen de eigenaar",
    );
    expect(await db.financial_costs.count()).toBe(0);
  });

  it("refuses writes when the hydrated workspace belongs to another store", async () => {
    useFinancialWorkspace.setState({ storeId: "different-store" });
    await expect(useFinancialWorkspace.getState().saveCost(example)).rejects.toThrow(
      "actieve winkel",
    );
    expect(await db.financial_costs.count()).toBe(0);
  });

  it("rejects invalid financial dates before they reach the durable outbox", async () => {
    await expect(useFinancialWorkspace.getState().saveCost({
      ...example,
      startDate: "2026-02-31",
    })).rejects.toThrow("ongeldige");
    expect(await db.outbox.count()).toBe(0);
  });
});
