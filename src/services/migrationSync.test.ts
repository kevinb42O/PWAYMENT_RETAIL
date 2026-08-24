import { describe, expect, it, vi } from "vitest";
import type { OutboxEntry } from "../types";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("../lib/supabase", () => ({
  isSupabaseConfigured: true,
  supabase: { rpc },
}));

describe("retail catalog migration delivery", () => {
  it("binds relational catalog data to the creation-only activation receipt", async () => {
    rpc.mockReset();
    rpc.mockResolvedValue({ error: null });
    const { pushMigrationOutboxEntry } = await import("./migrationSync");
    const entry: OutboxEntry = {
      id: 1,
      timestamp: 0,
      kind: "migration_activate",
      attempts: 0,
      payload: {
        activation: {
          id: "activation-1",
          storeId: "store-1",
          status: "active",
          graphVersion: 1,
          answersJson: {},
          receiptJson: {},
          activatedAt: 0,
          createdAt: 0,
          updatedAt: 0,
        },
        categories: [{ id: "child-category-1", parentId: "root-category-1", name: "Android", vatRate: 21 }],
        products: [],
        customers: [],
        inverseChanges: [],
        catalogFamilies: [{
          externalId: "family-1",
          name: "T-shirt",
          variants: [{
            productExternalId: "product-1",
            options: [],
            identifiers: [],
          }],
        }],
      },
    };

    await pushMigrationOutboxEntry("store-1", entry);

    expect(rpc).toHaveBeenNthCalledWith(1, "apply_migration_activation", {
      target_store_id: "store-1",
      migration_payload: entry.payload,
    });
    expect(rpc).toHaveBeenNthCalledWith(2, "apply_migration_category_relations", {
      target_store_id: "store-1",
      relations_payload: {
        activationId: "activation-1",
        categories: (entry.payload as { categories: unknown }).categories,
      },
    });
    expect(rpc).toHaveBeenNthCalledWith(3, "apply_retail_catalog_relations", {
      target_store_id: "store-1",
      relations_payload: {
        activationId: "activation-1",
        families: (entry.payload as { catalogFamilies: unknown }).catalogFamilies,
      },
    });
  });

  it("accepts one atomic server acknowledgement without replaying legacy relation RPCs", async () => {
    rpc.mockReset();
    rpc.mockResolvedValue({
      data: { taxonomy_atomic: true, catalog_relations_atomic: true },
      error: null,
    });
    const { pushMigrationOutboxEntry } = await import("./migrationSync");
    const entry: OutboxEntry = {
      id: 2,
      timestamp: 0,
      kind: "migration_activate",
      attempts: 0,
      payload: {
        activation: {
          id: "activation-atomic",
          storeId: "store-1",
          status: "active",
          graphVersion: 1,
          answersJson: {},
          receiptJson: {},
          activatedAt: 0,
          createdAt: 0,
          updatedAt: 0,
        },
        categories: [
          { id: "services", name: "Services", vatRate: 21 },
          { id: "services-maintenance", parentId: "services", name: "Onderhoud", vatRate: 21 },
        ],
        products: [],
        customers: [],
        inverseChanges: [],
        catalogFamilies: [{
          externalId: "family-atomic",
          name: "Onderhoud",
          categoryExternalId: "services-maintenance",
          variants: [],
        }],
      },
    };

    await pushMigrationOutboxEntry("store-1", entry);

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("apply_migration_activation", {
      target_store_id: "store-1",
      migration_payload: entry.payload,
    });
  });
});
