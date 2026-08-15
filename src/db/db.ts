import Dexie, { Table } from "dexie";
import {
  AuditEntry,
  BusinessAction,
  Customer,
  DailyReport,
  GiftCard,
  GiftCardEvent,
  ImportJob,
  ImportMappingProfile,
  MigrationActivation,
  MigrationActivityLock,
  MigrationInverseChange,
  OutboxEntry,
  PurchaseOrder,
  Product,
  ProductCategory,
  RegisterShift,
  ServiceOrder,
  StockMovement,
  Transaction,
  User,
  VoidEntry,
  WebshopOrder,
} from "../types";

/**
 * IndexedDB schema for PWAyment.
 *
 * Migrations:
 *  v1 - initial transactions table
 *  v2 - add isFinalized + daily_reports
 *  v3 - convert money fields to integer cents,
 *       add audit, users, outbox, prevHash chain on daily_reports
 *  v4 - add shifts + voids tables, link transactions/reports to a shift,
 *       add tip + tendered cents on transactions, add totalTipsCents on reports.
 *  v5 - persisted products table (admin CRUD).
 *  v10 - unique clientRequestId on transactions (checkout idempotency).
 *  v11 - append-only gift-card event ledger for complete balance and usage history.
 */
/**
 * Unique per-project database name. The old shared name 'POSDatabase' collided
 * with pwayment_horeca on the same localhost origin, letting foreign rows leak in.
 */
export const DB_NAME = "PwaymentRetailPOS";

const tenantDatabaseName = (storeId: string | null): string =>
  storeId ? `${DB_NAME}:${storeId}` : DB_NAME;

export class POSDatabase extends Dexie {
  transactions!: Table<Transaction, number>;
  daily_reports!: Table<DailyReport, number>;
  audit!: Table<AuditEntry, number>;
  users!: Table<User, string>;
  outbox!: Table<OutboxEntry, number>;
  shifts!: Table<RegisterShift, number>;
  voids!: Table<VoidEntry, number>;
  products!: Table<Product, string>;
  categories!: Table<ProductCategory, string>;
  customers!: Table<Customer, string>;
  gift_cards!: Table<GiftCard, string>;
  gift_card_events!: Table<GiftCardEvent, string>;
  business_actions!: Table<BusinessAction, string>;
  purchase_orders!: Table<PurchaseOrder, string>;
  stock_movements!: Table<StockMovement, number>;
  webshop_orders!: Table<WebshopOrder, string>;
  import_jobs!: Table<ImportJob, string>;
  import_mapping_profiles!: Table<ImportMappingProfile, string>;
  migration_activations!: Table<MigrationActivation, string>;
  migration_inverse_changes!: Table<MigrationInverseChange, string>;
  migration_activity_locks!: Table<MigrationActivityLock, string>;
  service_orders!: Table<ServiceOrder, string>;

