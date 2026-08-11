import { db } from '../db/db';
import { Customer, GiftCard, GiftCardEvent, OrderItem, PaymentMethod, Product, Transaction } from '../types';
import { calculateTotals } from './vat';

const DEMO_CUSTOMER_PREFIX = 'demo-customer-';
const DEMO_GIFT_CARD_PREFIX = 'demo-gift-card-';
const DEMO_GIFT_CARD_EVENT_PREFIX = 'demo-gift-card-event-';
const firstNames = ['Alex', 'Amélie', 'An', 'Bram', 'Camille', 'Eline', 'Emma', 'Flor', 'Jens', 'Julie', 'Lina', 'Lucas', 'Marie', 'Mats', 'Noor', 'Sofie'];
const lastNames = ['Aerts', 'Baert', 'Claeys', 'De Smet', 'Hermans', 'Janssens', 'Maes', 'Peeters', 'Smet', 'Vermeulen'];
const streets = ['Korenmarkt', 'Lange Nieuwstraat', 'Meir', 'Nationalestraat', 'Oude Koornmarkt', 'Sint-Jacobsmarkt', 'Vlaanderenstraat', 'Vrijdagmarkt'];
const localities = ['2000 Antwerpen', '2018 Antwerpen', '9000 Gent', '2800 Mechelen', '2600 Berchem', '3000 Leuven'];
const customerNotes = [
  'Voorkeur: digitaal kasticket.',
  'Aankopen vaak als cadeau; vraag naar verpakking.',
  'Voorkeur: contact via e-mail.',
  'Vaste klant; interesse in nieuwe collecties.',
  'Voorkeur: contact via telefoon.',
  'Koopt regelmatig accessoires.',
];
const team = [
  { id: 'demo-user-lina', name: 'Lina' },
  { id: 'demo-user-noah', name: 'Noah' },
  { id: 'demo-user-sam', name: 'Sam' },
];
const DAY_MS = 24 * 60 * 60 * 1000;

export type DemoDemandProfile =
  | 'stable'
  | 'rising'
  | 'falling'
  | 'seasonal-summer'
  | 'seasonal-winter'
  | 'intermittent'
  | 'new'
  | 'insufficient'
  | 'dormant';

const DEMO_DEMAND_PROFILES: DemoDemandProfile[] = [
  'stable',
  'rising',
  'falling',
  'seasonal-summer',
  'seasonal-winter',
  'intermittent',
  'new',
  'insufficient',
  'dormant',
];

export interface DemoRetailDataset {
  customers: Customer[];
  giftCards: GiftCard[];
  giftCardEvents: GiftCardEvent[];
  transactions: Transaction[];
}

export interface DemoSeedResult {
  customers: number;
  giftCards: number;
  giftCardEvents: number;
  transactions: number;
  alreadyPresent: boolean;
}

/** Small deterministic generator: demo data stays reproducible and is never mixed with live transactions. */
const createRandom = (seed = 24082025) => {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
};

const integer = (random: () => number, min: number, max: number) =>
  Math.floor(random() * (max - min + 1)) + min;

const emailIdentifier = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/\s/g, '');

const startOfDemoPeriod = (now: Date) => new Date(now.getFullYear(), now.getMonth() - 23, 1, 9, 0, 0, 0);

interface DemoGiftCardSpec {
  customerIndex?: number;
  initialCents: number;
  balanceCents: number;
  issuedDaysAgo: number;
  expiresInDays?: number;
  isActive?: boolean;
}

/**
 * A deliberately broad gift-card population for demos and acceptance tests.
 * It covers linked/anonymous, unused/part-used/empty, blocked, expired,
 * near-expiry and no-expiry cards. A few customers own multiple cards.
 */
