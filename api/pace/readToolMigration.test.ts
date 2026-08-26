import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260826200000_pace_read_tool_gateway.sql", "utf8");

describe("PACE read-tool SQL security contract", () => {
  it("binds every call to active tenant membership and an enum tool registry", () => {
    expect(migration).toContain("not private.is_store_member(target_store_id)");
    expect(migration).toContain("membership.status = 'active'");
    expect(migration).toContain("pace-ai:invalid-read-tool");
    expect(migration).not.toMatch(/\bexecute\s+(?:format|tool_call|requested_)/i);
  });

  it("keeps all five tool branches store-scoped and bounded", () => {
    for (const name of [
      "sales.vat_breakdown",
      "sales.tender_breakdown",
      "gift_cards.summary",
      "workforce.leave_summary",
      "inventory.location_stock",
    ]) expect(migration).toContain(`'${name}'`);
    expect(migration.match(/store_id = target_store_id/g)?.length).toBeGreaterThanOrEqual(8);
    expect(migration).toContain("least(25, greatest(1");
  });

  it("enforces least privilege for workforce and inventory cost", () => {
    expect(migration).toContain("employee.user_id = actor_id");
    expect(migration).toContain("actor_role in ('owner', 'manager') then product.cost_price_cents");
    expect(migration).toContain("revoke all on function public.get_pace_read_tool_context");
  });
});