  constructor(databaseName = DB_NAME) {
    super(databaseName);

    this.version(1).stores({
      transactions: "++id, tableId, paymentMethod, timestamp",
    });

    this.version(2)
      .stores({
        transactions: "++id, tableId, paymentMethod, timestamp, isFinalized",
        daily_reports: "++id, reportNumber, timestamp",
      })
      .upgrade((tx) =>
        tx
          .table("transactions")
          .toCollection()
          .modify((t: { isFinalized?: number }) => {
            t.isFinalized = 0;
          }),
      );

    this.version(3)
      .stores({
        transactions:
          "++id, tableId, paymentMethod, timestamp, isFinalized, userId",
        daily_reports: "++id, reportNumber, timestamp",
        audit: "++id, timestamp, userId, action",
        users: "id, role",
        outbox: "++id, timestamp, kind",
      })
      .upgrade(async (tx) => {
        // Convert legacy float money fields to integer cents on existing rows.
        await tx
          .table("transactions")
          .toCollection()
          .modify((row: Record<string, unknown>) => {
            const r = row as Record<string, number | undefined>;
            if (r.subtotalCents == null && typeof r.subtotal === "number") {
              r.subtotalCents = Math.round(r.subtotal * 100);
              r.vat12Cents = Math.round((r.vat12 ?? 0) * 100);
              r.vat21Cents = Math.round((r.vat21 ?? 0) * 100);
              r.totalCents = Math.round((r.total ?? 0) * 100);
              r.discountCents = Math.round((r.discount ?? 0) * 100);
              delete r.subtotal;
              delete r.vat12;
              delete r.vat21;
              delete r.total;
              delete r.discount;
            }
          });

        await tx
          .table("daily_reports")
          .toCollection()
          .modify((row: Record<string, unknown>) => {
            const r = row as Record<string, unknown>;
            const num = (k: string) =>
              Math.round(((r[k] as number) ?? 0) * 100);
            if (
              r.totalRevenueCents == null &&
              typeof r.totalRevenue === "number"
            ) {
              r.totalRevenueCents = num("totalRevenue");
              r.totalVat12Cents = num("totalVat12");
              r.totalVat21Cents = num("totalVat21");
              r.totalExclVat12Cents = num("totalExclVat12");
              r.totalExclVat21Cents = num("totalExclVat21");
              r.totalDiscountCents = num("totalDiscount");
              const pt = r.paymentTotals as
                { Cash?: number; PIN?: number } | undefined;
              r.paymentTotalsCents = {
                Cash: Math.round((pt?.Cash ?? 0) * 100),
                PIN: Math.round((pt?.PIN ?? 0) * 100),
              };
              r.prevHash = r.prevHash ?? null;
              delete r.totalRevenue;
              delete r.totalVat12;
              delete r.totalVat21;
              delete r.totalExclVat12;
              delete r.totalExclVat21;
              delete r.totalDiscount;
              delete r.paymentTotals;
            }
          });
      });

    this.version(4)
      .stores({
        transactions:
          "++id, tableId, paymentMethod, timestamp, isFinalized, userId, shiftId",
        daily_reports: "++id, reportNumber, timestamp, shiftId",
        audit: "++id, timestamp, userId, action",
        users: "id, role",
        outbox: "++id, timestamp, kind",
        shifts: "++id, shiftNumber, openedAt, closedAt",
        voids: "++id, timestamp, tableId, productId, byUserId",
      })
      .upgrade(async (tx) => {
        await tx
          .table("daily_reports")
          .toCollection()
          .modify((row: Record<string, unknown>) => {
            if (row.totalTipsCents == null) row.totalTipsCents = 0;
          });
      });

    this.version(5).stores({
      transactions:
        "++id, tableId, paymentMethod, timestamp, isFinalized, userId, shiftId",
      daily_reports: "++id, reportNumber, timestamp, shiftId",
      audit: "++id, timestamp, userId, action",
      users: "id, role",
      outbox: "++id, timestamp, kind",
      shifts: "++id, shiftNumber, openedAt, closedAt",
      voids: "++id, timestamp, tableId, productId, byUserId",
      products: "id, category, isActive",
    });

    this.version(6)
      .stores({
        transactions:
          "++id, tableId, paymentMethod, timestamp, isFinalized, userId, shiftId",
        daily_reports: "++id, reportNumber, timestamp, shiftId",
        audit: "++id, timestamp, userId, action",
        users: "id, role",
        outbox: "++id, timestamp, kind",
        shifts: "++id, shiftNumber, openedAt, closedAt",
        voids: "++id, timestamp, tableId, productId, byUserId",
        products: "id, category, isActive",
        categories: "id, name, isActive",
      })
      .upgrade(async (tx) => {
        const products = (await tx.table("products").toArray()) as Product[];
        const uniqueNames = Array.from(
          new Set(products.map((p) => p.category).filter(Boolean)),
        );
        if (uniqueNames.length === 0) return;

        const categories: ProductCategory[] = uniqueNames.map((name) => ({
          id:
            name
              .toLowerCase()
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/^-|-$/g, "") || "cat",
          name,
          vatRate: 21,
          isActive: true,
        }));
        await tx.table("categories").bulkPut(categories);
      });

    this.version(7).stores({
      transactions:
        "++id, tableId, paymentMethod, timestamp, isFinalized, userId, shiftId",
      daily_reports: "++id, reportNumber, timestamp, shiftId",
      audit: "++id, timestamp, userId, action",
      users: "id, role",
      outbox: "++id, timestamp, kind",
      shifts: "++id, shiftNumber, openedAt, closedAt",
      voids: "++id, timestamp, tableId, productId, byUserId",
      products: "id, category, isActive",
      categories: "id, name, isActive",
      customers: "id, name, email, phone, isActive",
      gift_cards: "id, customerId, code, isActive",
    });

