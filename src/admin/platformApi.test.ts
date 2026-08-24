import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/supabase", () => ({
  supabase: { rpc: vi.fn() },
}));

import { supabase } from "../lib/supabase";
import {
  getPlatformOverview,
  listPlatformAuditEntries,
  listPlatformDevelopmentUpdates,
  listPlatformIncidents,
  listPlatformMembers,
  listPlatformReleases,
  listPlatformStores,
} from "./platformApi";

const rpc = vi.mocked(supabase.rpc);

const store = (id: string, isDemo: boolean) => ({
  id,
  name: isDemo ? "Voorbeeldwinkel" : "Echte winkel",
  is_demo: isDemo,
  created_at: "2026-08-24T12:00:00Z",
  plan_code: "basic",
  subscription_status: "trialing",
  last_active_at: null,
  last_sync_at: null,
  health_status: "not_activated" as const,
  health_reason: "Wacht op eerste activatie",
  data_coverage_status: "not_activated" as const,
  open_incidents: 0,
  pending_queue_count: 0,
});

describe("platform store data provenance", () => {
  beforeEach(() => rpc.mockReset());

  it("never substitutes example stores when the server call fails", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "RPC niet beschikbaar" } } as never);

    await expect(listPlatformStores("", "")).rejects.toThrow("RPC niet beschikbaar");
  });

  it("filters demo tenants even before the database migration is deployed", async () => {
    rpc.mockResolvedValue({
      data: { items: [store("real", false), store("demo", true)] },
      error: null,
    } as never);

    await expect(listPlatformStores("", "")).resolves.toEqual({
      items: [store("real", false)],
    });
  });

  it("normalizes empty or incomplete list responses instead of crashing admin routes", async () => {
    rpc.mockResolvedValue({ data: {}, error: null } as never);

    await expect(listPlatformIncidents()).resolves.toEqual({ items: [] });
    await expect(listPlatformMembers()).resolves.toEqual([]);
    await expect(listPlatformReleases()).resolves.toEqual([]);
    await expect(listPlatformAuditEntries()).resolves.toEqual({ items: [] });
    await expect(listPlatformDevelopmentUpdates()).resolves.toEqual({ items: [], next_cursor: null });
  });

  it("supplies a complete zero-state overview for partial server metrics", async () => {
    rpc.mockResolvedValue({ data: { metrics: {} }, error: null } as never);

    await expect(getPlatformOverview()).resolves.toMatchObject({
      metrics: {
        active_stores_24h: 0,
        health: { healthy: 0, not_activated: 0 },
        subscriptions: { active: 0, trialing: 0, past_due: 0 },
      },
      incidents: [],
      priority_stores: [],
    });
  });
});
