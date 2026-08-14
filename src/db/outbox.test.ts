import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "./db";
import { drainOutbox, enqueueOutbox } from "./outbox";

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

  it("records a failed attempt and leaves later entries untouched for ordered retry", async () => {
    await enqueueOutbox("upsert_product", [{ id: "p-1" }]);
    await enqueueOutbox("upsert_customer", [{ id: "c-1" }]);
    const send = vi.fn().mockRejectedValueOnce(new Error("offline"));

    await drainOutbox(send);

    expect(send).toHaveBeenCalledTimes(1);
    const entries = await db.outbox.orderBy("id").toArray();
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ attempts: 1, lastError: "offline" });
    expect(entries[1].attempts).toBe(0);
  });
});
