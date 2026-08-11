import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/db';
import { GiftCard, Product } from '../types';
import { buildInventoryForecast } from './retailActionEngine';
import {
  buildDemoDemandProfiles,
  buildDemoRetailDataset,
  clearDemoRetailData,
  DemoDemandProfile,
  seedDemoRetailData,
} from './demoRetailData';

const products: Product[] = [
  { id: 'shirt', name: 'T-shirt', category: 'Kleding', priceCents: 2995, costPriceCents: 1200, vatRate: 21, isActive: true },
  { id: 'bag', name: 'Tas', category: 'Accessoires', priceCents: 4595, costPriceCents: 2100, vatRate: 21, isActive: true },
];

describe('buildDemoRetailDataset', () => {
  it('creates marked historical sales using only the supplied current products', () => {
    const now = new Date(2026, 7, 5, 12);
    const dataset = buildDemoRetailDataset(products, now);

    expect(dataset.transactions.length).toBeGreaterThan(900);
    expect(dataset.customers.length).toBeGreaterThan(70);
    expect(dataset.giftCards.length).toBe(40);
    expect(dataset.giftCardEvents.length).toBeGreaterThan(70);
    expect(dataset.customers.every((customer) => customer.email && customer.phone && customer.address && customer.notes)).toBe(true);
    expect(dataset.transactions.every((transaction) => transaction.source === 'demo')).toBe(true);
    expect(dataset.transactions.every((transaction) => transaction.items.every((item) => ['shirt', 'bag'].includes(item.product.id)))).toBe(true);
    expect(new Set(dataset.transactions.map((transaction) => transaction.paymentMethod))).toEqual(new Set(['PIN', 'Cash', 'Cadeaubon']));
    expect(dataset.transactions.filter((transaction) => transaction.discountCents > 0).length).toBeGreaterThan(0);
    expect(dataset.customers.filter((customer) => customer.visitCount > 1).length).toBeGreaterThan(20);
    expect(dataset.customers.filter((customer) => customer.lastVisitAt && now.getTime() - new Date(customer.lastVisitAt).getTime() >= 60 * 24 * 60 * 60 * 1000).length).toBeGreaterThan(8);
    const earliest = new Date(Math.min(...dataset.transactions.map((transaction) => transaction.timestamp)));
    expect([earliest.getFullYear(), earliest.getMonth()]).toEqual([2024, 8]);
    expect(Math.max(...dataset.transactions.map((transaction) => transaction.timestamp))).toBeLessThanOrEqual(now.getTime());

    const customerIds = new Set(dataset.customers.map((customer) => customer.id));
    const giftCardIds = new Set(dataset.giftCards.map((giftCard) => giftCard.id));
    const giftCardCodes = new Set(dataset.giftCards.map((giftCard) => giftCard.code));
    expect(giftCardIds.size).toBe(dataset.giftCards.length);
    expect(giftCardCodes.size).toBe(dataset.giftCards.length);
    expect(dataset.giftCards.every((giftCard) => (
      Number.isSafeInteger(giftCard.initialCents)
      && Number.isSafeInteger(giftCard.balanceCents)
      && giftCard.initialCents > 0
      && giftCard.balanceCents >= 0
      && giftCard.balanceCents <= giftCard.initialCents
      && (!giftCard.customerId || customerIds.has(giftCard.customerId))
      && new Date(giftCard.issuedAt).getTime() <= now.getTime()
    ))).toBe(true);

    const thirtyDaysFromNow = now.getTime() + 30 * 24 * 60 * 60 * 1000;
    const ownerCounts = new Map<string, number>();
    dataset.giftCards.forEach((giftCard) => {
      if (giftCard.customerId) ownerCounts.set(giftCard.customerId, (ownerCounts.get(giftCard.customerId) ?? 0) + 1);
    });
    expect(dataset.giftCards.filter((giftCard) => giftCard.customerId).length).toBeGreaterThan(25);
    expect(dataset.giftCards.filter((giftCard) => !giftCard.customerId).length).toBeGreaterThan(5);
    expect(dataset.giftCards.filter((giftCard) => giftCard.balanceCents === giftCard.initialCents).length).toBeGreaterThan(8);
    expect(dataset.giftCards.filter((giftCard) => giftCard.balanceCents > 0 && giftCard.balanceCents < giftCard.initialCents).length).toBeGreaterThan(10);
    expect(dataset.giftCards.filter((giftCard) => giftCard.balanceCents === 0).length).toBeGreaterThan(3);
    expect(dataset.giftCards.filter((giftCard) => !giftCard.isActive).length).toBeGreaterThan(3);
    expect(dataset.giftCards.filter((giftCard) => giftCard.expiresAt && new Date(giftCard.expiresAt).getTime() < now.getTime()).length).toBeGreaterThan(3);
    expect(dataset.giftCards.filter((giftCard) => {
      const expiry = giftCard.expiresAt ? new Date(giftCard.expiresAt).getTime() : 0;
      return expiry >= now.getTime() && expiry <= thirtyDaysFromNow;
    }).length).toBeGreaterThan(5);
    expect(dataset.giftCards.filter((giftCard) => !giftCard.expiresAt).length).toBeGreaterThan(5);
    expect([...ownerCounts.values()].filter((count) => count > 1).length).toBeGreaterThan(1);
    expect(buildDemoRetailDataset(products, now).giftCards).toEqual(dataset.giftCards);
    expect(buildDemoRetailDataset(products, now).giftCardEvents).toEqual(dataset.giftCardEvents);

    dataset.giftCards.forEach((giftCard) => {
      const events = dataset.giftCardEvents
        .filter((event) => event.giftCardId === giftCard.id)
        .sort((a, b) => a.timestamp - b.timestamp);
      expect(events[0]).toEqual(expect.objectContaining({ type: 'issue', balanceBeforeCents: 0 }));
      expect(events.at(-1)?.balanceAfterCents).toBe(giftCard.balanceCents);
      expect(events.every((event) => event.timestamp <= now.getTime())).toBe(true);
      expect(events.filter((event) => event.type === 'redeem').reduce((sum, event) => sum + event.amountCents, 0))
        .toBe(giftCard.initialCents - giftCard.balanceCents);
    });
  });

  it('contains reproducible histories for every forecast model that must be testable', () => {
    const now = new Date(2026, 7, 5, 12);
    const scenarioProducts: Product[] = Array.from({ length: 12 }, (_, index) => ({
      id: `forecast-${index + 1}`,
      name: `Forecastproduct ${index + 1}`,
      category: 'Forecasttest',
      supplier: `Leverancier ${(index % 3) + 1}`,
      priceCents: 2000 + index * 100,
      costPriceCents: 900 + index * 50,
      vatRate: 21,
      stockQty: 20,
      minStockQty: 5,
      isActive: true,
    }));
    const profiles = buildDemoDemandProfiles(scenarioProducts);
    const dataset = buildDemoRetailDataset(scenarioProducts, now);
    const forecast = buildInventoryForecast(scenarioProducts, dataset.transactions, now.getTime());
    const rowFor = (profile: DemoDemandProfile) => {
      const productId = Object.entries(profiles).reverse().find(([, candidate]) => candidate === profile)?.[0];
      return forecast.find((row) => row.productId === productId);
    };

    expect(rowFor('rising')).toEqual(expect.objectContaining({
      forecastModel: 'recent-blend',
      trend: 'rising',
      confidence: 'high',
    }));
    expect(rowFor('falling')).toEqual(expect.objectContaining({
      forecastModel: 'recent-blend',
      trend: 'falling',
      confidence: 'high',
    }));
    expect(rowFor('seasonal-summer')).toEqual(expect.objectContaining({
      forecastModel: 'seasonal-blend',
      confidence: 'high',
    }));
    expect(rowFor('intermittent')).toEqual(expect.objectContaining({
      forecastModel: 'intermittent',
      trend: 'unknown',
    }));
    expect(rowFor('insufficient')).toEqual(expect.objectContaining({
      forecastModel: 'insufficient',
      confidence: 'low',
      activeSalesDays: 1,
    }));
    expect(rowFor('dormant')?.soldLast90Days).toBe(0);
    expect(rowFor('new')?.soldLast90Days).toBeGreaterThan(0);
    expect(forecast.every((row) => row.observedDays >= 700)).toBe(true);
  });
});

