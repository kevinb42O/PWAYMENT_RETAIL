import { Customer, GiftCard } from '../types';

const DAY_MS = 24 * 60 * 60 * 1000;
const collator = new Intl.Collator('nl-BE', { sensitivity: 'base', numeric: true });

export type SortDirection = 'asc' | 'desc';

export type CustomerStatusFilter = 'all' | 'active' | 'archived';
export type CustomerActivityFilter = 'all' | 'recent-30' | 'cooling-30-59' | 'dormant-60' | 'never';
export type CustomerPurchaseFilter = 'all' | 'none' | 'one-time' | 'returning' | 'loyal';
export type CustomerContactFilter = 'all' | 'complete' | 'incomplete' | 'missing-email' | 'missing-phone';
export type CustomerGiftCardFilter = 'all' | 'has-card' | 'open-balance' | 'no-card' | 'blocked';
export type CustomerSortKey =
  | 'name'
  | 'totalSpent'
  | 'averageSpend'
  | 'visitCount'
  | 'lastVisit'
  | 'createdAt'
  | 'giftCardBalance';

export interface CustomerListFilters {
  query: string;
  status: CustomerStatusFilter;
  activity: CustomerActivityFilter;
  purchases: CustomerPurchaseFilter;
  contact: CustomerContactFilter;
  giftCards: CustomerGiftCardFilter;
  minSpentCents?: number;
  maxSpentCents?: number;
  createdFrom?: string;
  createdTo?: string;
  sortKey: CustomerSortKey;
  sortDirection: SortDirection;
}

export const DEFAULT_CUSTOMER_FILTERS: CustomerListFilters = {
  query: '',
  status: 'active',
  activity: 'all',
  purchases: 'all',
  contact: 'all',
  giftCards: 'all',
  sortKey: 'totalSpent',
  sortDirection: 'desc',
};

export interface CustomerListRow {
  customer: Customer;
  averageSpendCents: number;
  daysSinceLastVisit: number | null;
  giftCardCount: number;
  blockedGiftCardCount: number;
  openGiftCardBalanceCents: number;
}

const timestamp = (value?: string): number | null => {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
};

