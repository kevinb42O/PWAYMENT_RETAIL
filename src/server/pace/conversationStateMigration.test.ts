import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260826210000_pace_conversation_state.sql", "utf8");

describe("PACE conversation-state SQL security contract", () => {
  it("stores tenant-scoped conversations, turns, entities and evidence", () => {
    for (const table of ["pace_conversations", "pace_turns", "pace_conversation_entities", "pace_entity_mentions", "pace_evidence_items", "pace_turn_evidence"]) {
      expect(migration).toContain(`create table public.${table}`);
      expect(migration).toContain(`alter table public.${table} enable row level security`);
    }
  });

  it("keeps direct writes closed and exposes bounded authenticated RPCs", () => {
    expect(migration).toContain("revoke all on public.pace_conversations");
    expect(migration).toContain("private.require_pace_conversation");
    expect(migration).toContain("membership.status = 'active'");
    expect(migration).toContain("unique (conversation_id, client_turn_id)");
    expect(migration).toContain("pace-conversation:revision-conflict");
    expect(migration).toContain("jsonb_array_length(evidence_items) > 20");
    expect(migration).toContain("grant execute on function public.start_pace_conversation");
  });

  it("uses an enum resolver instead of model-selected SQL", () => {
    expect(migration).toContain("create or replace function public.resolve_pace_entities");
    expect(migration).toContain("requested_type = 'product'");
    expect(migration).toContain("requested_type = 'customer'");
    expect(migration).not.toMatch(/execute\s+format/i);
  });
});
