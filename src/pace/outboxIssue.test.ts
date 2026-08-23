import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../db/db";
import type { OutboxEntry } from "../types";
import { getPrimaryPaceOutboxIssue, humanizeOutboxIssue } from "./outboxIssue";

const entry = (patch: Partial<OutboxEntry>): OutboxEntry => ({
  timestamp: Date.now(),
  kind: "transaction",
  payload: {},
  attempts: 1,
  deliveryStatus: "dead_letter",
  ...patch,
});

describe("Pace outbox error language", () => {
  beforeEach(async () => {
    if (!db.isOpen()) await db.open();
    await db.outbox.clear();
  });

  it("explains an unconfigured webshop mail provider without technical codes", () => {
    expect(humanizeOutboxIssue(entry({
      kind: "webshop_email",
      lastError: "Webshop e-mail delivery is not configured",
    }))).toEqual({
      summary: "De webshopmail kan niet worden verstuurd omdat er nog geen maildienst is gekoppeld.",
      resolution: "Koppel eerst een mailprovider en probeer deze levering daarna opnieuw.",
    });
  });

  it("translates a rejected product reference into an actionable explanation", () => {
    const issue = humanizeOutboxIssue(entry({
      lastError: "checkout:product-not-found:Product ontbreekt.",
    }));
    expect(issue.summary).toContain("bestaat nog niet op de server");
    expect(issue.resolution).toContain("product eerst");
    expect(issue.summary).not.toContain("product-not-found");
  });

  it("prioritizes a permanently rejected financial row", async () => {
    await db.outbox.bulkAdd([
      entry({ kind: "upsert_product", deliveryStatus: "retrying", lastError: "Failed to fetch" }),
      entry({ kind: "transaction", lastError: "checkout:insufficient-stock" }),
    ]);
    expect(await getPrimaryPaceOutboxIssue()).toMatchObject({
      summary: expect.stringContaining("voorraad"),
    });
  });
});