const DEMO_GIFT_CARD_SPECS: DemoGiftCardSpec[] = [
  { customerIndex: 0, initialCents: 10000, balanceCents: 10000, issuedDaysAgo: 20, expiresInDays: 345 },
  { customerIndex: 0, initialCents: 5000, balanceCents: 1250, issuedDaysAgo: 180 },
  { customerIndex: 1, initialCents: 2500, balanceCents: 0, issuedDaysAgo: 300, expiresInDays: 65 },
  { customerIndex: 1, initialCents: 10000, balanceCents: 5500, issuedDaysAgo: 95 },
  { customerIndex: 2, initialCents: 15000, balanceCents: 8700, issuedDaysAgo: 100, expiresInDays: 265 },
  { customerIndex: 2, initialCents: 2500, balanceCents: 2500, issuedDaysAgo: 14, expiresInDays: 29 },
  { customerIndex: 2, initialCents: 7500, balanceCents: 1100, issuedDaysAgo: 230, expiresInDays: 135 },
  { customerIndex: 3, initialCents: 7500, balanceCents: 7500, issuedDaysAgo: 7, expiresInDays: 28 },
  { customerIndex: 4, initialCents: 20000, balanceCents: 6000, issuedDaysAgo: 240, expiresInDays: 120 },
  { customerIndex: 5, initialCents: 5000, balanceCents: 5000, issuedDaysAgo: 370, expiresInDays: -5 },
  { customerIndex: 6, initialCents: 10000, balanceCents: 2300, issuedDaysAgo: 390, expiresInDays: -25 },
  { customerIndex: 7, initialCents: 2500, balanceCents: 1900, issuedDaysAgo: 45, expiresInDays: 12 },
  { customerIndex: 8, initialCents: 5000, balanceCents: 0, issuedDaysAgo: 250 },
  { customerIndex: 9, initialCents: 10000, balanceCents: 4000, issuedDaysAgo: 70, expiresInDays: 290, isActive: false },
  { customerIndex: 10, initialCents: 15000, balanceCents: 15000, issuedDaysAgo: 15 },
  { customerIndex: 11, initialCents: 2500, balanceCents: 500, issuedDaysAgo: 350, expiresInDays: 15 },
  { customerIndex: 12, initialCents: 7500, balanceCents: 0, issuedDaysAgo: 500, expiresInDays: -120 },
  { customerIndex: 13, initialCents: 5000, balanceCents: 3500, issuedDaysAgo: 34, expiresInDays: 331 },
  { customerIndex: 14, initialCents: 10000, balanceCents: 10000, issuedDaysAgo: 2, expiresInDays: 363 },
  { customerIndex: 15, initialCents: 20000, balanceCents: 12500, issuedDaysAgo: 200 },
  { customerIndex: 16, initialCents: 2500, balanceCents: 2500, issuedDaysAgo: 9, expiresInDays: 21 },
  { customerIndex: 17, initialCents: 7500, balanceCents: 2600, issuedDaysAgo: 120, expiresInDays: 245 },
  { customerIndex: 18, initialCents: 15000, balanceCents: 0, issuedDaysAgo: 360, expiresInDays: 5 },
  { customerIndex: 19, initialCents: 5000, balanceCents: 5000, issuedDaysAgo: 410, expiresInDays: -45, isActive: false },
  { customerIndex: 20, initialCents: 10000, balanceCents: 6800, issuedDaysAgo: 80 },
  { customerIndex: 21, initialCents: 2500, balanceCents: 900, issuedDaysAgo: 30, expiresInDays: 335 },
  { customerIndex: 22, initialCents: 20000, balanceCents: 20000, issuedDaysAgo: 1, expiresInDays: 364 },
  { customerIndex: 23, initialCents: 2500, balanceCents: 0, issuedDaysAgo: 120, expiresInDays: 245, isActive: false },
  { customerIndex: 24, initialCents: 7500, balanceCents: 4300, issuedDaysAgo: 25, expiresInDays: 340 },
  { customerIndex: 25, initialCents: 20000, balanceCents: 7500, issuedDaysAgo: 365, expiresInDays: 1 },
  { initialCents: 2500, balanceCents: 2500, issuedDaysAgo: 3, expiresInDays: 362 },
  { initialCents: 5000, balanceCents: 1700, issuedDaysAgo: 75 },
  { initialCents: 10000, balanceCents: 0, issuedDaysAgo: 320, expiresInDays: 45 },
  { initialCents: 15000, balanceCents: 9200, issuedDaysAgo: 60, expiresInDays: 305 },
  { initialCents: 20000, balanceCents: 20000, issuedDaysAgo: 6, expiresInDays: 24 },
  { initialCents: 7500, balanceCents: 2500, issuedDaysAgo: 375, expiresInDays: -10 },
  { initialCents: 5000, balanceCents: 5000, issuedDaysAgo: 50, expiresInDays: 315, isActive: false },
  { initialCents: 10000, balanceCents: 3100, issuedDaysAgo: 190 },
  { initialCents: 15000, balanceCents: 15000, issuedDaysAgo: 500, isActive: false },
  { initialCents: 2500, balanceCents: 600, issuedDaysAgo: 40, expiresInDays: 325 },
];

