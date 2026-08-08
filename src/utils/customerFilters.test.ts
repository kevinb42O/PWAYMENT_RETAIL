import { describe, expect, it } from 'vitest';
import { Customer, GiftCard } from '../types';
import {
  DEFAULT_CUSTOMER_FILTERS,
  DEFAULT_GIFT_CARD_FILTERS,
  filterAndSortCustomers,
  filterAndSortGiftCards,
} from './customerFilters';

const NOW = new Date('2026-08-08T12:00:00.000Z').getTime();
const daysAgo = (days: number): string => new Date(NOW - days * 24 * 60 * 60 * 1000).toISOString();
const daysFromNow = (days: number): string => new Date(NOW + days * 24 * 60 * 60 * 1000).toISOString();

const customer = (id: string, over: Partial<Customer> = {}): Customer => ({
  id,
  name: id,
  totalSpentCents: 0,
  visitCount: 0,
  createdAt: '2026-01-15T10:00:00.000Z',
  isActive: true,
  ...over,
});

const card = (id: string, over: Partial<GiftCard> = {}): GiftCard => ({
  id,
  code: id.toUpperCase(),
  initialCents: 10000,
  balanceCents: 10000,
  issuedAt: '2026-01-15T10:00:00.000Z',
  isActive: true,
  ...over,
});

describe('customer list filters and sorting', () => {
  const customers = [
    customer('alice', {
      name: 'Alice',
      email: 'alice@example.com',
      phone: '+32 111',
      address: 'Antwerpen Zuid',
      notes: 'VIP skater',
      totalSpentCents: 90000,
      visitCount: 3,
      lastVisitAt: daysAgo(10),
      createdAt: '2026-07-20T10:00:00.000Z',
    }),
    customer('bob', {
      name: 'Bob',
      phone: '+32 222',
      totalSpentCents: 20000,
      visitCount: 2,
      lastVisitAt: daysAgo(30),
    }),
    customer('charlie', {
      name: 'Charlie',
      email: 'charlie@example.com',
      totalSpentCents: 10000,
      visitCount: 1,
      lastVisitAt: daysAgo(59),
    }),
    customer('dora', {
      name: 'Dora',
      totalSpentCents: 5000,
      visitCount: 1,
      lastVisitAt: daysAgo(60),
    }),
    customer('never', { name: 'Nooit gekocht' }),
    customer('archived', {
      name: 'Gearchiveerd',
      totalSpentCents: 150000,
      visitCount: 6,
      lastVisitAt: daysAgo(5),
      isActive: false,
    }),
  ];

  const giftCards = [
    card('alice-open', { customerId: 'alice', balanceCents: 3000 }),
    card('alice-blocked', { customerId: 'alice', balanceCents: 2000, isActive: false }),
    card('bob-empty', { customerId: 'bob', balanceCents: 0 }),
  ];

  it('defaults to active customers with the highest spender first', () => {
    const rows = filterAndSortCustomers(customers, giftCards, DEFAULT_CUSTOMER_FILTERS, NOW);
    expect(rows.map((row) => row.customer.id)).toEqual(['alice', 'bob', 'charlie', 'dora', 'never']);
  });

  it('searches name, email, phone, address and notes', () => {
    for (const query of ['alice', 'example.com', '+32 111', 'antwerpen', 'vip skater']) {
      const rows = filterAndSortCustomers(
        customers,
        giftCards,
        { ...DEFAULT_CUSTOMER_FILTERS, query },
        NOW,
      );
      expect(rows.map((row) => row.customer.id)).toContain('alice');
    }
  });

  it('uses exact 30/60-day activity boundaries and separates never-purchased customers', () => {
    const idsFor = (activity: typeof DEFAULT_CUSTOMER_FILTERS.activity) =>
      filterAndSortCustomers(customers, giftCards, { ...DEFAULT_CUSTOMER_FILTERS, activity }, NOW)
        .map((row) => row.customer.id);

    expect(idsFor('recent-30')).toEqual(['alice']);
    expect(idsFor('cooling-30-59')).toEqual(['bob', 'charlie']);
    expect(idsFor('dormant-60')).toEqual(['dora']);
    expect(idsFor('never')).toEqual(['never']);
  });

  it('filters purchase frequency and incomplete contact details', () => {
    const loyal = filterAndSortCustomers(
      customers,
      giftCards,
      { ...DEFAULT_CUSTOMER_FILTERS, purchases: 'loyal' },
      NOW,
    );
    expect(loyal.map((row) => row.customer.id)).toEqual(['alice']);

    const incomplete = filterAndSortCustomers(
      customers,
      giftCards,
      { ...DEFAULT_CUSTOMER_FILTERS, contact: 'incomplete' },
      NOW,
    );
    expect(incomplete.map((row) => row.customer.id)).toEqual(['bob', 'charlie', 'dora', 'never']);
  });

  it('filters by spend, creation date and archive status', () => {
    const rows = filterAndSortCustomers(
      customers,
      giftCards,
      {
        ...DEFAULT_CUSTOMER_FILTERS,
        status: 'all',
        minSpentCents: 80000,
        createdFrom: '2026-07-01',
        createdTo: '2026-07-31',
      },
      NOW,
    );
    expect(rows.map((row) => row.customer.id)).toEqual(['alice']);
  });

  it('aggregates customer gift cards and filters their relationship', () => {
    const rows = filterAndSortCustomers(
      customers,
      giftCards,
      { ...DEFAULT_CUSTOMER_FILTERS, giftCards: 'open-balance' },
      NOW,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      openGiftCardBalanceCents: 3000,
      giftCardCount: 2,
      blockedGiftCardCount: 1,
    });
  });

  it('sorts by average spend and keeps missing visit dates last in both directions', () => {
    const average = filterAndSortCustomers(
      customers,
      giftCards,
      { ...DEFAULT_CUSTOMER_FILTERS, sortKey: 'averageSpend', sortDirection: 'desc' },
      NOW,
    );
    expect(average[0].customer.id).toBe('alice');
    expect(average[0].averageSpendCents).toBe(30000);

    for (const sortDirection of ['asc', 'desc'] as const) {
      const byVisit = filterAndSortCustomers(
        customers,
        giftCards,
        { ...DEFAULT_CUSTOMER_FILTERS, sortKey: 'lastVisit', sortDirection },
        NOW,
      );
      expect(byVisit.at(-1)?.customer.id).toBe('never');
    }
  });
});

