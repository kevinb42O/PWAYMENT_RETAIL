import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../db/db";
import type { MigrationActivation } from "../types";
import {
  currentMigrationTransactionContext,
  recordMeaningfulActivity,
} from "./migrationActivity";

const activation = (over: Partial<MigrationActivation> = {}): MigrationActivation => ({
  id: "migration-1",
  storeId: "store-1",
  status: "active",
  graphVersion: 1,
  answersJson: {},
  receiptJson: {},
  activatedAt: 1000,
  createdAt: 1000,
  updatedAt: 1000,
  ...over,
});

beforeEach(async () => {
  if (!db.isOpen()) await db.open();
  await db.migration_activations.clear();
  await db.migration_activity_locks.clear();
});

describe("recordMeaningfulActivity", () => {
  it("requires an existing Dexie transaction", async () => {
    expect(() => currentMigrationTransactionContext()).toThrow(
      "migration-activity:transaction-required",
    );
  });

  it("locks one active migration and records immutable first-activity evidence", async () => {
    await db.migration_activations.add(activation());

    const result = await db.transaction(
      "rw",
      db.migration_activations,
      db.migration_activity_locks,
      async () => recordMeaningfulActivity(currentMigrationTransactionContext(), {
        storeId: "store-1",
        activityType: "checkout",
        entityType: "transaction",
        entityId: "42",
        occurredAt: 2000,
        actorUserId: "owner-1",
        correlationId: "checkout-42",
      }),
    );

    expect(result).toEqual({ locked: true, migrationId: "migration-1" });
    expect(await db.migration_activations.get("migration-1")).toMatchObject({
      status: "locked",
      firstMeaningfulActivityAt: 2000,
      firstMeaningfulActivityType: "checkout",
      firstMeaningfulActivityEntityType: "transaction",
      firstMeaningfulActivityEntityId: "42",
    });
    expect(await db.migration_activity_locks.toArray()).toEqual([
      expect.objectContaining({ migrationId: "migration-1", activityType: "checkout", entityId: "42" }),
    ]);
  });

  it("does nothing when the tenant has no active activation", async () => {
    const result = await db.transaction(
      "rw",
      db.migration_activations,
      db.migration_activity_locks,
      async () => recordMeaningfulActivity(currentMigrationTransactionContext(), {
        storeId: "store-1",
        activityType: "checkout",
        entityType: "transaction",
        entityId: "42",
        occurredAt: 2000,
      }),
    );
    expect(result).toEqual({ locked: false });
    expect(await db.migration_activity_locks.count()).toBe(0);
  });
});
