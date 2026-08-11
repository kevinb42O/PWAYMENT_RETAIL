import { create } from "zustand";
import {
  Customer,
  GiftCard,
  GiftCardEvent,
  GiftCardEventType,
  PaymentTender,
} from "../types";
import { db } from "../db/db";
import { audit, useAuth } from "../auth/useAuth";
import { upsertSupabaseCustomers } from "../services/supabaseMutations";
import { mutateSupabaseGiftCard } from "../services/supabaseGiftCards";

interface CustomersState {
  customers: Customer[];
  giftCards: GiftCard[];
  hydrated: boolean;

  hydrate: (force?: boolean) => Promise<void>;
  upsertCustomer: (c: Customer) => Promise<void>;
  removeCustomer: (id: string) => Promise<void>;
  restoreCustomer: (id: string) => Promise<void>;
  /** Mirror rows already committed to Dexie (e.g. by the checkout service). */
  syncPersisted: (rows: {
    customer?: Customer;
    giftCards?: GiftCard[];
  }) => void;

  findGiftCardByCode: (code: string) => GiftCard | null;
  addGiftCard: (
    card: GiftCard,
    paymentTenders?: PaymentTender[],
  ) => Promise<void>;
  rechargeGiftCard: (
    id: string,
    amountCents: number,
    paymentTenders?: PaymentTender[],
  ) => Promise<void>;
  deactivateGiftCard: (id: string, reason?: string) => Promise<void>;
  activateGiftCard: (id: string, reason?: string) => Promise<void>;
}

const generateGiftCardCode = (): string => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(12);
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error(
      "Veilige codegeneratie is niet beschikbaar in deze browser.",
    );
  }
  globalThis.crypto.getRandomValues(bytes);
  let code = "";
  for (let i = 0; i < 12; i++) {
    if (i > 0 && i % 4 === 0) code += "-";
    code += chars[bytes[i] % chars.length];
  }
  return code;
};

const generateId = (): string => {
  if (!globalThis.crypto?.randomUUID) {
    throw new Error(
      "Veilige ID-generatie is niet beschikbaar in deze browser.",
    );
  }
  return globalThis.crypto.randomUUID();
};

const normalizeGiftCardCode = (code: string): string =>
  code.trim().toUpperCase().replace(/[\s-]/g, "");

const validatedPaymentTenders = (
  amountCents: number,
  tenders?: PaymentTender[],
): PaymentTender[] => {
  const rows = tenders?.length
    ? tenders
    : [{ method: "Cash", amountCents } as PaymentTender];
  const total = rows.reduce((sum, tender) => sum + tender.amountCents, 0);
  if (
    rows.some(
      (tender) =>
        !Number.isSafeInteger(tender.amountCents) || tender.amountCents <= 0,
    ) ||
    total !== amountCents
  ) {
    throw new Error(
      "De betaalmiddelen sluiten niet aan op de cadeaubonwaarde.",
    );
  }
  return rows;
};

const makeGiftCardEvent = (
  card: GiftCard,
  type: GiftCardEventType,
  amountCents: number,
  balanceBeforeCents: number,
  balanceAfterCents: number,
  timestamp = Date.now(),
): GiftCardEvent => {
  const { currentUserId, currentUserName } = useAuth.getState();
  return {
    id: `gift-card-event-${generateId()}`,
    giftCardId: card.id,
    giftCardCode: card.code,
    type,
    amountCents,
    balanceBeforeCents,
    balanceAfterCents,
    timestamp,
    customerId: card.customerId,
    userId: currentUserId ?? undefined,
    userName: currentUserName ?? undefined,
    source: "live",
  };
};

