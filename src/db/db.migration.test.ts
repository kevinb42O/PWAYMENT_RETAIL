import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { POSDatabase } from './db';
import { Transaction } from '../types';

// The exact schema db.ts declares for v9, i.e. what a pre-idempotency
// installation actually has on disk.
const V9_SCHEMA = {
  transactions:
    '++id, tableId, paymentMethod, timestamp, isFinalized, userId, shiftId',
  daily_reports: '++id, reportNumber, timestamp, shiftId',
  audit: '++id, timestamp, userId, action',
  users: 'id, role',
  outbox: '++id, timestamp, kind',
  shifts: '++id, shiftNumber, openedAt, closedAt',
  voids: '++id, timestamp, tableId, productId, byUserId',
  products: 'id, category, isActive',
  categories: 'id, name, isActive',
  customers: 'id, email, phone, isActive',
  gift_cards: 'id, customerId, code, isActive',
  business_actions: 'id, type, status, createdAt, updatedAt, dueAt, ownerUserId',
  purchase_orders: 'id, supplier, status, createdAt, updatedAt, expectedDeliveryAt',
  stock_movements: '++id, productId, reason, timestamp, purchaseOrderId',
};

const legacyTransaction = (over: Partial<Transaction> = {}): Omit<Transaction, 'id'> => ({
  tableId: 1,
  items: [
    {
      lineId: 'l-1',
      product: {
        id: 'deck-1',
        name: 'Deck',
        category: 'skateboards',
        priceCents: 10000,
        vatRate: 21,
        isActive: true,
      },
      quantity: 1,
    },
  ],
  subtotalCents: 10000,
  vat12Cents: 0,
  vat21Cents: 1736,
  totalCents: 10000,
  discountCents: 0,
  paymentMethod: 'PIN',
  timestamp: 1700000000000,
  isFinalized: 1,
  source: 'live',
  ...over,
});

const newTransaction = (clientRequestId?: string): Omit<Transaction, 'id'> => ({
  ...legacyTransaction({ isFinalized: 0, timestamp: Date.now() }),
  ...(clientRequestId ? { clientRequestId } : {}),
});

describe('POSDatabase v9 → v10 migration', () => {
  it('upgrades a populated v9 database, keeps legacy rows and enforces the unique clientRequestId index', async () => {
    await Dexie.delete('POSDatabase');

    // Build a realistic v9 installation: legacy transactions have no
    // clientRequestId field at all.
    const legacy = new Dexie('POSDatabase');
    legacy.version(9).stores(V9_SCHEMA);
    await legacy.open();
    await legacy.table('transactions').bulkAdd([
      legacyTransaction(),
      legacyTransaction({ paymentMethod: 'Cash', totalCents: 2500, subtotalCents: 2500 }),
    ]);
    await legacy.table('products').put({
      id: 'deck-1',
      name: 'Deck',
      category: 'skateboards',
      priceCents: 10000,
      vatRate: 21,
      stockQty: 5,
      isActive: true,
    });
    await legacy.table('daily_reports').add({
      reportNumber: 1,
      timestamp: 1700000000000,
      totalRevenueCents: 12500,
      prevHash: null,
    });
    legacy.close();

    const upgraded = new POSDatabase();
    try {
      await upgraded.open();
      expect(upgraded.verno).toBe(10);

      // Legacy rows survive the upgrade untouched.
      const rows = await upgraded.transactions.toArray();
      expect(rows).toHaveLength(2);
      expect(rows.map((r) => r.totalCents).sort((a, b) => a - b)).toEqual([2500, 10000]);
      expect(rows.every((r) => r.clientRequestId === undefined)).toBe(true);
      expect((await upgraded.products.get('deck-1'))?.stockQty).toBe(5);
      expect(await upgraded.daily_reports.count()).toBe(1);

      // The new unique index accepts distinct keys and more keyless legacy-style rows…
      await upgraded.transactions.add(newTransaction('req-a') as Transaction);
      await upgraded.transactions.add(newTransaction() as Transaction);
      expect(
        await upgraded.transactions.where('clientRequestId').equals('req-a').count(),
      ).toBe(1);

      // …but refuses a duplicate clientRequestId.
      await expect(
        upgraded.transactions.add(newTransaction('req-a') as Transaction),
      ).rejects.toMatchObject({ name: 'ConstraintError' });
      expect(await upgraded.transactions.count()).toBe(4);
    } finally {
      upgraded.close();
    }
  });
});
