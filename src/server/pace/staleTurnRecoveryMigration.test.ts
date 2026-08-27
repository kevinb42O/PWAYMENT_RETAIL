import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260827153000_recover_stale_pace_turns.sql", "utf8");
const quotaMigration = readFileSync("supabase/migrations/20260826211000_pace_turn_quota_atomicity.sql", "utf8");

describe("PACE stale-turn recovery migration", () => {
  it("removes the fail_pace_turn parameter/column ambiguity", () => {
    expect(migration).toContain("normalized_failure_code text");
    expect(migration).toContain("failure_code = normalized_failure_code");
    expect(migration).not.toMatch(/failure_code\s*=\s*(?:pg_catalog\.)?left\(failure_code/i);
  });

  it("recovers only stale processing turns under the conversation lock", () => {
    const lock = migration.indexOf("where id = target_conversation_id\n  for update");
    const recovery = migration.indexOf("failure_code = 'PACE_TURN_STALE'");
    const activeTurnGuard = migration.indexOf("message = 'pace-conversation:turn-in-progress'");

    expect(lock).toBeGreaterThan(-1);
    expect(recovery).toBeGreaterThan(lock);
    expect(activeTurnGuard).toBeGreaterThan(recovery);
    expect(migration).toContain("stale_turn.status = 'processing'");
    expect(migration).toContain("stale_turn.started_at < pg_catalog.clock_timestamp() - interval '5 minutes'");
  });

  it("checks the client turn id after recovery and before quota consumption", () => {
    const recovery = migration.indexOf("failure_code = 'PACE_TURN_STALE'");
    const idempotency = migration.indexOf("client_turn_id = target_client_turn_id");
    const quota = migration.indexOf("check_and_consume_pace_credit");

    expect(idempotency).toBeGreaterThan(recovery);
    expect(idempotency).toBeLessThan(quota);
    expect(quotaMigration).toContain("create trigger pace_turn_finalize_quota_log");
    expect(quotaMigration).toContain("after update of status on public.pace_turns");
  });
});
