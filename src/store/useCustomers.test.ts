import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db/db';
import { Customer, GiftCard } from '../types';
import { useCustomers } from './useCustomers';

const card: GiftCard = {
  id: 'history-card',
  customerId: 'customer-1',
  code: 'HIST-1234-5678',
  initialCents: 5000,
  balanceCents: 5000,
  issuedAt: new Date(2026, 0, 1, 10).toISOString(),
  isActive: true,
};

beforeEach(async () => {
  if (!db.isOpen()) await db.open();
  await Promise.all([db.customers.clear(), db.gift_cards.clear(), db.gift_card_events.clear(), db.audit.clear(), db.outbox.clear()]);
  useCustomers.setState({ customers: [], giftCards: [], hydrated: true });
});

describe('customer repository state', () => {
  const customer: Customer = {
    id: 'customer-1',
    name: '  Ari Klant  ',
    email: ' ari@example.test ',
    phone: ' 0470 00 00 00 ',
    totalSpentCents: 0,
    visitCount: 0,
    createdAt: '2026-08-14T12:00:00.000Z',
    isActive: true,
  };

  it('normalizes, archives and restores customer records while retaining local cache consistency', async () => {
    await useCustomers.getState().upsertCustomer(customer);
    expect(await db.customers.get(customer.id)).toMatchObject({
      name: 'Ari Klant', email: 'ari@example.test', phone: '0470 00 00 00',
    });
    await useCustomers.getState().removeCustomer(customer.id);
    expect((await db.customers.get(customer.id))?.isActive).toBe(false);
    await useCustomers.getState().restoreCustomer(customer.id);
    expect((await db.customers.get(customer.id))?.isActive).toBe(true);
    await useCustomers.getState().removeCustomer('unknown');
    await useCustomers.getState().restoreCustomer('unknown');

    await useCustomers.getState().hydrate(true);
    useCustomers.getState().syncPersisted({
      customer: { ...customer, name: 'Ari Gewijzigd' },
      giftCards: [card],
    });
    expect(useCustomers.getState().customers[0].name).toBe('Ari Gewijzigd');
    expect(useCustomers.getState().giftCards).toEqual([card]);

    useCustomers.getState().syncPersisted({
      giftCards: [{ ...card, balanceCents: 7500 }],
    });
    expect(useCustomers.getState().giftCards).toEqual([
      { ...card, balanceCents: 7500 },
    ]);
  });

  it('adds a newly persisted customer to a cold cache', () => {
    useCustomers.getState().syncPersisted({ customer });
    expect(useCustomers.getState().customers).toEqual([customer]);
  });

  it('validates gift-card tenders, normalizes codes, and ignores invalid lifecycle requests', async () => {
    await expect(useCustomers.getState().addGiftCard(card, [{ method: 'Cash', amountCents: 4999 }])).rejects.toThrow('sluiten niet aan');
    await useCustomers.getState().addGiftCard({ ...card, code: ' pw 1234 5678 ' });
    expect(useCustomers.getState().findGiftCardByCode('PW-1234-5678')).toMatchObject({ id: card.id });
    await expect(useCustomers.getState().addGiftCard({ ...card, id: 'other', code: 'PW-1234-5678' })).rejects.toThrow('bestaat al');
    await useCustomers.getState().rechargeGiftCard(card.id, 0);
    await useCustomers.getState().rechargeGiftCard('unknown', 500);
    await useCustomers.getState().deactivateGiftCard('unknown');
    await useCustomers.getState().activateGiftCard(card.id);
    expect((await db.gift_card_events.toArray()).map((event) => event.type)).toEqual(['issue']);
  });
});

describe('gift card ledger writes', () => {
  it('records issue, recharge and status changes with an auditable balance chain', async () => {
    const store = useCustomers.getState();
    await store.addGiftCard(card);
    await new Promise((r) => setTimeout(r, 5));
    await useCustomers.getState().rechargeGiftCard(card.id, 2500);
    await new Promise((r) => setTimeout(r, 5));
    await useCustomers.getState().deactivateGiftCard(card.id);
    await new Promise((r) => setTimeout(r, 5));
    await useCustomers.getState().activateGiftCard(card.id);

    const events = await db.gift_card_events.where('giftCardId').equals(card.id).sortBy('timestamp');
    expect(events.map((event) => event.type)).toEqual(['issue', 'recharge', 'deactivate', 'activate']);
    expect(events.map((event) => [event.balanceBeforeCents, event.balanceAfterCents])).toEqual([
      [0, 5000],
      [5000, 7500],
      [7500, 7500],
      [7500, 7500],
    ]);
    expect(await db.gift_cards.get(card.id)).toEqual(expect.objectContaining({
      initialCents: 5000,
      balanceCents: 7500,
      isActive: true,
    }));
  });

  it('rolls back the balance when its ledger write fails', async () => {
    await useCustomers.getState().addGiftCard(card);
    const addEvent = vi.spyOn(db.gift_card_events, 'add').mockRejectedValueOnce(new Error('ledger unavailable'));

    await expect(useCustomers.getState().rechargeGiftCard(card.id, 2500)).rejects.toThrow('ledger unavailable');

    expect(await db.gift_cards.get(card.id)).toEqual(card);
    expect(await db.gift_card_events.where('giftCardId').equals(card.id).count()).toBe(1);
    addEvent.mockRestore();
  });
});