    this.version(8).stores({
      transactions:
        "++id, tableId, paymentMethod, timestamp, isFinalized, userId, shiftId",
      daily_reports: "++id, reportNumber, timestamp, shiftId",
      audit: "++id, timestamp, userId, action",
      users: "id, role",
      outbox: "++id, timestamp, kind",
      shifts: "++id, shiftNumber, openedAt, closedAt",
      voids: "++id, timestamp, tableId, productId, byUserId",
      products: "id, category, isActive",
      categories: "id, name, isActive",
      customers: "id, email, phone, isActive",
      gift_cards: "id, customerId, code, isActive",
      business_actions:
        "id, type, status, createdAt, updatedAt, dueAt, ownerUserId",
    });

    this.version(9).stores({
      transactions:
        "++id, tableId, paymentMethod, timestamp, isFinalized, userId, shiftId",
      daily_reports: "++id, reportNumber, timestamp, shiftId",
      audit: "++id, timestamp, userId, action",
      users: "id, role",
      outbox: "++id, timestamp, kind",
      shifts: "++id, shiftNumber, openedAt, closedAt",
      voids: "++id, timestamp, tableId, productId, byUserId",
      products: "id, category, isActive",
      categories: "id, name, isActive",
      customers: "id, email, phone, isActive",
      gift_cards: "id, customerId, code, isActive",
      business_actions:
        "id, type, status, createdAt, updatedAt, dueAt, ownerUserId",
      purchase_orders:
        "id, supplier, status, createdAt, updatedAt, expectedDeliveryAt",
      stock_movements: "++id, productId, reason, timestamp, purchaseOrderId",
    });

    this.version(10).stores({
      transactions:
        "++id, tableId, paymentMethod, timestamp, isFinalized, userId, shiftId, &clientRequestId",
      daily_reports: "++id, reportNumber, timestamp, shiftId",
      audit: "++id, timestamp, userId, action",
      users: "id, role",
      outbox: "++id, timestamp, kind",
      shifts: "++id, shiftNumber, openedAt, closedAt",
      voids: "++id, timestamp, tableId, productId, byUserId",
      products: "id, category, isActive",
      categories: "id, name, isActive",
      customers: "id, email, phone, isActive",
      gift_cards: "id, customerId, code, isActive",
      business_actions:
        "id, type, status, createdAt, updatedAt, dueAt, ownerUserId",
      purchase_orders:
        "id, supplier, status, createdAt, updatedAt, expectedDeliveryAt",
      stock_movements: "++id, productId, reason, timestamp, purchaseOrderId",
    });

    this.version(11)
      .stores({
        transactions:
          "++id, tableId, paymentMethod, timestamp, isFinalized, userId, shiftId, &clientRequestId",
        daily_reports: "++id, reportNumber, timestamp, shiftId",
        audit: "++id, timestamp, userId, action",
        users: "id, role",
        outbox: "++id, timestamp, kind",
        shifts: "++id, shiftNumber, openedAt, closedAt",
        voids: "++id, timestamp, tableId, productId, byUserId",
        products: "id, category, isActive",
        categories: "id, name, isActive",
        customers: "id, email, phone, isActive",
        gift_cards: "id, customerId, code, isActive",
        gift_card_events:
          "id, giftCardId, timestamp, type, transactionId, dailyReportId, [giftCardId+timestamp]",
        business_actions:
          "id, type, status, createdAt, updatedAt, dueAt, ownerUserId",
        purchase_orders:
          "id, supplier, status, createdAt, updatedAt, expectedDeliveryAt",
        stock_movements: "++id, productId, reason, timestamp, purchaseOrderId",
      })
      .upgrade(async (tx) => {
        const cards = (await tx.table("gift_cards").toArray()) as GiftCard[];
        const migratedAt = Date.now();
        if (cards.length === 0) return;
        const events: GiftCardEvent[] = cards.map((card, index) => ({
          id: `migration-opening-${card.id}`,
          giftCardId: card.id,
          giftCardCode: card.code,
          type: "opening-balance",
          amountCents: card.balanceCents,
          balanceBeforeCents: card.balanceCents,
          balanceAfterCents: card.balanceCents,
          timestamp: migratedAt + index,
          customerId: card.customerId,
          source: "migration",
          note: "Beginsaldo bij activering van de cadeaubonhistoriek; eerdere details waren niet opgeslagen.",
        }));
        await tx.table("gift_card_events").bulkPut(events);
      });

