import { db } from "../db/db";
import type {
  Customer,
  MigrationActivation,
  MigrationEntityType,
  MigrationInverseChange,
  MigrationJson,
  Product,
  ProductCategory,
} from "../types";
import type { RetailConfigurationProposal } from "../migration/types";

export class MigrationActivationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MigrationActivationError";
  }
}

export interface MigrationExecutionResult {
  activation: MigrationActivation;
  productCount: number;
  customerCount: number;
  categoryCount: number;
}

const assertDistinctIds = (
  values: Array<{ id: string }>,
  entity: string,
) => {
  const seen = new Set<string>();
  for (const value of values) {
    if (!value.id?.trim()) {
      throw new MigrationActivationError(`${entity} heeft geen geldige identificatie.`);
    }
    if (seen.has(value.id)) {
      throw new MigrationActivationError(`Dubbele ${entity}-identificatie in de migratie: ${value.id}.`);
    }
    seen.add(value.id);
  }
};

const inverseChangesFor = (
  migrationId: string,
  categories: ProductCategory[],
  products: Product[],
  customers: Customer[],
  createdAt: number,
): MigrationInverseChange[] => [
  ...categories.map((category, sequence) => ({
    id: globalThis.crypto.randomUUID(),
    migrationId,
    sequence,
    actionType: "delete-created" as const,
    entityType: "category" as const,
    entityId: category.id,
    beforeImageOrInversePayload: { createdByMigration: true },
    createdAt,
  })),
  ...products.map((product, sequence) => ({
    id: globalThis.crypto.randomUUID(),
    migrationId,
    sequence: categories.length + sequence,
    actionType: "delete-created" as const,
    entityType: "product" as const,
    entityId: product.id,
    beforeImageOrInversePayload: { createdByMigration: true },
    createdAt,
  })),
  ...customers.map((customer, index) => ({
    id: globalThis.crypto.randomUUID(),
    migrationId,
    sequence: categories.length + products.length + index,
    actionType: "delete-created" as const,
    entityType: "customer" as const,
    entityId: customer.id,
    beforeImageOrInversePayload: { createdByMigration: true },
    createdAt,
  })),
];

/**
 * Activates a creation-only migration in one Dexie transaction. V1 refuses
 * overwrite semantics: an existing ID aborts the entire activation, which is
 * safer than producing an inverse that could erase a pre-existing record.
 */
export const executeMigration = async (
  storeId: string,
  configGraph: RetailConfigurationProposal,
  mappedProducts: Product[],
  mappedCustomers: Customer[],
  mappedCategories: ProductCategory[] = [],
): Promise<MigrationExecutionResult> => {
  const normalizedStoreId = storeId.trim();
  if (!normalizedStoreId) {
    throw new MigrationActivationError("Een winkel is vereist om de migratie te activeren.");
  }
  if (mappedProducts.length + mappedCustomers.length === 0) {
    throw new MigrationActivationError("De migratie bevat geen producten of klanten.");
  }
  assertDistinctIds(mappedProducts, "product");
  assertDistinctIds(mappedCustomers, "klant");
  assertDistinctIds(mappedCategories, "categorie");

  const now = Date.now();
  const migrationId = globalThis.crypto.randomUUID();
  const activation: MigrationActivation = {
    id: migrationId,
    storeId: normalizedStoreId,
    status: "active",
    graphVersion: configGraph.version,
    answersJson: {},
    receiptJson: {
      receiptVersion: 1,
      sourceFingerprint: configGraph.sourceFingerprint,
      configurationGraph: configGraph as unknown as MigrationJson,
      createdProducts: mappedProducts.length,
      createdCustomers: mappedCustomers.length,
      createdCategories: mappedCategories.length,
    },
    activatedAt: now,
    createdAt: now,
    updatedAt: now,
  };
  const inverseChanges = inverseChangesFor(
    migrationId,
    mappedCategories,
    mappedProducts,
    mappedCustomers,
    now,
  );

  return db.transaction(
    "rw",
    [
      db.products,
      db.customers,
      db.categories,
      db.migration_activations,
      db.migration_inverse_changes,
    ],
    async () => {
      const active = await db.migration_activations
        .where("[storeId+status]")
        .equals([normalizedStoreId, "active"])
        .first();
      if (active) {
        throw new MigrationActivationError("Deze winkel heeft al een actieve migratie die eerst moet worden afgerond of ongedaan gemaakt.");
      }

      await db.migration_activations.add(activation);
      // bulkAdd intentionally fails when a mapped ID already exists. Because
      // every operation is in this transaction, no activation or partial rows
      // (including the activation receipt) survive a collision.
      if (mappedCategories.length > 0) await db.categories.bulkAdd(mappedCategories);
      if (mappedProducts.length > 0) await db.products.bulkAdd(mappedProducts);
      if (mappedCustomers.length > 0) await db.customers.bulkAdd(mappedCustomers);
      if (inverseChanges.length > 0) {
        await db.migration_inverse_changes.bulkAdd(inverseChanges);
      }

      return {
        activation,
        productCount: mappedProducts.length,
        customerCount: mappedCustomers.length,
        categoryCount: mappedCategories.length,
      };
    },
  );
};

