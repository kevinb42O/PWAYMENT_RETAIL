import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "./db";
import {
  drainOutbox,
  enqueueOutbox,
  getOutboxEntriesNeedingResolution,
  retryOutboxEntry,
} from "./outbox";

describe("offline outbox", () => {
  beforeEach(async () => {
    if (!db.isOpen()) await db.open();
    await db.outbox.clear();
  });

  it("deletes confirmed entries in FIFO order", async () => {
    await enqueueOutbox("upsert_product", [{ id: "p-1" }]);
    await enqueueOutbox("upsert_customer", [{ id: "c-1" }]);
    const sent: string[] = [];

    await drainOutbox(async (entry) => {
      sent.push(entry.kind);
    });

    expect(sent).toEqual(["upsert_product", "upsert_customer"]);
    expect(await db.outbox.count()).toBe(0);
  });

  it("backs off a transient failure without holding later independent entries hostage", async () => {
    await enqueueOutbox("upsert_product", [{ id: "p-1" }]);
    await enqueueOutbox("upsert_customer", [{ id: "c-1" }]);
    const send = vi.fn().mockRejectedValueOnce(new Error("offline"));
    const now = Date.now();

    const result = await drainOutbox(send, { now, workerId: "test-worker" });

    expect(send).toHaveBeenCalledTimes(2);
    expect(result.delivered).toBe(1);
    expect(result.retried).toHaveLength(1);
    const entries = await db.outbox.orderBy("id").toArray();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      attempts: 1,
      lastError: "offline",
      deliveryStatus: "retrying",
      nextAttemptAt: now + 5_000,
    });
  });

  it("moves an unconfigured non-financial delivery to a retriable manual queue", async () => {
    await enqueueOutbox("webshop_email", { to: "customer@example.test" });
    await enqueueOutbox("upsert_product", [{ id: "p-1" }]);
    const now = Date.now();

    const result = await drainOutbox(
      async (entry) => {
        if (entry.kind === "webshop_email") throw new Error("Webshop e-mail delivery is not configured");
      },
      { now, workerId: "test-worker" },
    );

    expect(result.delivered).toBe(1);
    expect(result.deadLettered).toHaveLength(1);
    const [failed] = await getOutboxEntriesNeedingResolution();
    expect(failed).toMatchObject({
      kind: "webshop_email",
      deliveryStatus: "dead_letter",
      requiresManualResolution: true,
    });
    expect(await retryOutboxEntry(failed.id!)).toBe(true);
    expect(await db.outbox.get(failed.id!)).toMatchObject({
      deliveryStatus: "pending",
      requiresManualResolution: false,
    });
  });

  it("does not endlessly retry a rejected atomic catalog command", async () => {
    await enqueueOutbox("upsert_catalog_batch", { requestId: "catalog-1" });

    const result = await drainOutbox(
      async () => {
        throw new Error("retail-catalog:create-conflict:Dit product werd ondertussen aangemaakt.");
      },
      { now: Date.now(), workerId: "catalog-worker" },
    );

    expect(result.retried).toHaveLength(0);
    expect(result.deadLettered).toHaveLength(1);
    expect(result.deadLettered[0]).toMatchObject({
      kind: "upsert_catalog_batch",
      attempts: 1,
      deliveryStatus: "dead_letter",
      requiresManualResolution: true,
    });
  });

  it("can flush a foreground subset without bypassing leases for other work", async () => {
    await enqueueOutbox("migration_activate", { activation: { id: "migration-1" } });
    await enqueueOutbox("upsert_product", [{ id: "p-1" }]);
    const sent: string[] = [];

    const result = await drainOutbox(
      async (entry) => {
        sent.push(entry.kind);
      },
      {
        workerId: "foreground-migration",
        shouldProcess: (entry) => entry.kind === "migration_activate",
      },
    );

    expect(sent).toEqual(["migration_activate"]);
    expect(result.delivered).toBe(1);
    expect((await db.outbox.toArray()).map((entry) => entry.kind)).toEqual([
      "upsert_product",
    ]);
  });
});
