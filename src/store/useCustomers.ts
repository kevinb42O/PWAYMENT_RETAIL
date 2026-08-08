import { create } from 'zustand';
import { Customer, GiftCard } from '../types';
import { db } from '../db/db';
import { audit } from '../auth/useAuth';

interface CustomersState {
  customers: Customer[];
  giftCards: GiftCard[];
  hydrated: boolean;

  hydrate: () => Promise<void>;
  upsertCustomer: (c: Customer) => Promise<void>;
  removeCustomer: (id: string) => Promise<void>;
  restoreCustomer: (id: string) => Promise<void>;
  recordVisit: (customerId: string, spentCents: number) => Promise<void>;

  findGiftCardByCode: (code: string) => GiftCard | null;
  addGiftCard: (card: GiftCard) => Promise<void>;
  rechargeGiftCard: (id: string, amountCents: number) => Promise<void>;
  deductGiftCard: (id: string, amountCents: number) => Promise<void>;
  deactivateGiftCard: (id: string) => Promise<void>;
  activateGiftCard: (id: string) => Promise<void>;
}

const generateGiftCardCode = (): string => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 12; i++) {
    if (i > 0 && i % 4 === 0) code += '-';
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
};

const generateId = (): string =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const useCustomers = create<CustomersState>((set, get) => ({
  customers: [],
  giftCards: [],
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return;
    const [customers, giftCards] = await Promise.all([
      db.customers.toArray(),
      db.gift_cards.toArray(),
    ]);
    set({ customers, giftCards, hydrated: true });
  },

  upsertCustomer: async (c) => {
    const existing = await db.customers.get(c.id);
    const next: Customer = {
      ...c,
      name: c.name.trim(),
      email: c.email?.trim() || undefined,
      phone: c.phone?.trim() || undefined,
      address: c.address?.trim() || undefined,
      notes: c.notes?.trim() || undefined,
    };
    await db.customers.put(next);
    set((s) => {
      const idx = s.customers.findIndex((x) => x.id === c.id);
      const out = idx >= 0
        ? s.customers.map((x) => (x.id === c.id ? next : x))
        : [...s.customers, next];
      return { customers: out };
    });
    void audit(existing ? 'customer.update' : 'customer.create', {
      customerId: c.id,
      name: c.name,
    });
  },

  removeCustomer: async (id) => {
    const cur = await db.customers.get(id);
    if (!cur) return;
    const next: Customer = { ...cur, isActive: false };
    await db.customers.put(next);
    set((s) => ({ customers: s.customers.map((x) => (x.id === id ? next : x)) }));
    void audit('customer.delete', { customerId: id, name: cur.name });
  },

  restoreCustomer: async (id) => {
    const cur = await db.customers.get(id);
    if (!cur) return;
    const next: Customer = { ...cur, isActive: true };
    await db.customers.put(next);
    set((s) => ({ customers: s.customers.map((x) => (x.id === id ? next : x)) }));
    void audit('customer.restore', { customerId: id, name: cur.name });
  },

  recordVisit: async (customerId, spentCents) => {
    const cur = await db.customers.get(customerId);
    if (!cur) return;
    const next: Customer = {
      ...cur,
      visitCount: cur.visitCount + 1,
      totalSpentCents: cur.totalSpentCents + spentCents,
      lastVisitAt: new Date().toISOString(),
    };
    await db.customers.put(next);
    set((s) => ({ customers: s.customers.map((x) => (x.id === customerId ? next : x)) }));
  },

  findGiftCardByCode: (code) => {
    const normalized = code.trim().toUpperCase().replace(/[\s-]/g, '');
    return get().giftCards.find((gc) => gc.code.replace(/[\s-]/g, '') === normalized) ?? null;
  },

  addGiftCard: async (card) => {
    const next: GiftCard = {
      ...card,
      id: card.id || generateId(),
      code: card.code || generateGiftCardCode(),
    };
    await db.gift_cards.put(next);
    set((s) => ({ giftCards: [...s.giftCards, next] }));
    void audit('giftcard.create', {
      giftCardId: next.id,
      code: next.code,
      initialCents: next.initialCents,
      customerId: next.customerId,
    });
  },

  rechargeGiftCard: async (id, amountCents) => {
    const cur = await db.gift_cards.get(id);
    if (!cur) return;
    const next: GiftCard = {
      ...cur,
      balanceCents: cur.balanceCents + amountCents,
      initialCents: cur.initialCents + amountCents,
    };
    await db.gift_cards.put(next);
    set((s) => ({ giftCards: s.giftCards.map((x) => (x.id === id ? next : x)) }));
    void audit('giftcard.recharge', {
      giftCardId: id,
      code: cur.code,
      amountCents,
      newBalance: next.balanceCents,
    });
  },

  deductGiftCard: async (id, amountCents) => {
    const cur = await db.gift_cards.get(id);
    if (!cur) return;
    const next: GiftCard = {
      ...cur,
      balanceCents: Math.max(0, cur.balanceCents - amountCents),
    };
    await db.gift_cards.put(next);
    set((s) => ({ giftCards: s.giftCards.map((x) => (x.id === id ? next : x)) }));
    void audit('giftcard.deduct', {
      giftCardId: id,
      code: cur.code,
      amountCents,
      newBalance: next.balanceCents,
    });
  },

  deactivateGiftCard: async (id) => {
    const cur = await db.gift_cards.get(id);
    if (!cur) return;
    const next: GiftCard = { ...cur, isActive: false };
    await db.gift_cards.put(next);
    set((s) => ({ giftCards: s.giftCards.map((x) => (x.id === id ? next : x)) }));
    void audit('giftcard.deactivate', { giftCardId: id, code: cur.code });
  },

  activateGiftCard: async (id) => {
    const cur = await db.gift_cards.get(id);
    if (!cur) return;
    const next: GiftCard = { ...cur, isActive: true };
    await db.gift_cards.put(next);
    set((s) => ({ giftCards: s.giftCards.map((x) => (x.id === id ? next : x)) }));
    void audit('giftcard.activate', { giftCardId: id, code: cur.code });
  },
}));

export { generateId, generateGiftCardCode };
