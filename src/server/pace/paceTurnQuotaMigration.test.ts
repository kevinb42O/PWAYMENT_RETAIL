import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260826211000_pace_turn_quota_atomicity.sql", "utf8");

describe("PACE turn/quota atomicity migration", () => {
  it("checks idempotency before consuming and links the quota log", () => {
    expect(migration.indexOf("client_turn_id = target_client_turn_id")).toBeLessThan(migration.indexOf("check_and_consume_pace_credit"));
    expect(migration).toContain("conversation.id::text || ':' || target_client_turn_id::text");
    expect(migration).toContain("quota_log_id = quota_log");
    expect(migration).toContain("status = 'failed'");
    expect(migration).toContain("create trigger pace_turn_finalize_quota_log");
    expect(migration).toContain("where id = new.quota_log_id and status = 'reserved'");
  });
});