export const buildDemoGiftCards = (customers: Customer[], now = new Date()): GiftCard[] => {
  const anchor = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);
  return DEMO_GIFT_CARD_SPECS.map((spec, index) => {
    const number = String(index + 1).padStart(3, '0');
    const issuedAt = new Date(anchor.getTime() - spec.issuedDaysAgo * DAY_MS + index * 60_000);
    const expiresAt = spec.expiresInDays == null
      ? undefined
      : new Date(anchor.getTime() + spec.expiresInDays * DAY_MS + index * 60_000).toISOString();
    return {
      id: `${DEMO_GIFT_CARD_PREFIX}${number}`,
      customerId: spec.customerIndex == null ? undefined : customers[spec.customerIndex]?.id,
      code: `DEMO-${number}-${String(7319 + index * 137).padStart(4, '0')}`,
      initialCents: spec.initialCents,
      balanceCents: spec.balanceCents,
      issuedAt: issuedAt.toISOString(),
      expiresAt,
      isActive: spec.isActive ?? true,
    };
  });
};

export const buildDemoGiftCardEvents = (giftCards: GiftCard[], now = new Date()): GiftCardEvent[] => {
  const nowTime = now.getTime();
  const events: GiftCardEvent[] = [];

  giftCards.forEach((card, position) => {
    const parsedCardNumber = Number.parseInt(card.id.replace(DEMO_GIFT_CARD_PREFIX, ''), 10);
    const cardIndex = Number.isFinite(parsedCardNumber) ? parsedCardNumber - 1 : position;
    const cardNumber = String(cardIndex + 1).padStart(3, '0');
    const issuedAt = Date.parse(card.issuedAt);
    const expiresAt = card.expiresAt ? Date.parse(card.expiresAt) : Number.POSITIVE_INFINITY;
    const activityEnd = Math.max(
      issuedAt + 60 * 60 * 1000,
      Math.min(nowTime - 60 * 60 * 1000, expiresAt - DAY_MS),
    );
    const duration = Math.max(60 * 60 * 1000, activityEnd - issuedAt);
    let balance = card.initialCents;
    const hasRecharge = cardIndex % 9 === 1 && card.initialCents >= 5000;
    const rechargeCents = hasRecharge ? 2500 : 0;
    const issuedCents = card.initialCents - rechargeCents;
    balance = issuedCents;

    const addEvent = (
      key: string,
      event: Omit<GiftCardEvent, 'id' | 'giftCardId' | 'giftCardCode' | 'customerId' | 'source'>,
    ) => {
      events.push({
        ...event,
        id: `${DEMO_GIFT_CARD_EVENT_PREFIX}${cardNumber}-${key}`,
        giftCardId: card.id,
        giftCardCode: card.code,
        customerId: card.customerId,
        source: 'demo',
      });
    };

    addEvent('issue', {
      type: 'issue',
      amountCents: issuedCents,
      balanceBeforeCents: 0,
      balanceAfterCents: issuedCents,
      timestamp: issuedAt,
      userId: 'demo-user-lina',
      userName: 'Lina',
      note: 'Demo-uitgifte',
    });

    if (rechargeCents > 0) {
      addEvent('recharge', {
        type: 'recharge',
        amountCents: rechargeCents,
        balanceBeforeCents: balance,
        balanceAfterCents: balance + rechargeCents,
        timestamp: Math.round(issuedAt + duration * 0.28),
        userId: 'demo-user-noah',
        userName: 'Noah',
        note: 'Demo-opwaardering',
      });
      balance += rechargeCents;
    }

    const spentCents = card.initialCents - card.balanceCents;
    const redemptionCount = spentCents === 0 ? 0 : spentCents >= 7500 ? 3 : spentCents >= 2500 ? 2 : 1;
    let remainingSpent = spentCents;
    for (let redemptionIndex = 0; redemptionIndex < redemptionCount; redemptionIndex += 1) {
      const amountCents = redemptionIndex === redemptionCount - 1
        ? remainingSpent
        : Math.max(1, Math.round(remainingSpent / (redemptionCount - redemptionIndex)));
      const balanceAfterCents = balance - amountCents;
      addEvent(`redeem-${String(redemptionIndex + 1).padStart(2, '0')}`, {
        type: 'redeem',
        amountCents,
        balanceBeforeCents: balance,
        balanceAfterCents,
        timestamp: Math.round(issuedAt + duration * (0.48 + redemptionIndex * 0.17)),
        userId: team[redemptionIndex % team.length].id,
        userName: team[redemptionIndex % team.length].name,
        note: 'Demo-aankoop',
      });
      balance = balanceAfterCents;
      remainingSpent -= amountCents;
    }

    if (!card.isActive) {
      addEvent('deactivate', {
        type: 'deactivate',
        amountCents: 0,
        balanceBeforeCents: balance,
        balanceAfterCents: balance,
        timestamp: Math.round(issuedAt + duration * 0.9),
        userId: 'demo-user-sam',
        userName: 'Sam',
        note: 'Demo-blokkering',
      });
    } else if (cardIndex % 13 === 0 && duration > 2 * DAY_MS) {
      addEvent('deactivate', {
        type: 'deactivate',
        amountCents: 0,
        balanceBeforeCents: balance,
        balanceAfterCents: balance,
        timestamp: Math.round(issuedAt + duration * 0.86),
        userId: 'demo-user-sam',
        userName: 'Sam',
        note: 'Tijdelijk geblokkeerd in demo',
      });
      addEvent('activate', {
        type: 'activate',
        amountCents: 0,
        balanceBeforeCents: balance,
        balanceAfterCents: balance,
        timestamp: Math.round(issuedAt + duration * 0.9),
        userId: 'demo-user-lina',
        userName: 'Lina',
        note: 'Opnieuw geactiveerd in demo',
      });
    }
  });

  return events.sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id));
};

