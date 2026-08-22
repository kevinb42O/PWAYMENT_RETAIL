import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { LEGACY_DB_NAME, migrateLegacyDatabase } from './migrateLegacyDb';
import { OrderItem, Transaction } from '../types';

const item = (name: string, vatRate: unknown): OrderItem => ({
  lineId: `l-${name}`,
  product: {
    id: `p-${name}`,
    name,
    category: 'test',
    priceCents: 1000,
    vatRate: vatRate as 12 | 21,
    isActive: true,
  },
  quantity: 1,
});

const tx = (items: OrderItem[]): Omit<Transaction, 'id'> => ({
  tableId: 1,
  items,
  subtotalCents: 1000,
  vat12Cents: 0,
  vat21Cents: 174,
  totalCents: 1000,
  discountCents: 0,
  paymentMethod: 'Cash',
  timestamp: Date.now(),
  isFinalized: 0,
  source: 'live',
});

describe('migrateLegacyDatabase', () => {
  beforeEach(async () => {
    localStorage.clear();
    await db.delete();
    await db.open();
    await Dexie.delete(LEGACY_DB_NAME);
  });

  it('keeps every retail-compatible VAT rate and only skips values that cannot be booked', async () => {
    const legacy = new Dexie(LEGACY_DB_NAME);
    legacy.version(9).stores({
      transactions: '++id, timestamp, isFinalized',
      products: 'id, category, isActive',
      categories: 'id, name, isActive',
      customers: 'id, email, phone, isActive',
    });
    await legacy.open();
    await legacy.table('transactions').bulkAdd([
      tx([item('Skateboard Deck', 21)]),
      // A malformed historic row: no representable VAT rate.
      tx([item('Warme Melk + Callebaut Chocolade*', undefined)]),
      tx([item('Koffie', 6)]),
    ]);
    await legacy.table('products').bulkPut([
      { id: 'p-deck', name: 'Deck', category: 'skateboards', priceCents: 10000, vatRate: 21, isActive: true },
      { id: 'p-melk', name: 'Warme Melk', category: 'dranken', priceCents: 350, vatRate: 6, isActive: true },
    ]);
    await legacy.table('categories').bulkPut([
      { id: 'skateboards', name: 'Skateboards', vatRate: 21, isActive: true },
      { id: 'dranken', name: 'Dranken', vatRate: 6, isActive: true },
    ]);
    await legacy.table('customers').put({ id: 'c-1', name: 'Klant', isActive: true });
    legacy.close();

    const result = await migrateLegacyDatabase();
    expect(result.migrated).toBe(true);
    expect(result.skippedTransactions).toBe(1);
    expect(result.skippedProducts).toBe(0);
    expect(result.skippedCategories).toBe(0);

    const txs = await db.transactions.toArray();
    expect(txs).toHaveLength(2);
    expect(txs[0].items[0].product.name).toBe('Skateboard Deck');
    expect(txs[1].items[0].product.name).toBe('Koffie');
    expect((await db.products.toArray()).map((p) => p.id).sort()).toEqual(['p-deck', 'p-melk']);
    expect((await db.categories.toArray()).map((c) => c.id).sort()).toEqual(['dranken', 'skateboards']);
    expect(await db.customers.count()).toBe(1);

    // Legacy database stays untouched for the other project.
    const reopened = new Dexie(LEGACY_DB_NAME);
    await reopened.open();
    expect(await reopened.table('transactions').count()).toBe(3);
    reopened.close();

    // Second run is a no-op thanks to the flag.
    const again = await migrateLegacyDatabase();
    expect(again.migrated).toBe(false);
  });

  it('is a no-op when no legacy database exists', async () => {
    const result = await migrateLegacyDatabase();
    expect(result.migrated).toBe(false);
    expect(await db.transactions.count()).toBe(0);
  });
});