export const useCustomers = create<CustomersState>((set, get) => ({
  customers: [],
  giftCards: [],
  hydrated: false,

  hydrate: async (force = false) => {
    if (get().hydrated && !force) return;
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
    await upsertSupabaseCustomers(useAuth.getState().currentStoreId, [next]);
    await db.customers.put(next);
    set((s) => {
      const idx = s.customers.findIndex((x) => x.id === c.id);
      const out =
        idx >= 0
          ? s.customers.map((x) => (x.id === c.id ? next : x))
          : [...s.customers, next];
      return { customers: out };
    });
    void audit(existing ? "customer.update" : "customer.create", {
      customerId: c.id,
      name: c.name,
    });
  },

  removeCustomer: async (id) => {
    const cur = await db.customers.get(id);
    if (!cur) return;
    const next: Customer = { ...cur, isActive: false };
    await upsertSupabaseCustomers(useAuth.getState().currentStoreId, [next]);
    await db.customers.put(next);
    set((s) => ({
      customers: s.customers.map((x) => (x.id === id ? next : x)),
    }));
    void audit("customer.delete", { customerId: id, name: cur.name });
  },

  restoreCustomer: async (id) => {
    const cur = await db.customers.get(id);
    if (!cur) return;
    const next: Customer = { ...cur, isActive: true };
    await upsertSupabaseCustomers(useAuth.getState().currentStoreId, [next]);
    await db.customers.put(next);
    set((s) => ({
      customers: s.customers.map((x) => (x.id === id ? next : x)),
    }));
    void audit("customer.restore", { customerId: id, name: cur.name });
  },

  syncPersisted: ({ customer, giftCards }) => {
    set((s) => ({
      customers: customer
        ? s.customers.map((x) => (x.id === customer.id ? customer : x))
        : s.customers,
      giftCards: giftCards?.length
        ? s.giftCards.map((x) => giftCards.find((g) => g.id === x.id) ?? x)
        : s.giftCards,
    }));
  },

  findGiftCardByCode: (code) => {
    const normalized = code.trim().toUpperCase().replace(/[\s-]/g, "");
    return (
      get().giftCards.find(
        (gc) => gc.code.replace(/[\s-]/g, "") === normalized,
      ) ?? null
    );
  },

  addGiftCard: async (card, paymentTenders) => {
    const next: GiftCard = {
      ...card,
      id: card.id || generateId(),
      code: (card.code || generateGiftCardCode()).trim().toUpperCase(),
    };
    const issuedAt = Date.parse(next.issuedAt);
    const event = makeGiftCardEvent(
      next,
      "issue",
      next.initialCents,
      0,
      next.balanceCents,
      Number.isFinite(issuedAt) ? issuedAt : Date.now(),
    );
    event.paymentTenders = validatedPaymentTenders(
      next.initialCents,
      paymentTenders,
    );
    const storeId = useAuth.getState().currentStoreId;
    if (storeId) {
      await mutateSupabaseGiftCard(storeId, {
        action: "issue",
        card: next,
        event,
        paymentTenders: event.paymentTenders,
      });
      return;
    }
    await db.transaction("rw", db.gift_cards, db.gift_card_events, async () => {
      const normalized = normalizeGiftCardCode(next.code);
      const duplicate = await db.gift_cards
        .filter((row) => normalizeGiftCardCode(row.code) === normalized)
        .first();
      if (duplicate) throw new Error(`Cadeauboncode ${next.code} bestaat al.`);
      await db.gift_cards.add(next);
      await db.gift_card_events.add(event);
    });
    set((s) => ({ giftCards: [...s.giftCards, next] }));
    void audit("giftcard.create", {
      giftCardId: next.id,
      code: next.code,
      initialCents: next.initialCents,
      customerId: next.customerId,
    });
  },

  rechargeGiftCard: async (id, amountCents, paymentTenders) => {
    if (!Number.isSafeInteger(amountCents) || amountCents <= 0) return;
    const cur = await db.gift_cards.get(id);
    if (!cur) return;
    const next: GiftCard = {
      ...cur,
      balanceCents: cur.balanceCents + amountCents,
    };
    const event = makeGiftCardEvent(
      cur,
      "recharge",
      amountCents,
      cur.balanceCents,
      next.balanceCents,
    );
    event.paymentTenders = validatedPaymentTenders(amountCents, paymentTenders);
    const storeId = useAuth.getState().currentStoreId;
    if (storeId) {
      await mutateSupabaseGiftCard(storeId, {
        action: "recharge",
        card: cur,
        event,
        paymentTenders: event.paymentTenders,
      });
      return;
    }
    await db.transaction("rw", db.gift_cards, db.gift_card_events, async () => {
      await db.gift_cards.put(next);
      await db.gift_card_events.add(event);
    });
    set((s) => ({
      giftCards: s.giftCards.map((x) => (x.id === id ? next : x)),
    }));
    void audit("giftcard.recharge", {
      giftCardId: id,
      code: cur.code,
      amountCents,
      newBalance: next.balanceCents,
    });
  },

  deactivateGiftCard: async (id, reason) => {
    const cur = await db.gift_cards.get(id);
    if (!cur || !cur.isActive) return;
    const next: GiftCard = { ...cur, isActive: false };
    const event = makeGiftCardEvent(
      cur,
      "deactivate",
      0,
      cur.balanceCents,
      cur.balanceCents,
    );
    event.note = reason?.trim() || undefined;
    const storeId = useAuth.getState().currentStoreId;
    if (storeId) {
      await mutateSupabaseGiftCard(storeId, {
        action: "deactivate",
        card: cur,
        event,
      });
      return;
    }
    await db.transaction("rw", db.gift_cards, db.gift_card_events, async () => {
      await db.gift_cards.put(next);
      await db.gift_card_events.add(event);
    });
    set((s) => ({
      giftCards: s.giftCards.map((x) => (x.id === id ? next : x)),
    }));
    void audit("giftcard.deactivate", { giftCardId: id, code: cur.code, reason: event.note });
  },

  activateGiftCard: async (id, reason) => {
    const cur = await db.gift_cards.get(id);
    if (!cur || cur.isActive) return;
    const next: GiftCard = { ...cur, isActive: true };
    const event = makeGiftCardEvent(
      cur,
      "activate",
      0,
      cur.balanceCents,
      cur.balanceCents,
    );
    event.note = reason?.trim() || undefined;
    const storeId = useAuth.getState().currentStoreId;
    if (storeId) {
      await mutateSupabaseGiftCard(storeId, {
        action: "activate",
        card: cur,
        event,
      });
      return;
    }
    await db.transaction("rw", db.gift_cards, db.gift_card_events, async () => {
      await db.gift_cards.put(next);
      await db.gift_card_events.add(event);
    });
    set((s) => ({
      giftCards: s.giftCards.map((x) => (x.id === id ? next : x)),
    }));
    void audit("giftcard.activate", { giftCardId: id, code: cur.code, reason: event.note });
  },
}));

export { generateId, generateGiftCardCode };