    this.version(12).stores({
      transactions:
        "++id, tableId, paymentMethod, timestamp, isFinalized, userId, shiftId, &clientRequestId",
      daily_reports: "++id, reportNumber, timestamp, shiftId",
      audit: "++id, timestamp, userId, action",
      users: "id, role",
      outbox: "++id, timestamp, kind",
      shifts: "++id, shiftNumber, openedAt, closedAt",
      voids: "++id, timestamp, tableId, productId, byUserId",
      products: "id, category, isActive",
      categories: "id, name, isActive",
      customers: "id, email, phone, isActive",
      gift_cards: "id, customerId, code, isActive",
      gift_card_events:
        "id, giftCardId, timestamp, type, transactionId, [giftCardId+timestamp]",
      business_actions:
        "id, type, status, createdAt, updatedAt, dueAt, ownerUserId",
      purchase_orders:
        "id, supplier, status, createdAt, updatedAt, expectedDeliveryAt",
      stock_movements: "++id, productId, reason, timestamp, purchaseOrderId",
      webshop_orders:
        "id, &clientRequestId, &number, createdAt, updatedAt, status, paymentStatus, fulfillmentStatus, source",
    });

    this.version(13)
      .stores({
        transactions:
          "++id, tableId, paymentMethod, timestamp, isFinalized, userId, shiftId, registerId, kind, originalTransactionId, documentNumber, &clientRequestId",
        daily_reports: "++id, &reportNumber, timestamp, shiftId, registerId",
        audit: "++id, timestamp, userId, action",
        users: "id, role",
        outbox: "++id, timestamp, kind",
        shifts:
          "++id, &shiftNumber, registerId, status, openedAt, closedAt, [registerId+status]",
        voids: "++id, timestamp, tableId, productId, byUserId",
        products: "id, category, isActive, productType",
        categories: "id, name, isActive",
        customers: "id, email, phone, isActive",
        gift_cards: "id, customerId, code, isActive",
        gift_card_events:
          "id, giftCardId, timestamp, type, transactionId, dailyReportId, [giftCardId+timestamp]",
        business_actions:
          "id, type, status, createdAt, updatedAt, dueAt, ownerUserId",
        purchase_orders:
          "id, supplier, status, createdAt, updatedAt, expectedDeliveryAt",
        stock_movements:
          "++id, productId, reason, timestamp, purchaseOrderId, transactionId",
        webshop_orders:
          "id, &clientRequestId, &number, createdAt, updatedAt, status, paymentStatus, fulfillmentStatus, source",
      })
      .upgrade(async (tx) => {
        await tx
          .table("transactions")
          .toCollection()
          .modify((row: Transaction) => {
            const legacyTenders = row.tenders ?? row.splitTenders;
            if (!row.tenders && legacyTenders?.length)
              row.tenders = legacyTenders;
            if (!row.tenders && row.paymentMethod !== "Split") {
              row.tenders = [
                { method: row.paymentMethod, amountCents: row.totalCents },
              ];
            }
            row.kind ??= "sale";
            row.source ??= "live";
            row.registerId ??= "retail-register-1";
            if (!row.documentNumber && row.id != null) {
              const year = new Date(row.timestamp).getFullYear();
              row.documentNumber = `POS-${year}-${String(row.id).padStart(8, "0")}`;
            }
          });
        await tx
          .table("products")
          .toCollection()
          .modify((product: Product) => {
            if (product.productType) return;
            const subCategory =
              product.subCategory?.toLocaleLowerCase("nl-BE") ?? "";
            const name = product.name.toLocaleLowerCase("nl-BE");
            product.productType =
              subCategory === "cadeaubonnen" ||
              name === "gift card" ||
              name === "cadeaubon"
                ? "gift-card"
                : product.category === "services"
                  ? "service"
                  : "merchandise";
          });
      });

