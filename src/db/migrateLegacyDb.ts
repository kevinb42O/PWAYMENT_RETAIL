import Dexie from 'dexie';
import { db } from './db';
import { isSupportedVatRate } from '../utils/vat';
import { OrderItem } from '../types';

/**
 * The old database name that was shared (same localhost origin, same name)
 * with the pwayment_horeca project, which let foreign horeca rows leak into
 * the retail data. We copy the retail-compatible rows out exactly once and
 * leave the legacy database untouched for the other project.
 */
export const LEGACY_DB_NAME = 'POSDatabase';

const MIGRATION_FLAG = 'pwayment-retail:legacy-pos-migrated';

/** Tables copied verbatim; transactions/products/categories get VAT filtering. */
const COPY_TABLES = [
  'daily_reports',
  'audit',
  'users',
  'outbox',
  'shifts',
  'voids',
  'customers',
  'gift_cards',
  'business_actions',
  'purchase_orders',
  'stock_movements',
] as const;

export interface LegacyMigrationResult {
  migrated: boolean;
  skippedTransactions: number;
  skippedProducts: number;
  skippedCategories: number;
}

const NOOP: LegacyMigrationResult = {
  migrated: false,
  skippedTransactions: 0,
  skippedProducts: 0,
  skippedCategories: 0,
};

const hasSupportedVat = (row: { vatRate?: unknown }): boolean =>
  isSupportedVatRate(row.vatRate);

const transactionIsRetail = (t: { items?: OrderItem[] }): boolean =>
  Array.isArray(t.items) && t.items.every((i) => isSupportedVatRate(i.product?.vatRate));

/**
 * One-time copy of the legacy shared 'POSDatabase' into the renamed
 * per-project database. Rows with VAT rates this engine cannot book
 * (horeca leakage) are skipped. Idempotent via a localStorage flag.
 */
export const migrateLegacyDatabase = async (): Promise<LegacyMigrationResult> => {
  if (localStorage.getItem(MIGRATION_FLAG)) return NOOP;

  if (!(await Dexie.exists(LEGACY_DB_NAME))) {
    localStorage.setItem(MIGRATION_FLAG, new Date().toISOString());
    return NOOP;
  }

  // Dynamic mode: open whatever schema version is on disk, read-only usage.
  const legacy = new Dexie(LEGACY_DB_NAME);
  try {
    await legacy.open();

    const legacyTableNames = new Set(legacy.tables.map((t) => t.name));
    const result: LegacyMigrationResult = { ...NOOP, migrated: true };

    if (legacyTableNames.has('transactions')) {
      const rows = await legacy.table('transactions').toArray();
      const retail = rows.filter(transactionIsRetail);
      result.skippedTransactions = rows.length - retail.length;
      if (retail.length > 0) await db.transactions.bulkPut(retail);
    }

    if (legacyTableNames.has('products')) {
      const rows = await legacy.table('products').toArray();
      const retail = rows.filter(hasSupportedVat);
      result.skippedProducts = rows.length - retail.length;
      if (retail.length > 0) await db.products.bulkPut(retail);
    }

    if (legacyTableNames.has('categories')) {
      const rows = await legacy.table('categories').toArray();
      const retail = rows.filter(hasSupportedVat);
      result.skippedCategories = rows.length - retail.length;
      if (retail.length > 0) await db.categories.bulkPut(retail);
    }

    for (const name of COPY_TABLES) {
      if (!legacyTableNames.has(name)) continue;
      const rows = await legacy.table(name).toArray();
      if (rows.length > 0) await db.table(name).bulkPut(rows);
    }

    localStorage.setItem(MIGRATION_FLAG, new Date().toISOString());
    console.info(
      `[migratie] Legacy POSDatabase overgezet naar ${db.name}. ` +
        `Overgeslagen (vreemd BTW-tarief): ${result.skippedTransactions} transacties, ` +
        `${result.skippedProducts} producten, ${result.skippedCategories} categorieën.`,
    );
    return result;
  } finally {
    legacy.close();
  }
};
