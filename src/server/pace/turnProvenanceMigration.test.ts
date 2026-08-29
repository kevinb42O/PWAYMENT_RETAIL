import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260829210000_pace_turn_provenance.sql", "utf8");

describe("Pace turn provenance migration", () => {
  it("rehydrates only bounded public provenance for an authorized conversation", () => {
    expect(migration).toContain("private.require_pace_conversation(target_conversation_id)");
    expect(migration).toContain("turn_row.model_metadata->>'provider'");
    expect(migration).toContain("turn_row.model_metadata->>'model'");
    expect(migration).toContain("public.pace_turn_evidence");
    expect(migration).toContain("public.pace_evidence_items");
    expect(migration).toContain("link.store_id = conversation.store_id");
  });

  it("returns citation metadata without exposing evidence facts or internal plans", () => {
    expect(migration).toContain("'sourceKind', evidence.source_kind");
    expect(migration).toContain("'observedAt', evidence.observed_at");
    expect(migration).toContain("'freshness', case");
    expect(migration).not.toContain("evidence.facts_json");
    expect(migration).not.toContain("turn_row.plan_json");
    expect(migration).not.toContain("'modelMetadata'");
  });
});