const collectDeleteTargets = (
  changes: MigrationInverseChange[],
  entityType: MigrationEntityType,
): string[] => changes
  .filter((change) => change.actionType === "delete-created" && change.entityType === entityType)
  .map((change) => change.entityId);

/**
 * Mode 1 full undo. This is deliberately narrow: it only accepts a still
 * active, unsealed migration composed exclusively of V1 delete-created
 * inverses for products and customers. Unknown actions abort the whole
 * transaction rather than leaving a partial undo.
 */
export const undoMigrationActivation = async (
  storeId: string,
  migrationId: string,
): Promise<void> => {
  const normalizedStoreId = storeId.trim();
  if (!normalizedStoreId || !migrationId.trim()) {
    throw new MigrationActivationError("Winkel en migratie zijn vereist om ongedaan te maken.");
  }

  await db.transaction(
    "rw",
    [
      db.products,
      db.customers,
      db.categories,
      db.migration_activations,
      db.migration_inverse_changes,
    ],
    async () => {
      const activation = await db.migration_activations.get(migrationId);
      if (!activation || activation.storeId !== normalizedStoreId) {
        throw new MigrationActivationError("Deze migratie bestaat niet voor de huidige winkel.");
      }
      if (activation.status !== "active" || activation.firstMeaningfulActivityAt != null) {
        throw new MigrationActivationError("Deze migratie is al verzegeld door live activiteit en kan niet volledig ongedaan worden gemaakt.");
      }

      const changes = (await db.migration_inverse_changes
        .where("migrationId")
        .equals(migrationId)
        .toArray())
        .sort((left, right) => right.sequence - left.sequence);
      const unsupported = changes.find(
        (change) => change.actionType !== "delete-created"
          || !["category", "product", "customer"].includes(change.entityType),
      );
      if (unsupported) {
        throw new MigrationActivationError(`Deze migratie bevat een nog niet ondersteunde inverse actie (${unsupported.actionType} op ${unsupported.entityType}).`);
      }

      const productIds = [...new Set(collectDeleteTargets(changes, "product"))];
      const customerIds = [...new Set(collectDeleteTargets(changes, "customer"))];
      const categoryIds = [...new Set(collectDeleteTargets(changes, "category"))];
      if (productIds.length > 0) await db.products.bulkDelete(productIds);
      if (customerIds.length > 0) await db.customers.bulkDelete(customerIds);
      if (categoryIds.length > 0) await db.categories.bulkDelete(categoryIds);
      await db.migration_activations.put({
        ...activation,
        status: "undone",
        undoneAt: Date.now(),
        updatedAt: Date.now(),
      });
    },
  );
};