describe('gift-card list filters and sorting', () => {
  const customers = [customer('alice', { name: 'Alice' }), customer('bob', { name: 'Bob' })];
  const cards = [
    card('active', { code: 'ACTIVE-1', customerId: 'alice', balanceCents: 8000, issuedAt: daysAgo(4) }),
    card('empty', { code: 'EMPTY-1', customerId: 'bob', balanceCents: 0, issuedAt: daysAgo(3) }),
    card('blocked', { code: 'BLOCKED-1', balanceCents: 4000, isActive: false, issuedAt: daysAgo(2) }),
    card('expiring', { code: 'EXPIRING-1', balanceCents: 2000, expiresAt: daysFromNow(14), issuedAt: daysAgo(1) }),
    card('expired', { code: 'EXPIRED-1', balanceCents: 1000, expiresAt: daysAgo(1), issuedAt: daysAgo(10) }),
  ];

  it('searches by code and linked customer name', () => {
    const byCustomer = filterAndSortGiftCards(
      cards,
      customers,
      { ...DEFAULT_GIFT_CARD_FILTERS, query: 'alice' },
      NOW,
    );
    expect(byCustomer.map((row) => row.giftCard.id)).toEqual(['active']);
  });

  it('filters active, empty, blocked and expired cards', () => {
    const idsFor = (status: typeof DEFAULT_GIFT_CARD_FILTERS.status) =>
      filterAndSortGiftCards(cards, customers, { ...DEFAULT_GIFT_CARD_FILTERS, status }, NOW)
        .map((row) => row.giftCard.id);

    expect(idsFor('active')).toEqual(['expiring', 'active']);
    expect(idsFor('empty')).toEqual(['empty']);
    expect(idsFor('blocked')).toEqual(['blocked']);
    expect(idsFor('expired')).toEqual(['expired']);
  });

  it('filters ownership, expiry window and balance range together', () => {
    const rows = filterAndSortGiftCards(
      cards,
      customers,
      {
        ...DEFAULT_GIFT_CARD_FILTERS,
        owner: 'anonymous',
        expiry: 'next-30',
        minBalanceCents: 1500,
        maxBalanceCents: 2500,
      },
      NOW,
    );
    expect(rows.map((row) => row.giftCard.id)).toEqual(['expiring']);
  });

  it('sorts balances low to high and keeps missing expiries last', () => {
    const byBalance = filterAndSortGiftCards(
      cards,
      customers,
      { ...DEFAULT_GIFT_CARD_FILTERS, sortKey: 'balance', sortDirection: 'asc' },
      NOW,
    );
    expect(byBalance.map((row) => row.giftCard.balanceCents)).toEqual([0, 1000, 2000, 4000, 8000]);

    const byExpiry = filterAndSortGiftCards(
      cards,
      customers,
      { ...DEFAULT_GIFT_CARD_FILTERS, sortKey: 'expiresAt', sortDirection: 'asc' },
      NOW,
    );
    expect(byExpiry.slice(-3).map((row) => row.giftCard.expiresAt)).toEqual([undefined, undefined, undefined]);
  });
});