const makeLine = (product: Product, quantity: number, index: number): OrderItem => ({
  lineId: `demo-line-${index}-${product.id}`,
  product: { ...product },
  quantity,
});

const stableHash = (value: string) => Array.from(value).reduce(
  (hash, character) => ((hash << 5) - hash + character.charCodeAt(0)) | 0,
  0,
);

/**
 * Gives every demo product a reproducible demand shape. With a sufficiently
 * large catalogue, the final nine products are fixed representatives for all
 * profiles so automated and manual tests can inspect every forecast path.
 */
export const buildDemoDemandProfiles = (catalogue: Product[]): Record<string, DemoDemandProfile> => {
  const products = catalogue.filter((product) => product.isActive !== false && product.priceCents > 0);
  const forecastableProducts = products.filter((product) => product.stockQty != null);
  const representativeProducts = forecastableProducts.slice(-DEMO_DEMAND_PROFILES.length);
  const representativeProfiles = new Map(representativeProducts.map(
    (product, index) => [product.id, DEMO_DEMAND_PROFILES[index]],
  ));

  return Object.fromEntries(products.map((product) => {
    const profile = representativeProfiles.get(product.id)
      ?? DEMO_DEMAND_PROFILES[Math.abs(stableHash(product.id)) % 6];
    return [product.id, profile];
  }));
};

const demandWeight = (
  profile: DemoDemandProfile,
  date: Date,
  monthIndex: number,
  monthCount: number,
) => {
  const progress = monthCount <= 1 ? 1 : monthIndex / (monthCount - 1);
  const month = date.getMonth();
  switch (profile) {
    case 'rising': return 0.35 + 1.75 * progress ** 1.7;
    case 'falling': return Math.max(0.25, 1.9 - 1.55 * progress);
    case 'seasonal-summer': return month >= 4 && month <= 8 ? 2.4 : month === 3 || month === 9 ? 1.1 : 0.3;
    case 'seasonal-winter': return month >= 10 || month <= 1 ? 2.4 : month === 9 || month === 2 ? 1.1 : 0.3;
    case 'intermittent': return monthIndex % 3 === 0 ? 0.32 : 0.035;
    case 'new': return progress >= 0.91 ? 1.8 : 0;
    case 'insufficient': return 0;
    case 'dormant': return progress < 0.67 ? 1.15 : 0;
    default: return 1;
  }
};

const chooseDemandProduct = (
  candidates: Product[],
  allProducts: Product[],
  profiles: Record<string, DemoDemandProfile>,
  date: Date,
  monthIndex: number,
  monthCount: number,
  random: () => number,
) => {
  const weights = candidates.map((product) => {
    const catalogueIndex = allProducts.findIndex((candidate) => candidate.id === product.id);
    const recurringSellerWeight = catalogueIndex >= 0 && catalogueIndex < 8 ? 2.5 : 1;
    const productVariation = 0.82 + (Math.abs(stableHash(product.id)) % 37) / 100;
    return demandWeight(profiles[product.id] ?? 'stable', date, monthIndex, monthCount)
      * recurringSellerWeight
      * productVariation;
  });
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  if (totalWeight <= 0) return candidates[integer(random, 0, candidates.length - 1)];

  let target = random() * totalWeight;
  for (let index = 0; index < candidates.length; index += 1) {
    target -= weights[index];
    if (target <= 0) return candidates[index];
  }
  return candidates[candidates.length - 1];
};

