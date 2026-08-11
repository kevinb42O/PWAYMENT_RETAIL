import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db/db';
import { GiftCard } from '../types';
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
  await Promise.all([db.gift_cards.clear(), db.gift_card_events.clear(), db.audit.clear()]);
  useCustomers.setState({ customers: [], giftCards: [], hydrated: true });
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
