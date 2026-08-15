import { db } from "../db/db";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import { recordIntegrationRun, type IntegrationRunTelemetry } from "./integrationOperations";
import { getOutboxHealthMetadata, reportPlatformHealth, safeErrorFingerprint } from "./platformTelemetry";
import type {
  Customer,
  MigrationActivation,
  MigrationActivityLock,
  MigrationInverseChange,
  OutboxEntry,
  Product,
  ProductCategory,
} from "../types";

export interface MigrationActivationOutboxPayload {
  activation: MigrationActivation;
  categories: ProductCategory[];
  products: Product[];
  customers: Customer[];
  inverseChanges: MigrationInverseChange[];
  integrationRun?: Omit<IntegrationRunTelemetry, "storeId" | "status" | "eventType" | "eventMessage">;
}

export interface MigrationUndoOutboxPayload {
  migrationId: string;
}

export interface MigrationLockOutboxPayload {
  lock: MigrationActivityLock;
}

type MigrationRpcClient = {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
};
const migrationRpc = supabase as unknown as MigrationRpcClient;

const requireRemoteStore = (storeId: string): void => {
  if (!storeId || storeId === "local-device") {
    throw new Error("Deze lokale testmigratie krijgt pas serveropslag nadat een winkelaccount is gekoppeld.");
  }
  if (!isSupabaseConfigured) {
    throw new Error("Supabase is niet geconfigureerd; de migratie blijft veilig in de synchronisatiewachtrij.");
  }
};

const throwIfError = (error: { message: string } | null): void => {
  if (error) throw new Error(`Migratiesynchronisatie mislukt: ${error.message}`);
};

const runForEntry = (storeId: string, entry: OutboxEntry, status: IntegrationRunTelemetry["status"], error?: unknown): Promise<void> | null => {
  if (entry.kind !== "migration_activate") return null;
  const telemetry = (entry.payload as MigrationActivationOutboxPayload).integrationRun;
  if (!telemetry) return null;
  const eventType = status === "completed"
    ? "delivery.confirmed"
    : status === "queued"
      ? "delivery.queued"
      : "delivery.failed";
  return recordIntegrationRun({
    ...telemetry,
    storeId,
    status,
    errorCode: error ? "MIGRATION_DELIVERY_PENDING" : telemetry.errorCode,
    errorFingerprint: error ? safeErrorFingerprint("migration.delivery", error) : telemetry.errorFingerprint,
    eventType,
    eventMessage: status === "completed"
      ? "Server receipt bevestigd."
      : "De wijziging blijft veilig in de synchronisatiewachtrij.",
  });
};

/**
 * Sends exactly one durable migration command. Callers delete its outbox row
 * only after this function has received an acknowledged server response.
 */
export const pushMigrationOutboxEntry = async (
  storeId: string,
  entry: OutboxEntry,
): Promise<void> => {
  requireRemoteStore(storeId);
  if (entry.kind === "migration_activate") {
    const payload = entry.payload as MigrationActivationOutboxPayload;
    const { error } = await migrationRpc.rpc("apply_migration_activation", {
      target_store_id: storeId,
      migration_payload: payload,
    });
    throwIfError(error);
    return;
  }
  if (entry.kind === "migration_lock") {
    const payload = entry.payload as MigrationLockOutboxPayload;
    const { error } = await migrationRpc.rpc("seal_migration_activation", {
      target_store_id: storeId,
      lock_payload: payload.lock,
    });
    throwIfError(error);
    return;
  }
  if (entry.kind === "migration_undo") {
    const payload = entry.payload as MigrationUndoOutboxPayload;
    const { error } = await migrationRpc.rpc("undo_migration_activation", {
      target_store_id: storeId,
      target_migration_id: payload.migrationId,
    });
    throwIfError(error);
    return;
  }
  throw new Error(`Geen migratiesynchronisatie voor outbox-type ${entry.kind}.`);
};

/**
 * A successful local commit is never conditional on the network. When online,
 * this drains migration commands immediately; on failure the durable outbox
 * remains intact for the normal retry worker.
 */
export const synchronizeMigrationNow = async (
  storeId: string,
): Promise<{ sent: number; pending: number; error?: string }> => {
  const entries = await db.outbox.orderBy("id").toArray();
  const migrationEntries = entries.filter((entry) => [
    "migration_activate",
    "migration_lock",
    "migration_undo",
  ].includes(entry.kind));
  if (migrationEntries.length === 0) return { sent: 0, pending: 0 };
  if (globalThis.navigator?.onLine === false || !isSupabaseConfigured || storeId === "local-device") {
    await Promise.all(migrationEntries.map((entry) => runForEntry(storeId, entry, "queued")));
    return { sent: 0, pending: migrationEntries.length };
  }

  let sent = 0;
  for (const entry of migrationEntries) {
    try {
      await pushMigrationOutboxEntry(storeId, entry);
      if (entry.id != null) await db.outbox.delete(entry.id);
      await runForEntry(storeId, entry, "completed");
      sent += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Onbekende synchronisatiefout.";
      if (entry.id != null) {
        await db.outbox.update(entry.id, {
          attempts: entry.attempts + 1,
          lastError: message,
        });
      }
      await runForEntry(storeId, entry, "queued", error);
      void reportPlatformHealth({
        storeId,
        eventType: "sync.retrying",
        severity: "warning",
        operation: entry.kind,
        errorFingerprint: safeErrorFingerprint(entry.kind, error),
        metadata: await getOutboxHealthMetadata(),
      });
      return { sent, pending: migrationEntries.length - sent, error: message };
    }
  }
  if (sent > 0) {
    void reportPlatformHealth({ storeId, eventType: "sync.completed", operation: "migration.import", metadata: await getOutboxHealthMetadata() });
  }
  return { sent, pending: 0 };
};