const startOfInputDay = (value?: string): number | null => {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00`).getTime();
  return Number.isFinite(parsed) ? parsed : null;
};

const endOfInputDay = (value?: string): number | null => {
  if (!value) return null;
  const parsed = new Date(`${value}T23:59:59.999`).getTime();
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeQuery = (value: string): string => value.trim().toLocaleLowerCase('nl-BE');

const directionMultiplier = (direction: SortDirection): number => (direction === 'asc' ? 1 : -1);

const compareNumber = (a: number, b: number, direction: SortDirection): number =>
  (a - b) * directionMultiplier(direction);

const compareNullableDate = (
  a: number | null,
  b: number | null,
  direction: SortDirection,
): number => {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return compareNumber(a, b, direction);
};

export const buildCustomerRows = (
  customers: Customer[],
  giftCards: GiftCard[],
  now = Date.now(),
): CustomerListRow[] => {
  const cardsByCustomer = new Map<string, GiftCard[]>();
  for (const card of giftCards) {
    if (!card.customerId) continue;
    const current = cardsByCustomer.get(card.customerId) ?? [];
    current.push(card);
    cardsByCustomer.set(card.customerId, current);
  }

  return customers.map((customer) => {
    const cards = cardsByCustomer.get(customer.id) ?? [];
    const lastVisit = timestamp(customer.lastVisitAt);
    return {
      customer,
      averageSpendCents:
        customer.visitCount > 0 ? Math.round(customer.totalSpentCents / customer.visitCount) : 0,
      daysSinceLastVisit:
        lastVisit == null ? null : Math.max(0, Math.floor((now - lastVisit) / DAY_MS)),
      giftCardCount: cards.length,
      blockedGiftCardCount: cards.filter((card) => !card.isActive).length,
      openGiftCardBalanceCents: cards
        .filter((card) => card.isActive && card.balanceCents > 0)
        .reduce((sum, card) => sum + card.balanceCents, 0),
    };
  });
};

export const filterAndSortCustomers = (
  customers: Customer[],
  giftCards: GiftCard[],
  filters: CustomerListFilters,
  now = Date.now(),
): CustomerListRow[] => {
  const query = normalizeQuery(filters.query);
  const createdFrom = startOfInputDay(filters.createdFrom);
  const createdTo = endOfInputDay(filters.createdTo);

  return buildCustomerRows(customers, giftCards, now)
    .filter((row) => {
      const customer = row.customer;
      if (query) {
        const haystack = [customer.name, customer.email, customer.phone, customer.address, customer.notes]
          .filter(Boolean)
          .join(' ')
          .toLocaleLowerCase('nl-BE');
        if (!haystack.includes(query)) return false;
      }

      if (filters.status === 'active' && !customer.isActive) return false;
      if (filters.status === 'archived' && customer.isActive) return false;

      if (filters.activity === 'never' && customer.visitCount !== 0) return false;
      if (filters.activity === 'recent-30' && (row.daysSinceLastVisit == null || row.daysSinceLastVisit >= 30)) return false;
      if (
        filters.activity === 'cooling-30-59' &&
        (row.daysSinceLastVisit == null || row.daysSinceLastVisit < 30 || row.daysSinceLastVisit >= 60)
      ) return false;
      if (filters.activity === 'dormant-60' && (row.daysSinceLastVisit == null || row.daysSinceLastVisit < 60)) return false;

      if (filters.purchases === 'none' && customer.visitCount !== 0) return false;
      if (filters.purchases === 'one-time' && customer.visitCount !== 1) return false;
      if (filters.purchases === 'returning' && customer.visitCount < 2) return false;
      if (filters.purchases === 'loyal' && customer.visitCount < 3) return false;

      const hasEmail = Boolean(customer.email?.trim());
      const hasPhone = Boolean(customer.phone?.trim());
      if (filters.contact === 'complete' && (!hasEmail || !hasPhone)) return false;
      if (filters.contact === 'incomplete' && hasEmail && hasPhone) return false;
      if (filters.contact === 'missing-email' && hasEmail) return false;
      if (filters.contact === 'missing-phone' && hasPhone) return false;

      if (filters.giftCards === 'has-card' && row.giftCardCount === 0) return false;
      if (filters.giftCards === 'open-balance' && row.openGiftCardBalanceCents <= 0) return false;
      if (filters.giftCards === 'no-card' && row.giftCardCount > 0) return false;
      if (filters.giftCards === 'blocked' && row.blockedGiftCardCount === 0) return false;

      if (filters.minSpentCents != null && customer.totalSpentCents < filters.minSpentCents) return false;
      if (filters.maxSpentCents != null && customer.totalSpentCents > filters.maxSpentCents) return false;

      const createdAt = timestamp(customer.createdAt);
      if (createdFrom != null && (createdAt == null || createdAt < createdFrom)) return false;
      if (createdTo != null && (createdAt == null || createdAt > createdTo)) return false;

      return true;
    })
    .sort((a, b) => {
      let compared = 0;
      switch (filters.sortKey) {
        case 'name':
          compared = collator.compare(a.customer.name, b.customer.name) * directionMultiplier(filters.sortDirection);
          break;
        case 'totalSpent':
          compared = compareNumber(a.customer.totalSpentCents, b.customer.totalSpentCents, filters.sortDirection);
          break;
        case 'averageSpend':
          compared = compareNumber(a.averageSpendCents, b.averageSpendCents, filters.sortDirection);
          break;
        case 'visitCount':
          compared = compareNumber(a.customer.visitCount, b.customer.visitCount, filters.sortDirection);
          break;
        case 'lastVisit':
          compared = compareNullableDate(timestamp(a.customer.lastVisitAt), timestamp(b.customer.lastVisitAt), filters.sortDirection);
          break;
        case 'createdAt':
          compared = compareNullableDate(timestamp(a.customer.createdAt), timestamp(b.customer.createdAt), filters.sortDirection);
          break;
        case 'giftCardBalance':
          compared = compareNumber(a.openGiftCardBalanceCents, b.openGiftCardBalanceCents, filters.sortDirection);
          break;
      }
      return compared || collator.compare(a.customer.name, b.customer.name) || collator.compare(a.customer.id, b.customer.id);
    });
};

export type GiftCardStatusFilter = 'all' | 'active' | 'empty' | 'blocked' | 'expired';
export type GiftCardOwnerFilter = 'all' | 'linked' | 'anonymous';
export type GiftCardExpiryFilter = 'all' | 'next-30' | 'expired' | 'no-expiry';
export type GiftCardSortKey = 'code' | 'customer' | 'initial' | 'balance' | 'issuedAt' | 'expiresAt';

export interface GiftCardListFilters {
  query: string;
  status: GiftCardStatusFilter;
  owner: GiftCardOwnerFilter;
  expiry: GiftCardExpiryFilter;
  minBalanceCents?: number;
  maxBalanceCents?: number;
  sortKey: GiftCardSortKey;
  sortDirection: SortDirection;
}

export const DEFAULT_GIFT_CARD_FILTERS: GiftCardListFilters = {
  query: '',
  status: 'all',
  owner: 'all',
  expiry: 'all',
  sortKey: 'issuedAt',
  sortDirection: 'desc',
};

export interface GiftCardListRow {
  giftCard: GiftCard;
  customerName?: string;
  isExpired: boolean;
  daysUntilExpiry: number | null;
}

export const filterAndSortGiftCards = (
  giftCards: GiftCard[],
  customers: Customer[],
  filters: GiftCardListFilters,
  now = Date.now(),
): GiftCardListRow[] => {
  const customerNameById = new Map(customers.map((customer) => [customer.id, customer.name]));
  const query = normalizeQuery(filters.query);

  return giftCards
    .map((giftCard): GiftCardListRow => {
      const expiresAt = timestamp(giftCard.expiresAt);
      return {
        giftCard,
        customerName: giftCard.customerId ? customerNameById.get(giftCard.customerId) : undefined,
        isExpired: expiresAt != null && expiresAt < now,
        daysUntilExpiry: expiresAt == null ? null : Math.ceil((expiresAt - now) / DAY_MS),
      };
    })
    .filter((row) => {
      const card = row.giftCard;
      if (query) {
        const haystack = `${card.code} ${row.customerName ?? ''}`.toLocaleLowerCase('nl-BE');
        if (!haystack.includes(query)) return false;
      }

      if (filters.status === 'active' && (!card.isActive || card.balanceCents <= 0 || row.isExpired)) return false;
      if (filters.status === 'empty' && (!card.isActive || card.balanceCents !== 0 || row.isExpired)) return false;
      if (filters.status === 'blocked' && card.isActive) return false;
      if (filters.status === 'expired' && !row.isExpired) return false;

      if (filters.owner === 'linked' && !card.customerId) return false;
      if (filters.owner === 'anonymous' && card.customerId) return false;

      if (filters.expiry === 'expired' && !row.isExpired) return false;
      if (filters.expiry === 'no-expiry' && card.expiresAt) return false;
      if (
        filters.expiry === 'next-30' &&
        (row.daysUntilExpiry == null || row.daysUntilExpiry < 0 || row.daysUntilExpiry > 30)
      ) return false;

      if (filters.minBalanceCents != null && card.balanceCents < filters.minBalanceCents) return false;
      if (filters.maxBalanceCents != null && card.balanceCents > filters.maxBalanceCents) return false;
      return true;
    })
    .sort((a, b) => {
      let compared = 0;
      switch (filters.sortKey) {
        case 'code':
          compared = collator.compare(a.giftCard.code, b.giftCard.code) * directionMultiplier(filters.sortDirection);
          break;
        case 'customer':
          compared = collator.compare(a.customerName ?? '', b.customerName ?? '') * directionMultiplier(filters.sortDirection);
          break;
        case 'initial':
          compared = compareNumber(a.giftCard.initialCents, b.giftCard.initialCents, filters.sortDirection);
          break;
        case 'balance':
          compared = compareNumber(a.giftCard.balanceCents, b.giftCard.balanceCents, filters.sortDirection);
          break;
        case 'issuedAt':
          compared = compareNullableDate(timestamp(a.giftCard.issuedAt), timestamp(b.giftCard.issuedAt), filters.sortDirection);
          break;
        case 'expiresAt':
          compared = compareNullableDate(timestamp(a.giftCard.expiresAt), timestamp(b.giftCard.expiresAt), filters.sortDirection);
          break;
      }
      return compared || collator.compare(a.giftCard.code, b.giftCard.code) || collator.compare(a.giftCard.id, b.giftCard.id);
    });
};
