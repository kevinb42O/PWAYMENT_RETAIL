import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../db/db";
import type { Customer, Product, ProductCategory } from "../types";
import type { RetailConfigurationProposal } from "../migration/types";
import {
  executeMigration,
  undoMigrationActivation,
} from "./migrationActivation";

const graph: RetailConfigurationProposal = {
  version: 1,
  sourceFingerprint: "schema-test",
  modules: {},
  nodes: [],
  readinessChecks: [],
  questions: [],
};

const product = (index: number): Product => ({
  id: `product-${index}`,
  name: `Product ${index}`,
  category: "phones",
  priceCents: 1000 + index,
  vatRate: 21,
  stockQty: index,
  isActive: true,
});

const customer = (index: number): Customer => ({
  id: `customer-${index}`,
  name: `Customer ${index}`,
  totalSpentCents: 0,
  visitCount: 0,
  createdAt: new Date(0).toISOString(),
  isActive: true,
});

beforeEach(async () => {
  if (!db.isOpen()) await db.open();
  await Promise.all([
    db.products.clear(),
    db.customers.clear(),
    db.categories.clear(),
    db.migration_activations.clear(),
    db.migration_inverse_changes.clear(),
    db.migration_activity_locks.clear(),
  ]);
});

describe("migration activation and Mode 1 undo", () => {
  it("bulk-activates catalog and customers, then fully removes them before live activity", async () => {
    const products = Array.from({ length: 10 }, (_, index) => product(index + 1));
    const customers = Array.from({ length: 5 }, (_, index) => customer(index + 1));
    const categories: ProductCategory[] = [{ id: "phones", name: "Phones", vatRate: 21, isActive: true }];

    const execution = await executeMigration("store-1", graph, products, customers, categories);

    expect(execution.productCount).toBe(10);
    expect(execution.customerCount).toBe(5);
    expect(execution.categoryCount).toBe(1);
    expect(execution.activation.status).toBe("active");
    expect(await db.products.count()).toBe(10);
    expect(await db.customers.count()).toBe(5);
    expect(await db.categories.count()).toBe(1);
    expect(await db.migration_inverse_changes.where("migrationId").equals(execution.activation.id).count()).toBe(16);
    expect(await db.migration_inverse_changes.where("migrationId").equals(execution.activation.id).toArray()).toEqual(expect.arrayContaining([
      expect.objectContaining({ actionType: "delete-created", entityType: "product", entityId: "product-1" }),
      expect.objectContaining({ actionType: "delete-created", entityType: "customer", entityId: "customer-1" }),
      expect.objectContaining({ actionType: "delete-created", entityType: "category", entityId: "phones" }),
    ]));

    await undoMigrationActivation("store-1", execution.activation.id);

    expect(await db.products.count()).toBe(0);
    expect(await db.customers.count()).toBe(0);
    expect(await db.categories.count()).toBe(0);
    const undone = await db.migration_activations.get(execution.activation.id);
    expect(undone).toMatchObject({ status: "undone" });
    expect(undone?.firstMeaningfulActivityAt).toBeUndefined();
  });
});
