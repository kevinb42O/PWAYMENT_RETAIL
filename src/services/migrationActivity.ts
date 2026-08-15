import Dexie, { type Transaction } from "dexie";
import { db, type POSDatabase } from "../db/db";
import type {
  MigrationActivityLock,
  MigrationEntityType,
  MigrationMeaningfulActivityType,
} from "../types";

/**
 * Explicit transaction context required by recordMeaningfulActivity. Call
 * currentMigrationTransactionContext inside a Dexie rw transaction whose table
 * list includes migration_activations and migration_activity_locks.
 */
export interface MigrationTransactionContext {
  transaction: Transaction;
  database: POSDatabase;
}

export interface MeaningfulActivityInput {
  storeId: string | null;
  activityType: MigrationMeaningfulActivityType;
  entityType: MigrationEntityType;
  entityId: string;
  occurredAt: number;
  actorUserId?: string;
  actorName?: string;
  correlationId?: string;
}

export interface MeaningfulActivityResult {
  locked: boolean;
  migrationId?: string;
}

/**
 * Unauthenticated/device-local sessions still need a stable migration scope.
 * Authenticated merchants always use their real tenant ID; this fallback only
 * covers the local-first setup and demo flows before an account is connected.
 */
export const migrationStoreScope = (storeId: string | null): string =>
  storeId?.trim() || "local-device";

export const currentMigrationTransactionContext = (
  database: POSDatabase = db,
): MigrationTransactionContext => {
  const transaction = Dexie.currentTransaction;
  if (!transaction) {
    throw new Error("migration-activity:transaction-required");
  }
  return { transaction, database };
};

/**
 * Atomically closes the full-undo window for a tenant's active migration.
 * This service intentionally has no detached fallback: callers must invoke it
 * from the same Dexie transaction that commits the meaningful business event.
 */
export const recordMeaningfulActivity = async (
  context: MigrationTransactionContext,
  input: MeaningfulActivityInput,
): Promise<MeaningfulActivityResult> => {
  if (Dexie.currentTransaction !== context.transaction) {
    throw new Error("migration-activity:transaction-context-mismatch");
  }
  if (!input.entityId.trim()) {
    throw new Error("migration-activity:entity-required");
  }
  if (!Number.isSafeInteger(input.occurredAt) || input.occurredAt <= 0) {
    throw new Error("migration-activity:occurred-at-invalid");
  }

  const scopedStoreId = migrationStoreScope(input.storeId);
  const active = await context.database.migration_activations
    .where("[storeId+status]")
    .equals([scopedStoreId, "active"])
    .first();
  if (!active) return { locked: false };

  // A well-formed activation cannot have a first activity while active. Treat
  // a corrupted local state as fatal so the parent business transaction rolls
  // back instead of permitting a possibly unsafe undo path.
  if (active.firstMeaningfulActivityAt != null) {
    throw new Error("migration-activity:active-migration-already-sealed");
  }

  const lock: MigrationActivityLock = {
    id: globalThis.crypto.randomUUID(),
    migrationId: active.id,
    storeId: scopedStoreId,
    activityType: input.activityType,
    entityType: input.entityType,
    entityId: input.entityId.trim(),
    occurredAt: input.occurredAt,
    actorUserId: input.actorUserId,
    actorName: input.actorName,
    correlationId: input.correlationId,
  };
  await context.database.migration_activations.put({
    ...active,
    status: "locked",
    firstMeaningfulActivityAt: input.occurredAt,
    firstMeaningfulActivityType: input.activityType,
    firstMeaningfulActivityEntityType: input.entityType,
    firstMeaningfulActivityEntityId: input.entityId.trim(),
    lockedAt: input.occurredAt,
    updatedAt: input.occurredAt,
  });
  await context.database.migration_activity_locks.add(lock);
  return { locked: true, migrationId: active.id };
};