describe('demo gift card persistence', () => {
  const liveGiftCard: GiftCard = {
    id: 'live-gift-card',
    customerId: 'live-customer',
    code: 'LIVE-1234-5678',
    initialCents: 10000,
    balanceCents: 8400,
    issuedAt: new Date(2026, 0, 1).toISOString(),
    isActive: true,
  };

  beforeEach(async () => {
    await Promise.all([
      db.transactions.clear(),
      db.customers.clear(),
      db.gift_cards.clear(),
      db.gift_card_events.clear(),
      db.products.clear(),
    ]);
    await db.products.bulkPut(products);
    await db.gift_cards.put(liveGiftCard);
  });

  afterEach(async () => {
    await Promise.all([
      db.transactions.clear(),
      db.customers.clear(),
      db.gift_cards.clear(),
      db.gift_card_events.clear(),
      db.products.clear(),
    ]);
  });

  it('seeds once, backfills missing cards and never resets an existing demo balance', async () => {
    const now = new Date(2026, 7, 5, 12);
    const first = await seedDemoRetailData(now);
    const demoCards = (await db.gift_cards.toArray()).filter((giftCard) => giftCard.id.startsWith('demo-gift-card-'));
    expect(first).toEqual(expect.objectContaining({ giftCards: 40, giftCardEvents: expect.any(Number), alreadyPresent: false }));
    expect(demoCards).toHaveLength(40);

    const usedCard = { ...demoCards[0], balanceCents: 321 };
    await db.gift_cards.put(usedCard);
    await db.gift_cards.delete(demoCards[1].id);

    const second = await seedDemoRetailData(now);
    expect(second).toEqual(expect.objectContaining({ giftCards: 40, alreadyPresent: true }));
    expect(second.giftCardEvents).toBeGreaterThanOrEqual(first.giftCardEvents);
    expect((await db.gift_cards.get(usedCard.id))?.balanceCents).toBe(321);
    expect(await db.gift_cards.get(demoCards[1].id)).toBeDefined();
    expect(await db.transactions.filter((transaction) => transaction.source === 'demo').count()).toBe(first.transactions);
  });

  it('removes only demo customers, sales and gift cards', async () => {
    await seedDemoRetailData(new Date(2026, 7, 5, 12));
    await clearDemoRetailData();

    expect(await db.transactions.filter((transaction) => transaction.source === 'demo').count()).toBe(0);
    expect((await db.customers.toArray()).some((customer) => customer.id.startsWith('demo-customer-'))).toBe(false);
    expect((await db.gift_cards.toArray()).some((giftCard) => giftCard.id.startsWith('demo-gift-card-'))).toBe(false);
    expect((await db.gift_card_events.toArray()).some((event) => event.id.startsWith('demo-gift-card-event-'))).toBe(false);
    expect(await db.gift_cards.get(liveGiftCard.id)).toEqual(liveGiftCard);
  }, 10_000);
});
