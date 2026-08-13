import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  CustomerCard,
  Modifier,
  OrderItem,
  Product,
  VoidEntry,
} from '../types';
import { audit, useAuth } from '../auth/useAuth';
import { db } from '../db/db';
import { useProducts } from './useProducts';
import { recordSupabaseVoid } from '../services/supabaseAudit';

interface CartDiscount {
  amountCents: number;
  reason: string;
  approvedByUserId: string;
}

interface RetailCart {
  id: number;
  orders: OrderItem[];
}

export type MainView =
  | 'pos'
  | 'service'
  | 'integration-hub'
  | 'insights'
  | 'z-report'
  | 'audit-log'
  | 'admin'
  | 'customers'
  | 'profile';

export interface CartScanResult {
  status: 'empty' | 'matched' | 'not-found' | 'out-of-stock';
  code: string;
  product?: Product;
  matchedOn?: 'barcode' | 'sku';
}

interface POSState {
  cart: RetailCart;
  mobileView: 'menu' | 'cart';
  mainView: MainView;
  /** Manual cart-level discount (manager-approved). */
  cartDiscount: CartDiscount | null;

  setMainView: (view: MainView) => void;
  setMobileView: (view: 'menu' | 'cart') => void;

  addOrderItem: (product: Product) => void;
  scanCodeToCart: (code: string) => CartScanResult;
  removeOrderItem: (lineId: string) => void;
  updateOrderItemQuantity: (lineId: string, quantity: number) => void;
  setOrderItemNotes: (lineId: string, notes: string) => void;
  setOrderItemModifiers: (lineId: string, modifiers: Modifier[]) => void;
  voidOrderItem: (lineId: string, reason: string) => Promise<void>;

  setOrders: (orders: OrderItem[]) => void;
  clearCart: () => void;

  setCartDiscount: (discount: CartDiscount | null) => void;
  resetCartExtras: () => void;

  cartGiftCards: { id: string; amountCents: number; code: string }[];
  addCartGiftCard: (gc: { id: string; amountCents: number; code: string }) => void;
  removeCartGiftCard: (id: string) => void;

  linkedCustomerId: string | null;
  linkCustomer: (customerId: string) => void;
  unlinkCustomer: () => void;
}

const RETAIL_CART_ID = 1;

const initialCart: RetailCart = {
  id: RETAIL_CART_ID,
  orders: [],
};

const lineId = () => globalThis.crypto.randomUUID();

const sameLineCandidate = (a: OrderItem, b: OrderItem) =>
  a.product.id === b.product.id &&
  (a.notes ?? '') === (b.notes ?? '') &&
  JSON.stringify(a.modifiers ?? []) === JSON.stringify(b.modifiers ?? []);