    this.version(14).stores({
      transactions:
        "++id, tableId, paymentMethod, timestamp, isFinalized, userId, shiftId, registerId, kind, source, originalTransactionId, documentNumber, &clientRequestId",
      daily_reports: "++id, &reportNumber, timestamp, shiftId, registerId",
      audit: "++id, timestamp, userId, action",
      users: "id, role",
      outbox: "++id, timestamp, kind",
      shifts:
        "++id, &shiftNumber, registerId, status, openedAt, closedAt, [registerId+status]",
      voids: "++id, timestamp, tableId, productId, byUserId",
      products: "id, category, isActive, productType",
      categories: "id, name, isActive",
      customers: "id, email, phone, isActive",
      gift_cards: "id, customerId, code, isActive",
      gift_card_events:
        "id, giftCardId, timestamp, type, source, transactionId, dailyReportId, [giftCardId+timestamp]",
      business_actions:
        "id, type, status, createdAt, updatedAt, dueAt, ownerUserId",
      purchase_orders:
        "id, supplier, status, createdAt, updatedAt, expectedDeliveryAt",
      stock_movements:
        "++id, productId, reason, timestamp, purchaseOrderId, transactionId",
      webshop_orders:
        "id, &clientRequestId, &number, createdAt, updatedAt, status, paymentStatus, fulfillmentStatus, source",
    });

    this.version(15).stores({
      transactions:
        "++id, tableId, paymentMethod, timestamp, isFinalized, userId, shiftId, registerId, kind, source, originalTransactionId, documentNumber, &clientRequestId",
      daily_reports: "++id, &reportNumber, timestamp, shiftId, registerId",
      audit: "++id, timestamp, userId, action",
      users: "id, role",
      outbox: "++id, timestamp, kind",
      shifts:
        "++id, &shiftNumber, registerId, status, openedAt, closedAt, [registerId+status]",
      voids: "++id, timestamp, tableId, productId, byUserId",
      products: "id, category, isActive, productType, supplierCode",
      categories: "id, name, isActive",
      customers: "id, email, phone, priceGroup, isActive",
      gift_cards: "id, customerId, code, isActive",
      gift_card_events:
        "id, giftCardId, timestamp, type, source, transactionId, dailyReportId, [giftCardId+timestamp]",
      business_actions:
        "id, type, status, createdAt, updatedAt, dueAt, ownerUserId",
      purchase_orders:
        "id, supplier, status, createdAt, updatedAt, expectedDeliveryAt",
      stock_movements:
        "++id, productId, reason, timestamp, purchaseOrderId, transactionId",
      webshop_orders:
        "id, &clientRequestId, &number, createdAt, updatedAt, status, paymentStatus, fulfillmentStatus, source",
      import_jobs: "id, createdAt, status, fileName, profileId",
      import_mapping_profiles: "id, name, format, updatedAt, lastUsedAt",
      service_orders:
        "id, &number, &trackingToken, createdAt, updatedAt, status, substatus, route, customerId, customerEmail, customerPhone, identifierValue",
    });

    this.version(16).stores({
      transactions:
        "++id, tableId, paymentMethod, timestamp, isFinalized, userId, shiftId, registerId, kind, source, originalTransactionId, documentNumber, &clientRequestId",
      daily_reports: "++id, &reportNumber, timestamp, shiftId, registerId",
      audit: "++id, timestamp, userId, action",
      users: "id, role",
      outbox: "++id, timestamp, kind",
      shifts:
        "++id, &shiftNumber, registerId, status, openedAt, closedAt, [registerId+status]",
      voids: "++id, timestamp, tableId, productId, byUserId",
      products: "id, category, isActive, productType, supplierCode",
      categories: "id, name, isActive",
      customers: "id, email, phone, priceGroup, isActive",
      gift_cards: "id, customerId, code, isActive",
      gift_card_events:
        "id, giftCardId, timestamp, type, source, transactionId, dailyReportId, [giftCardId+timestamp]",
      business_actions:
        "id, type, status, createdAt, updatedAt, dueAt, ownerUserId",
      purchase_orders:
        "id, supplier, status, createdAt, updatedAt, expectedDeliveryAt",
      stock_movements:
        "++id, productId, reason, timestamp, purchaseOrderId, transactionId",
      webshop_orders:
        "id, &clientRequestId, &number, createdAt, updatedAt, status, paymentStatus, fulfillmentStatus, source",
      import_jobs: "id, createdAt, status, fileName, profileId",
      import_mapping_profiles: "id, name, format, updatedAt, lastUsedAt",
      migration_activations:
        "id, storeId, status, activatedAt, lockedAt, [storeId+status]",
      migration_inverse_changes: "id, migrationId, sequence, [migrationId+sequence]",
      migration_activity_locks:
        "id, migrationId, storeId, occurredAt, [storeId+occurredAt], [migrationId+occurredAt]",
      service_orders:
        "id, &number, &trackingToken, createdAt, updatedAt, status, substatus, route, customerId, customerEmail, customerPhone, identifierValue",
    });

