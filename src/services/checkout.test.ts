import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db/db';
import { useAuth } from '../auth/useAuth';
import { CheckoutError, finalizeCheckout } from './checkout';
import { Customer, GiftCard, MigrationActivation, OrderItem, Product } from '../types';

const product = (over: Partial<Product> = {}): Product => ({
  id: 'deck-1',
  name: 'Deck',
  category: 'skateboards',
  priceCents: 10000,
  costPriceCents: 5000,
  vatRate: 21,
  stockQty: 5,
  isActive: true,
  ...over,
});

const line = (p: Product, quantity = 1): OrderItem => ({
  lineId: `l-${p.id}`,
  product: p,
  quantity,
});

const giftCard = (over: Partial<GiftCard> = {}): GiftCard => ({
  id: 'gc-1',
  code: 'AAAA-BBBB-CCCC',
  initialCents: 10000,
  balanceCents: 10000,
  issuedAt: new Date(0).toISOString(),
  isActive: true,
  ...over,
});

const customer = (): Customer => ({
  id: 'cust-1',
  name: 'Amelie',
  totalSpentCents: 0,
  visitCount: 0,
  createdAt: new Date(0).toISOString(),
  isActive: true,
});

const baseInput = (over: Record<string, unknown> = {}) => ({
  clientRequestId: 'req-1',
  cartId: 1,
  items: [line(product())],
  discountCents: 0,
  giftCards: [],
  method: 'PIN' as const,
  ...over,
});

const counts = async () => ({
  transactions: await db.transactions.count(),
  audit: await db.audit.count(),
  outbox: await db.outbox.count(),
});

const migrationActivation = (over: Partial<MigrationActivation> = {}): MigrationActivation => ({
  id: 'migration-1',
  storeId: 'store-1',
  status: 'active',
  graphVersion: 1,
  answersJson: {},
  receiptJson: {},
  activatedAt: 1,
  createdAt: 1,
  updatedAt: 1,
  ...over,
});

beforeEach(async () => {
  if (!db.isOpen()) await db.open();
  await Promise.all([
    db.transactions.clear(),
    db.products.clear(),
    db.gift_cards.clear(),
    db.gift_card_events.clear(),
    db.customers.clear(),
    db.audit.clear(),
    db.outbox.clear(),
    db.migration_activations.clear(),
    db.migration_activity_locks.clear(),
  ]);
  useAuth.setState({ currentStoreId: null });
  await db.products.put(product());
});