export const useStore = create<POSState>()(
  persist(
    (set, get) => ({
      cart: initialCart,
      mobileView: 'menu',
      mainView: 'pos',
      cartDiscount: null,
      cartGiftCards: [],
      linkedCustomerId: null,

      setMainView: (view) => set({ mainView: view }),
      setMobileView: (view) => set({ mobileView: view }),

      addOrderItem: (product) => {
        void audit('order.add', { cartId: RETAIL_CART_ID, productId: product.id });
        set((state) => {
          const candidate: OrderItem = {
            lineId: '',
            product,
            quantity: 1,
          };
          const existing = state.cart.orders.find((o) => sameLineCandidate(o, candidate));
          const orders = existing
            ? state.cart.orders.map((o) =>
                o.lineId === existing.lineId
                  ? { ...o, quantity: Math.min(o.quantity + 1, product.stockQty ?? Number.POSITIVE_INFINITY) }
                  : o,
              )
            : [...state.cart.orders, { ...candidate, lineId: lineId() }];
          return { cart: { ...state.cart, orders } };
        });
      },

      scanCodeToCart: (rawCode) => {
        const code = rawCode.trim();
        if (!code) {
          return { status: 'empty', code };
        }

        const match = useProducts.getState().findByScanCode(code);
        if (!match) {
          return { status: 'not-found', code };
        }

        if (match.product.stockQty != null && match.product.stockQty <= 0) {
          return {
            status: 'out-of-stock',
            code,
            product: match.product,
            matchedOn: match.matchedOn,
          };
        }

        get().addOrderItem(match.product);
        return {
          status: 'matched',
          code,
          product: match.product,
          matchedOn: match.matchedOn,
        };
      },

      removeOrderItem: (lineId) => {
        void audit('order.remove', { cartId: RETAIL_CART_ID, lineId });
        set((state) => ({
          cart: {
            ...state.cart,
            orders: state.cart.orders.filter((o) => o.lineId !== lineId),
          },
        }));
      },

      updateOrderItemQuantity: (lineId, quantity) => {
        void audit('order.update', { cartId: RETAIL_CART_ID, lineId, quantity });
        set((state) => {
          if (quantity <= 0) {
            return {
              cart: {
                ...state.cart,
                orders: state.cart.orders,
              },
            };
          }
          return {
            cart: {
              ...state.cart,
              orders: state.cart.orders.map((o) =>
                o.lineId === lineId ? { ...o, quantity: Math.min(quantity, o.product.stockQty ?? Number.POSITIVE_INFINITY) } : o,
              ),
            },
          };
        });
      },

      setOrderItemNotes: (lineId, notes) => {
        void audit('order.note', { cartId: RETAIL_CART_ID, lineId, notes });
        set((state) => ({
          cart: {
            ...state.cart,
            orders: state.cart.orders.map((o) =>
              o.lineId === lineId ? { ...o, notes: notes || undefined } : o,
            ),
          },
        }));
      },

      setOrderItemModifiers: (lineId, modifiers) => {
        void audit('order.modifier', { cartId: RETAIL_CART_ID, lineId, modifiers });
        set((state) => ({
          cart: {
            ...state.cart,
            orders: state.cart.orders.map((o) =>
              o.lineId === lineId ? { ...o, modifiers: modifiers.length ? modifiers : undefined } : o,
            ),
          },
        }));
      },

      voidOrderItem: async (lineId, reason) => {
        const auth = useAuth.getState();
        const state = useStore.getState();
        const order = state.cart.orders.find((o) => o.lineId === lineId);
        if (!order) return;
        const modSum = (order.modifiers ?? []).reduce((s, m) => s + m.deltaCents, 0);
        const amountCents = (order.product.priceCents + modSum) * order.quantity;
        const entry: VoidEntry = {
          timestamp: Date.now(),
          tableId: RETAIL_CART_ID,
          productId: order.product.id,
          productName: order.product.name,
          quantity: order.quantity,
          amountCents,
          reason,
          byUserId: auth.currentUserId ?? 'unknown',
          byUserName: auth.currentUserName ?? 'onbekend',
        };
        try {
          if (auth.currentStoreId) {
            const requestId = globalThis.crypto?.randomUUID?.() ?? `${entry.timestamp}-${lineId}`;
            await recordSupabaseVoid(auth.currentStoreId, requestId, entry);
          }
          await db.voids.add(entry);
        } catch (e) {
          console.warn('void persistence failed', e);
        }
        await audit('order.void', { cartId: RETAIL_CART_ID, lineId, productId: order.product.id, amountCents, reason });
        set((s) => ({
          cart: {
            ...s.cart,
            orders: s.cart.orders.filter((o) => o.lineId !== lineId),
          },
        }));
      },

      setOrders: (orders) =>
        set((state) => ({
          cart: {
            ...state.cart,
            orders,
          },
        })),

      clearCart: () => {
        void audit('table.clear', { cartId: RETAIL_CART_ID });
        set((state) => ({
          cart: {
            ...state.cart,
            orders: [],
            customerCard: null,
          },
          cartDiscount: null,
          cartGiftCards: [],
          linkedCustomerId: null,
        }));
      },

      setCartDiscount: (discount) => {
        if (discount) {
          void audit('discount.apply', {
            cartId: RETAIL_CART_ID,
            amountCents: discount.amountCents,
            reason: discount.reason,
          });
        }
        set({ cartDiscount: discount });
      },

      resetCartExtras: () =>
        set({
          cartDiscount: null,
          cartGiftCards: [],
          linkedCustomerId: null,
        }),

      addCartGiftCard: (gc) =>
        set((s) => ({
          cartGiftCards: s.cartGiftCards.some((g) => g.id === gc.id)
            ? s.cartGiftCards.map((g) =>
                g.id === gc.id ? { ...g, amountCents: g.amountCents + gc.amountCents } : g,
              )
            : [...s.cartGiftCards, gc],
        })),
      removeCartGiftCard: (id) => set((s) => ({ cartGiftCards: s.cartGiftCards.filter((g) => g.id !== id) })),

      linkCustomer: (customerId) => set({ linkedCustomerId: customerId }),
      unlinkCustomer: () => set({ linkedCustomerId: null }),
    }),
    {
      name: 'pwayment-storage-v5',
      version: 6,
      partialize: (state) => ({
        cart: state.cart,
        cartDiscount: state.cartDiscount,
        cartGiftCards: state.cartGiftCards,
        linkedCustomerId: state.linkedCustomerId,
      }),
      migrate: (persisted: unknown, version: number) => {
        const p = persisted as
          | {
              cart?: RetailCart;
              cartDiscount?: CartDiscount | null;
              cartTip?: number;
              tables?: Array<{ id: number; orders?: OrderItem[]; customerCard?: CustomerCard | null }>;
              activeTableId?: number | null;
              cartGiftCards?: POSState['cartGiftCards'];
              linkedCustomerId?: string | null;
            }
          | undefined;

        if (!p) {
          return {
            cart: initialCart,
            cartDiscount: null,
            cartGiftCards: [],
            mobileView: 'menu',
            mainView: 'pos',
          } as POSState;
        }

        if (version >= 5 && p.cart) {
          return {
            ...p,
            cart: {
              id: p.cart.id ?? RETAIL_CART_ID,
              orders: (p.cart.orders ?? []).map((o) => (o.lineId ? o : { ...o, lineId: lineId() })),
            },
            cartDiscount: p.cartDiscount ?? null,
            cartGiftCards: p.cartGiftCards ?? [],
            linkedCustomerId: p.linkedCustomerId ?? null,
          } as POSState;
        }

        const selectedTable =
          p.tables?.find((t) => t.id === p.activeTableId) ??
          p.tables?.find((t) => (t.orders?.length ?? 0) > 0) ??
          p.tables?.[0];

        return {
          cart: {
            id: RETAIL_CART_ID,
            orders: (selectedTable?.orders ?? []).map((o) => (o.lineId ? o : { ...o, lineId: lineId() })),
          },
          mobileView: 'menu',
          mainView: 'pos',
          cartDiscount: null,
          cartGiftCards: [],
        } as POSState & { _v: number; _ignored: number };
      },
    },
  ),
);