/**
 * Creates 24 calendar months of historical retail activity using the products
 * currently available in the catalogue. It deliberately does not alter stock.
 */
export const buildDemoRetailDataset = (catalogue: Product[], now = new Date()): DemoRetailDataset => {
  const products = catalogue.filter((product) => product.isActive !== false && product.priceCents > 0);
  if (products.length === 0) return { customers: [], giftCards: [], giftCardEvents: [], transactions: [] };

  const random = createRandom();
  const start = startOfDemoPeriod(now);
  const monthCount = (now.getFullYear() - start.getFullYear()) * 12 + now.getMonth() - start.getMonth() + 1;
  const demandProfiles = buildDemoDemandProfiles(products);
  const forecastableProducts = products.filter((product) => product.stockQty != null);
  const hasControlledRepresentatives = forecastableProducts.length >= DEMO_DEMAND_PROFILES.length + 3;
  const controlledProducts = hasControlledRepresentatives
    ? forecastableProducts.slice(-DEMO_DEMAND_PROFILES.length)
    : [];
  const controlledProductIds = new Set(controlledProducts.map((product) => product.id));
  const generalSaleProducts = products.filter((product) => !controlledProductIds.has(product.id));
  const customerCount = Math.max(72, Math.min(120, products.length + 18));
  const customers: Customer[] = Array.from({ length: customerCount }, (_, index) => {
    const firstName = firstNames[index % firstNames.length];
    const lastName = lastNames[Math.floor(index / firstNames.length) % lastNames.length];
    return {
      id: `${DEMO_CUSTOMER_PREFIX}${String(index + 1).padStart(3, '0')}`,
      name: `${firstName} ${lastName}`,
      email: `${emailIdentifier(firstName)}.${emailIdentifier(lastName)}${index > firstNames.length ? index : ''}@voorbeeld.be`,
      phone: `04${String(70000000 + index * 917).slice(-8)}`,
      address: `${streets[index % streets.length]} ${integer(random, 3, 148)}, ${localities[index % localities.length]}`,
      notes: customerNotes[index % customerNotes.length],
      totalSpentCents: 0,
      visitCount: 0,
      createdAt: new Date(start.getTime() - integer(random, 0, 150) * DAY_MS).toISOString(),
      isActive: true,
    };
  });

  const transactions: Transaction[] = [];
  // A stable cohort makes the customer insight demonstrable without inventing a result:
  // some customers start with one gateway product and return, while a visible subgroup
  // makes only one purchase. The displayed return rate remains fully calculated.
  const gatewayCustomerIds = new Set(customers.slice(0, Math.max(18, Math.floor(customerCount * 0.58))).map((customer) => customer.id));
  const oneTimeCustomerIds = new Set(customers
    .slice(0, Math.max(18, Math.floor(customerCount * 0.58)))
    .filter((_, index) => index % 3 === 0)
    .map((customer) => customer.id));
  const retailProducts = products.filter((product) => !/gift|cadeau|consultation|service/i.test(`${product.name} ${product.category}`));
  const gatewayProduct = retailProducts[0] ?? products[0];
  const alternativeFirstProduct = retailProducts[1] ?? retailProducts[0] ?? products[0];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  let saleIndex = 0;

  while (cursor.getFullYear() < now.getFullYear() || cursor.getMonth() <= now.getMonth()) {
    const isCurrentMonth = cursor.getFullYear() === now.getFullYear() && cursor.getMonth() === now.getMonth();
    const lastAvailableDay = isCurrentMonth ? now.getDate() : new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    const monthIndex = (cursor.getFullYear() - start.getFullYear()) * 12 + cursor.getMonth() - start.getMonth();
    // A restrained seasonal pattern keeps charts alive without presenting invented performance as a forecast.
    const seasonalFactor = [0.92, 0.9, 1.02, 1.08, 1.12, 1.06, 0.96, 0.94, 1.02, 1.1, 1.22, 1.16][cursor.getMonth()];
    const growthFactor = 0.82 + Math.min(0.22, monthIndex * 0.017);
    const saleCount = Math.max(18, Math.round(lastAvailableDay * 2.15 * seasonalFactor * growthFactor) + integer(random, -4, 5));

    for (let saleInMonth = 0; saleInMonth < saleCount; saleInMonth += 1) {
      const day = integer(random, 1, Math.max(1, lastAvailableDay));
      const hour = integer(random, 9, isCurrentMonth && day === now.getDate() ? Math.max(9, now.getHours()) : 18);
      const minute = isCurrentMonth && day === now.getDate() && hour === now.getHours()
        ? integer(random, 0, now.getMinutes())
        : integer(random, 0, 59);
      const timestamp = new Date(
        cursor.getFullYear(),
        cursor.getMonth(),
        day,
        hour,
        minute,
      ).getTime();
      const monthsSinceStart = monthIndex;
      // The last 14 customers deliberately stop visiting after the first demo months.
      // This creates a factual retention signal from real seeded visits, not a hard-coded alert.
      const eligibleCustomers = (monthsSinceStart >= 10 ? customers.slice(0, customerCount - 14) : customers)
        .filter((customer) => !oneTimeCustomerIds.has(customer.id) || customer.visitCount === 0);
      const returningCandidates = eligibleCustomers.filter((customer) => gatewayCustomerIds.has(customer.id) && !oneTimeCustomerIds.has(customer.id));
      const hasCustomer = random() < 0.78;
      const customer = hasCustomer
        ? (random() < 0.72 && returningCandidates.length > 0
          ? returningCandidates[integer(random, 0, returningCandidates.length - 1)]
          : eligibleCustomers[integer(random, 0, eligibleCustomers.length - 1)])
        : undefined;
      const isFirstCustomerPurchase = customer?.visitCount === 0;
      // Favour a set of recurring sellers while respecting each product's demand shape.
      // The first purchase is intentional: it creates a real, explainable gateway-product
      // pattern for the demo instead of displaying a hard-coded retention percentage.
      const featuredProduct = isFirstCustomerPurchase
        ? (gatewayCustomerIds.has(customer!.id) ? gatewayProduct : alternativeFirstProduct)
        : chooseDemandProduct(
          generalSaleProducts.length > 0 ? generalSaleProducts : products,
          products,
          demandProfiles,
          new Date(timestamp),
          monthIndex,
          monthCount,
          random,
        );
      const items = [makeLine(featuredProduct, random() > 0.9 ? 2 : 1, saleIndex)];
      const extraLines = random() > 0.34 ? integer(random, 1, 2) : 0;

      for (let line = 0; line < extraLines; line += 1) {
        const product = chooseDemandProduct(
          generalSaleProducts.length > 0 ? generalSaleProducts : products,
          products,
          demandProfiles,
          new Date(timestamp),
          monthIndex,
          monthCount,
          random,
        );
        if (product.id !== featuredProduct.id) items.push(makeLine(product, random() > 0.94 ? 2 : 1, saleIndex * 10 + line));
      }

      const provisional = calculateTotals(items);
      const discountCents = random() < 0.13 ? Math.round(provisional.subtotal * (random() < 0.68 ? 0.1 : 0.15)) : 0;
      const totals = calculateTotals(items, discountCents);
      const employee = team[saleIndex % team.length];
      if (customer) {
        customer.visitCount += 1;
        customer.totalSpentCents += totals.total;
        if (!customer.lastVisitAt || timestamp > new Date(customer.lastVisitAt).getTime()) customer.lastVisitAt = new Date(timestamp).toISOString();
      }

      const paymentMethod: PaymentMethod = random() < 0.74 ? 'PIN' : random() < 0.9 ? 'Cash' : 'Cadeaubon';
      transactions.push({
        tableId: 1,
        items,
        subtotalCents: totals.subtotal,
        vat12Cents: totals.vat12,
        vat21Cents: totals.vat21,
        totalCents: totals.total,
        discountCents: totals.discount,
        paymentMethod,
        timestamp,
        isFinalized: 1,
        userId: employee.id,
        userName: employee.name,
        customerId: customer?.id,
        source: 'demo',
      });
      saleIndex += 1;
    }

    cursor.setMonth(cursor.getMonth() + 1);
  }

  const representativeByProfile = new Map<DemoDemandProfile, Product>();
  for (const product of controlledProducts) {
    representativeByProfile.set(demandProfiles[product.id], product);
  }

  const addControlledSale = (product: Product | undefined, daysAgo: number, quantity: number) => {
    if (!product || quantity <= 0) return;
    const timestamp = now.getTime() - daysAgo * DAY_MS - 60 * 60 * 1000;
    if (timestamp < start.getTime() || timestamp > now.getTime()) return;
    const items = [makeLine(product, quantity, saleIndex)];
    const totals = calculateTotals(items);
    const employee = team[saleIndex % team.length];
    transactions.push({
      tableId: 1,
      items,
      subtotalCents: totals.subtotal,
      vat12Cents: totals.vat12,
      vat21Cents: totals.vat21,
      totalCents: totals.total,
      discountCents: 0,
      paymentMethod: 'PIN',
      timestamp,
      isFinalized: 1,
      userId: employee.id,
      userName: employee.name,
      source: 'demo',
    });
    saleIndex += 1;
  };

  // Exact calibration histories make every forecast branch reproducible. These
  // are deliberately separate from the general demo traffic above.
  for (let daysAgo = 700; daysAgo >= 0; daysAgo -= 4) {
    addControlledSale(representativeByProfile.get('stable'), daysAgo, 1);
  }
  for (let daysAgo = 159; daysAgo >= 0; daysAgo -= 3) {
    const quantity = daysAgo <= 29 ? 3 : daysAgo <= 59 ? 2 : 1;
    addControlledSale(representativeByProfile.get('rising'), daysAgo, quantity);
  }
  for (let daysAgo = 159; daysAgo >= 0; daysAgo -= 3) {
    const quantity = daysAgo <= 29 ? 1 : daysAgo <= 59 ? 2 : 3;
    addControlledSale(representativeByProfile.get('falling'), daysAgo, quantity);
  }
  for (let daysAgo = 700; daysAgo >= 0; daysAgo -= 10) {
    const date = new Date(now.getTime() - daysAgo * DAY_MS);
    const inSummerSeason = date.getMonth() >= 4 && date.getMonth() <= 8;
    if (inSummerSeason || daysAgo % 30 === 0) {
      addControlledSale(representativeByProfile.get('seasonal-summer'), daysAgo, inSummerSeason ? 2 : 1);
    }
  }
  for (let daysAgo = 700; daysAgo >= 0; daysAgo -= 10) {
    const date = new Date(now.getTime() - daysAgo * DAY_MS);
    const inWinterSeason = date.getMonth() >= 10 || date.getMonth() <= 1;
    if (inWinterSeason || daysAgo % 30 === 0) {
      addControlledSale(representativeByProfile.get('seasonal-winter'), daysAgo, inWinterSeason ? 2 : 1);
    }
  }
  [680, 590, 500, 410, 330, 260, 190, 120, 75, 35, 8].forEach((daysAgo, index) => {
    addControlledSale(representativeByProfile.get('intermittent'), daysAgo, index % 3 === 0 ? 2 : 1);
  });
  [42, 36, 30, 24, 18, 12, 6, 1].forEach((daysAgo) => {
    addControlledSale(representativeByProfile.get('new'), daysAgo, 1);
  });
  addControlledSale(representativeByProfile.get('insufficient'), 8, 1);
  for (let daysAgo = 500; daysAgo >= 200; daysAgo -= 20) {
    addControlledSale(representativeByProfile.get('dormant'), daysAgo, 1);
  }

  const giftCards = buildDemoGiftCards(customers, now);
  return {
    customers,
    giftCards,
    giftCardEvents: buildDemoGiftCardEvents(giftCards, now),
    transactions: transactions.sort((a, b) => a.timestamp - b.timestamp),
  };
};