describe('finalizeCheckout', () => {
  it('books a plain sale once, decrements stock and records the customer visit', async () => {
    await db.customers.put(customer());

    const result = await finalizeCheckout(baseInput({ customerId: 'cust-1' }));

    expect(result.duplicate).toBe(false);
    expect(result.transaction.totalCents).toBe(10000);
    expect(result.transaction.paymentMethod).toBe('PIN');
    expect((await db.products.get('deck-1')).stockQty).toBe(4);
    expect((await db.customers.get('cust-1')).visitCount).toBe(1);
    expect(await counts()).toEqual({ transactions: 1, audit: 1, outbox: 1 });
  });

  it('issues an invoice number and freezes B2B billing data with the sale', async () => {
    const result = await finalizeCheckout(baseInput({
      clientRequestId: 'b2b-invoice',
      documentRequest: {
        type: 'invoice-b2b',
        recipient: {
          name: 'An De Smet',
          companyName: 'De Smet Retail BV',
          addressLine1: 'Stationsstraat 12',
          postalCode: '9000',
          city: 'Gent',
          countryCode: 'be',
          vatNumber: 'be0987654321',
        },
      },
    }));

    expect(result.transaction.documentRequest).toMatchObject({
      type: 'invoice-b2b',
      recipient: { countryCode: 'BE', vatNumber: 'BE0987654321' },
    });
    expect(result.transaction.invoiceNumber).toMatch(/^INV-\d{4}-\d{8}$/);
    expect(result.transaction.invoiceIssuedAt).toBe(result.transaction.timestamp);
  });

  it('refuses an incomplete B2B invoice without booking a sale', async () => {
    await expect(finalizeCheckout(baseInput({
      clientRequestId: 'invalid-b2b-invoice',
      documentRequest: {
        type: 'invoice-b2b',
        recipient: {
          name: 'An De Smet',
          addressLine1: 'Stationsstraat 12',
          postalCode: '9000',
          city: 'Gent',
          countryCode: 'BE',
        },
      },
    }))).rejects.toMatchObject({ code: 'invalid-request' });
    expect(await db.transactions.count()).toBe(0);
  });

  it('seals an active migration atomically with the first live checkout', async () => {
    useAuth.setState({ currentStoreId: 'store-1' });
    await db.migration_activations.put(migrationActivation());

    const result = await finalizeCheckout(baseInput({ clientRequestId: 'migration-lock-sale' }));

    expect(result.duplicate).toBe(false);
    expect(await db.migration_activations.get('migration-1')).toMatchObject({
      status: 'locked',
      firstMeaningfulActivityType: 'checkout',
      firstMeaningfulActivityEntityType: 'transaction',
      firstMeaningfulActivityEntityId: String(result.transaction.id),
    });
    expect(await db.migration_activity_locks.toArray()).toEqual([
      expect.objectContaining({
        migrationId: 'migration-1',
        activityType: 'checkout',
        entityType: 'transaction',
        entityId: String(result.transaction.id),
      }),
    ]);
  });

  it('rolls back the sale when migration sealing detects a corrupted active activation', async () => {
    useAuth.setState({ currentStoreId: 'store-1' });
    await db.migration_activations.put(migrationActivation({
      firstMeaningfulActivityAt: 2,
      firstMeaningfulActivityType: 'checkout',
      firstMeaningfulActivityEntityType: 'transaction',
      firstMeaningfulActivityEntityId: 'old-transaction',
    }));

    await expect(finalizeCheckout(baseInput({ clientRequestId: 'corrupt-migration-sale' }))).rejects.toThrow(
      'migration-activity:active-migration-already-sealed',
    );

    expect(await counts()).toEqual({ transactions: 0, audit: 0, outbox: 0 });
    expect((await db.products.get('deck-1'))?.stockQty).toBe(5);
    expect(await db.migration_activity_locks.count()).toBe(0);
  });

  it('debits a full gift-card payment exactly once', async () => {
    await db.gift_cards.put(giftCard());

    const result = await finalizeCheckout(
      baseInput({
        method: 'Cadeaubon',
        giftCards: [{ id: 'gc-1', code: 'AAAA-BBBB-CCCC', amountCents: 10000 }],
      }),
    );

    expect(result.transaction.paymentMethod).toBe('Cadeaubon');
    expect(result.transaction.tenders).toEqual([{ method: 'Cadeaubon', amountCents: 10000 }]);
    expect(result.transaction.splitTenders).toBeUndefined();
    expect((await db.gift_cards.get('gc-1')).balanceCents).toBe(0);
    expect(result.transaction.giftCardAllocations).toEqual([
      {
        giftCardId: 'gc-1',
        code: 'AAAA-BBBB-CCCC',
        amountCents: 10000,
        balanceAfterCents: 0,
      },
    ]);
    expect(await db.gift_card_events.where('giftCardId').equals('gc-1').toArray()).toEqual([
      expect.objectContaining({
        type: 'redeem',
        amountCents: 10000,
        balanceBeforeCents: 10000,
        balanceAfterCents: 0,
        transactionId: result.transaction.id,
      }),
    ]);
    expect(await db.transactions.count()).toBe(1);

    // A second, genuinely new sale on the drained card must be refused.
    await expect(
      finalizeCheckout(
        baseInput({
          clientRequestId: 'req-2',
          method: 'Cadeaubon',
          giftCards: [{ id: 'gc-1', code: 'AAAA-BBBB-CCCC', amountCents: 10000 }],
        }),
      ),
    ).rejects.toMatchObject({ code: 'gift-card-insufficient-balance' });
    expect(await db.transactions.count()).toBe(1);
  });

  it('cannot redeem the same card twice beyond its balance', async () => {
    await db.gift_cards.put(giftCard());

    await expect(
      finalizeCheckout(
        baseInput({
          items: [line(product(), 2)],
          method: 'Cadeaubon',
          giftCards: [
            { id: 'gc-1', code: 'AAAA-BBBB-CCCC', amountCents: 10000 },
            { id: 'gc-1', code: 'AAAA-BBBB-CCCC', amountCents: 10000 },
          ],
        }),
      ),
    ).rejects.toMatchObject({ code: 'gift-card-insufficient-balance' });

    expect((await db.gift_cards.get('gc-1')).balanceCents).toBe(10000);
    expect(await counts()).toEqual({ transactions: 0, audit: 0, outbox: 0 });
  });

  it('turns a double confirmation into a single transaction', async () => {
    const [a, b] = await Promise.all([
      finalizeCheckout(baseInput()),
      finalizeCheckout(baseInput()),
    ]);

    expect(a.transaction.id).toBe(b.transaction.id);
    expect(await db.transactions.count()).toBe(1);

    const retry = await finalizeCheckout(baseInput());
    expect(retry.duplicate).toBe(true);
    expect(retry.transaction.id).toBe(a.transaction.id);
    expect(await counts()).toEqual({ transactions: 1, audit: 1, outbox: 1 });
    expect((await db.products.get('deck-1')).stockQty).toBe(4);
  });

  it('rejects a concurrent checkout with a different request id', async () => {
    const first = finalizeCheckout(baseInput());
    await expect(finalizeCheckout(baseInput({ clientRequestId: 'other' }))).rejects.toMatchObject({
      code: 'busy',
    });
    await first;
    expect(await db.transactions.count()).toBe(1);
  });

  it('leaves no partial sale, stock or card mutation when a checkout fails', async () => {
    await db.gift_cards.put(giftCard({ isActive: false }));
    await db.customers.put(customer());

    await expect(
      finalizeCheckout(
        baseInput({
          customerId: 'cust-1',
          method: 'Cadeaubon',
          giftCards: [{ id: 'gc-1', code: 'AAAA-BBBB-CCCC', amountCents: 10000 }],
        }),
      ),
    ).rejects.toBeInstanceOf(CheckoutError);

    expect(await counts()).toEqual({ transactions: 0, audit: 0, outbox: 0 });
    expect((await db.products.get('deck-1')).stockQty).toBe(5);
    expect((await db.gift_cards.get('gc-1')).balanceCents).toBe(10000);
    expect((await db.customers.get('cust-1')).visitCount).toBe(0);
    expect(await db.gift_card_events.count()).toBe(0);
  });

  it('refuses an expired gift card without mutating any checkout state', async () => {
    await db.gift_cards.put(giftCard({ expiresAt: new Date(Date.now() - 60_000).toISOString() }));

    await expect(
      finalizeCheckout(
        baseInput({
          method: 'Cadeaubon',
          giftCards: [{ id: 'gc-1', code: 'AAAA-BBBB-CCCC', amountCents: 10000 }],
        }),
      ),
    ).rejects.toMatchObject({ code: 'gift-card-expired' });

    expect((await db.gift_cards.get('gc-1')).balanceCents).toBe(10000);
    expect((await db.products.get('deck-1')).stockQty).toBe(5);
    expect(await counts()).toEqual({ transactions: 0, audit: 0, outbox: 0 });
    expect(await db.gift_card_events.count()).toBe(0);
  });

  it('refuses unsupported VAT rates instead of booking them at 21%', async () => {
    for (const vatRate of [0, 6, 9]) {
      await expect(
        finalizeCheckout(
          baseInput({
            clientRequestId: `vat-${vatRate}`,
            items: [line(product({ id: `p-${vatRate}`, vatRate }))],
          }),
        ),
      ).rejects.toMatchObject({ code: 'unsupported-vat' });
    }
    expect(await counts()).toEqual({ transactions: 0, audit: 0, outbox: 0 });
  });

  it('refuses gift cards worth more than the basket', async () => {
    await db.gift_cards.put(giftCard({ balanceCents: 50000 }));

    await expect(
      finalizeCheckout(
        baseInput({
          method: 'Cadeaubon',
          giftCards: [{ id: 'gc-1', code: 'AAAA-BBBB-CCCC', amountCents: 20000 }],
        }),
      ),
    ).rejects.toMatchObject({ code: 'gift-card-exceeds-total' });
    expect((await db.gift_cards.get('gc-1')).balanceCents).toBe(50000);
  });

  it('splits a partial gift-card payment against the remaining tender', async () => {
    await db.gift_cards.put(giftCard({ balanceCents: 4000 }));

    const result = await finalizeCheckout(
      baseInput({
        method: 'Cash',
        tenderedCents: 6000,
        giftCards: [{ id: 'gc-1', code: 'AAAA-BBBB-CCCC', amountCents: 4000 }],
      }),
    );

    expect(result.transaction.splitTenders).toEqual([
      { method: 'Cadeaubon', amountCents: 4000 },
      { method: 'Cash', amountCents: 6000 },
    ]);
    expect((await db.gift_cards.get('gc-1')).balanceCents).toBe(0);
  });

  it('deducts a custom partial gift-card amount and leaves the remaining balance on the card', async () => {
    await db.gift_cards.put(giftCard({ balanceCents: 10000 }));

    const result = await finalizeCheckout(
      baseInput({
        method: 'PIN',
        giftCards: [{ id: 'gc-1', code: 'AAAA-BBBB-CCCC', amountCents: 2500 }],
      }),
    );

    expect(result.transaction.splitTenders).toEqual([
      { method: 'Cadeaubon', amountCents: 2500 },
      { method: 'PIN', amountCents: 7500 },
    ]);
    expect(result.transaction.giftCardAllocations).toEqual([
      {
        giftCardId: 'gc-1',
        code: 'AAAA-BBBB-CCCC',
        amountCents: 2500,
        balanceAfterCents: 7500,
      },
    ]);
    expect((await db.gift_cards.get('gc-1')).balanceCents).toBe(7500);
    expect(await db.gift_card_events.where('giftCardId').equals('gc-1').toArray()).toEqual([
      expect.objectContaining({
        type: 'redeem',
        amountCents: 2500,
        balanceBeforeCents: 10000,
        balanceAfterCents: 7500,
      }),
    ]);
  });

  it('refuses "Split" as an input tender method', async () => {
    await expect(
      finalizeCheckout(baseInput({ method: 'Split' })),
    ).rejects.toMatchObject({ code: 'invalid-tender' });
    expect(await counts()).toEqual({ transactions: 0, audit: 0, outbox: 0 });
  });

  it('refuses a gift-card-only checkout that does not cover the full total', async () => {
    await db.gift_cards.put(giftCard({ balanceCents: 4000 }));

    await expect(
      finalizeCheckout(
        baseInput({
          method: 'Cadeaubon',
          giftCards: [{ id: 'gc-1', code: 'AAAA-BBBB-CCCC', amountCents: 4000 }],
        }),
      ),
    ).rejects.toMatchObject({ code: 'invalid-tender' });

    expect((await db.gift_cards.get('gc-1')).balanceCents).toBe(4000);
    expect(await counts()).toEqual({ transactions: 0, audit: 0, outbox: 0 });
  });

  it('refuses cash tendered below the amount still to pay', async () => {
    await db.gift_cards.put(giftCard({ balanceCents: 4000 }));

    await expect(
      finalizeCheckout(baseInput({ method: 'Cash', tenderedCents: 9999 })),
    ).rejects.toMatchObject({ code: 'invalid-tender' });

    await expect(
      finalizeCheckout(
        baseInput({
          method: 'Cash',
          tenderedCents: 5000,
          giftCards: [{ id: 'gc-1', code: 'AAAA-BBBB-CCCC', amountCents: 4000 }],
        }),
      ),
    ).rejects.toMatchObject({ code: 'invalid-tender' });

    expect((await db.gift_cards.get('gc-1')).balanceCents).toBe(4000);
    expect(await counts()).toEqual({ transactions: 0, audit: 0, outbox: 0 });
  });

  it('rolls back every table when a write fails after the transaction row was added', async () => {
    await db.gift_cards.put(giftCard());
    await db.customers.put(customer());

    // The outbox write is the last write in the checkout transaction, so a
    // failure here proves the earlier transaction/stock/card/customer/audit
    // writes are all rolled back.
    const outboxAdd = vi.spyOn(db.outbox, 'add').mockRejectedValueOnce(new Error('disk full'));

    const input = baseInput({
      customerId: 'cust-1',
      method: 'Cash',
      tenderedCents: 6000,
      giftCards: [{ id: 'gc-1', code: 'AAAA-BBBB-CCCC', amountCents: 4000 }],
    });

    await expect(finalizeCheckout(input)).rejects.toThrow('disk full');

    expect(await counts()).toEqual({ transactions: 0, audit: 0, outbox: 0 });
    expect((await db.products.get('deck-1')).stockQty).toBe(5);
    expect((await db.gift_cards.get('gc-1')).balanceCents).toBe(10000);
    expect((await db.customers.get('cust-1')).visitCount).toBe(0);
    expect(await db.gift_card_events.count()).toBe(0);

    // The same request id must be retryable after the rollback.
    const retry = await finalizeCheckout(input);
    expect(retry.duplicate).toBe(false);
    expect(await counts()).toEqual({ transactions: 1, audit: 1, outbox: 1 });
    expect((await db.gift_cards.get('gc-1')).balanceCents).toBe(6000);
    expect(await db.gift_card_events.count()).toBe(1);

    outboxAdd.mockRestore();
  });
});