    // v17 repairs a category-reference mismatch introduced by an earlier
    // server hydration: products must store category IDs, never display names.
    // This makes existing imported catalogs immediately navigable again.
    this.version(17)
      .stores({
        transactions:
          "++id, tableId, paymentMethod, timestamp, isFinalized, userId, shiftId, registerId, kind, source, originalTransactionId, documentNumber, &clientRequestId",
        daily_reports: "++id, &reportNumber, timestamp, shiftId, registerId",
        audit: "++id, timestamp, userId, action",
        users: "id, role",
        outbox: "++id, timestamp, kind",
        shifts:
          "++id, &shiftNumber, registerId, status, openedAt, closedAt, [registerId+status]",
        voids: "++id, timestamp, tableId, productId, byUserId",
        products: "id, category, isActive, productType, supplierCode",
        categories: "id, name, isActive",
        customers: "id, email, phone, priceGroup, isActive",
        gift_cards: "id, customerId, code, isActive",
        gift_card_events:
          "id, giftCardId, timestamp, type, source, transactionId, dailyReportId, [giftCardId+timestamp]",
        business_actions:
          "id, type, status, createdAt, updatedAt, dueAt, ownerUserId",
        purchase_orders:
          "id, supplier, status, createdAt, updatedAt, expectedDeliveryAt",
        stock_movements:
          "++id, productId, reason, timestamp, purchaseOrderId, transactionId",
        webshop_orders:
          "id, &clientRequestId, &number, createdAt, updatedAt, status, paymentStatus, fulfillmentStatus, source",
        import_jobs: "id, createdAt, status, fileName, profileId",
        import_mapping_profiles: "id, name, format, updatedAt, lastUsedAt",
        migration_activations:
          "id, storeId, status, activatedAt, lockedAt, [storeId+status]",
        migration_inverse_changes: "id, migrationId, sequence, [migrationId+sequence]",
        migration_activity_locks:
          "id, migrationId, storeId, occurredAt, [storeId+occurredAt], [migrationId+occurredAt]",
        service_orders:
          "id, &number, &trackingToken, createdAt, updatedAt, status, substatus, route, customerId, customerEmail, customerPhone, identifierValue",
      })
      .upgrade(async (tx) => {
        const categories = (await tx.table("categories").toArray()) as ProductCategory[];
        const categoryIds = new Set(categories.map((category) => category.id));
        const idByName = new Map(
          categories.map((category) => [category.name.trim().toLocaleLowerCase("nl-BE"), category.id]),
        );
        await tx.table("products").toCollection().modify((row: Product) => {
          if (!categoryIds.has(row.category)) {
            const categoryId = idByName.get(row.category.trim().toLocaleLowerCase("nl-BE"));
            if (categoryId) row.category = categoryId;
          }
          if (!row.subCategory) {
            const legacySubCategory = ["Subcategorie", "Subcategory", "Subgroep", "Artikel subgroep"]
              .map((key) => row.customFields?.[key])
              .find((value): value is string => typeof value === "string" && Boolean(value.trim()));
            if (legacySubCategory) row.subCategory = legacySubCategory.trim();
          }
        });
      });
  }
}

export let db = new POSDatabase();

let activeTenantStoreId: string | null = null;

/** Switch the complete offline cache to a physical database for one store. */
export const activateTenantDatabase = (storeId: string | null): POSDatabase => {
  if (storeId === activeTenantStoreId) return db;
  db.close();
  activeTenantStoreId = storeId;
  db = new POSDatabase(tenantDatabaseName(storeId));
  return db;
};

export const getActiveTenantStoreId = (): string | null => activeTenantStoreId;