export const clearDemoRetailData = async (): Promise<void> => {
  await db.transaction('rw', [db.transactions, db.customers, db.gift_cards, db.gift_card_events, db.users], async () => {
    const transactionIds = (await db.transactions.where('source').equals('demo').toArray())
      .map((transaction) => transaction.id)
      .filter((id): id is number => id != null);
    if (transactionIds.length > 0) await db.transactions.bulkDelete(transactionIds);

    const customerIds = (await db.customers.where('id').startsWith(DEMO_CUSTOMER_PREFIX).toArray())
      .map((customer) => customer.id);
    if (customerIds.length > 0) await db.customers.bulkDelete(customerIds);

    const giftCardIds = (await db.gift_cards.where('id').startsWith(DEMO_GIFT_CARD_PREFIX).toArray())
      .map((giftCard) => giftCard.id);
    const giftCardEventIds = (await db.gift_card_events.where('id').startsWith(DEMO_GIFT_CARD_EVENT_PREFIX).toArray())
      .map((event) => event.id);
    if (giftCardEventIds.length > 0) await db.gift_card_events.bulkDelete(giftCardEventIds);
    if (giftCardIds.length > 0) await db.gift_cards.bulkDelete(giftCardIds);

    const demoUserIds = (await db.users.where('id').startsWith('demo-user-').toArray())
      .map((user) => user.id);
    if (demoUserIds.length > 0) await db.users.bulkDelete(demoUserIds);
  });
};

export const seedDemoRetailData = async (now = new Date()): Promise<DemoSeedResult> => {
  const [existingTransactions, existingGiftCards, existingGiftCardEvents, products] = await Promise.all([
    db.transactions.where('source').equals('demo').count(),
    db.gift_cards.where('id').startsWith(DEMO_GIFT_CARD_PREFIX).toArray(),
    db.gift_card_events.where('id').startsWith(DEMO_GIFT_CARD_EVENT_PREFIX).toArray(),
    db.products.toArray(),
  ]);
  const dataset = buildDemoRetailDataset(products, now);

  if (existingTransactions > 0) {
    const demoCustomers = await db.customers
      .filter((customer) => customer.id.startsWith(DEMO_CUSTOMER_PREFIX))
      .toArray();
    const expectedGiftCards = buildDemoGiftCards(
      dataset.customers.length > 0 ? dataset.customers : demoCustomers,
      now,
    );
    const existingIds = new Set(existingGiftCards.map((giftCard) => giftCard.id));
    const missingGiftCards = expectedGiftCards.filter((giftCard) => !existingIds.has(giftCard.id));
    const actualGiftCards = [...existingGiftCards, ...missingGiftCards];
    const expectedEvents = buildDemoGiftCardEvents(actualGiftCards, now);
    const existingEventIds = new Set(existingGiftCardEvents.map((event) => event.id));
    const missingEvents = expectedEvents.filter((event) => !existingEventIds.has(event.id));
    await db.transaction('rw', db.gift_cards, db.gift_card_events, async () => {
      if (missingGiftCards.length > 0) await db.gift_cards.bulkPut(missingGiftCards);
      if (missingEvents.length > 0) await db.gift_card_events.bulkPut(missingEvents);
    });
    return {
      customers: 0,
      giftCards: existingGiftCards.length + missingGiftCards.length,
      giftCardEvents: existingGiftCardEvents.length + missingEvents.length,
      transactions: existingTransactions,
      alreadyPresent: true,
    };
  }

  if (dataset.transactions.length === 0) throw new Error('Voeg eerst minstens één actief product met een verkoopprijs toe.');

  const existingGiftCardIds = new Set(existingGiftCards.map((giftCard) => giftCard.id));
  const missingGiftCards = dataset.giftCards.filter((giftCard) => !existingGiftCardIds.has(giftCard.id));
  const existingGiftCardEventIds = new Set(existingGiftCardEvents.map((event) => event.id));
  const missingGiftCardEvents = dataset.giftCardEvents.filter((event) => !existingGiftCardEventIds.has(event.id));

  const existingDemoUsers = await db.users.filter((user) => user.id.startsWith('demo-user-')).toArray();
  const existingDemoUserIds = new Set(existingDemoUsers.map((u) => u.id));
  const missingDemoUsers = team
    .filter((u) => !existingDemoUserIds.has(u.id))
    .map((u) => ({
      id: u.id,
      name: u.name,
      firstName: u.name,
      lastName: '',
      role: 'cashier' as const,
      pinHash: 'demo',
      email: `${u.name.toLowerCase()}@demo.pwayment.com`,
      createdAt: now.toISOString(),
      storeName: 'PWAYMENT Demo Store'
    }));

  await db.transaction('rw', [db.transactions, db.customers, db.gift_cards, db.gift_card_events, db.users], async () => {
    await db.customers.bulkPut(dataset.customers);
    await db.transactions.bulkAdd(dataset.transactions);
    if (missingGiftCards.length > 0) await db.gift_cards.bulkPut(missingGiftCards);
    if (missingGiftCardEvents.length > 0) await db.gift_card_events.bulkPut(missingGiftCardEvents);
    if (missingDemoUsers.length > 0) await db.users.bulkPut(missingDemoUsers);
  });

  return {
    customers: dataset.customers.length,
    giftCards: existingGiftCards.length + missingGiftCards.length,
    giftCardEvents: existingGiftCardEvents.length + missingGiftCardEvents.length,
    transactions: dataset.transactions.length,
    alreadyPresent: false,
  };
};

export const isDemoTransaction = (transaction: Transaction) => transaction.source === 'demo';
