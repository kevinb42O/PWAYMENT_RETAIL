import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  CustomerCard,
  Modifier,
  OrderItem,
  Product,
  SaleDocumentRequest,
  VoidEntry,
} from '../types';
import { audit, useAuth } from '../auth/useAuth';
import { db } from '../db/db';
import { useProducts } from './useProducts';
import { recordSupabaseVoid } from '../services/supabaseAudit';

export interface CartDiscount {
  amountCents: number;
  reason: string;
  approvedByUserId: string;
  /** Server-issued, single-use manager approval for a cashier discount. */
  approvalId?: string;
  /**
   * A manager proof is deliberately never stored in a held basket. The cashier
   * must ask for a fresh approval before this restored discount can be used.
   */
  requiresReapproval?: boolean;
}

export interface RetailCart {
  id: number;
  orders: OrderItem[];
}

export interface SuspendedCartHeldBy {
  userId: string | null;
  userName: string | null;
}

/**
 * A complete, non-financial snapshot of a customer who is temporarily put on
 * hold. It is deliberately local POS state: no stock, payment or transaction
 * is touched until checkout completes.
 */
export interface SuspendedRetailCart {
  id: string;
  storeId: string | null;
  suspendedAt: number;
  heldBy?: SuspendedCartHeldBy;
  label?: string;
  cart: RetailCart;
  cartDiscount: CartDiscount | null;
  cartGiftCards: { id: string; amountCents: number; code: string }[];
  linkedCustomerId: string | null;
  documentRequest: SaleDocumentRequest;
  /** Preserves the idempotency key after a failed checkout is parked. */
  checkoutRequestId: string | null;
}

export interface SuspendCurrentCartOptions {
  /** Null is valid for local/demo POS sessions without a selected store. */
  storeId: string | null;
  heldBy?: SuspendedCartHeldBy;
  label?: string;
}

export interface ResumeSuspendedCartOptions {
  /** Guard against accidentally restoring a basket belonging to another store. */
  storeId?: string | null;
  /** Put the populated active basket on hold before restoring the selected one. */
  suspendCurrent?: boolean;
  /** Label for the active basket when it is automatically put on hold. */
  suspendLabel?: string;
  heldBy?: SuspendedCartHeldBy;
}

export type MainView =
  | 'pos'
  | 'service'
  | 'workforce'
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
  /** Intended fiscal document for the active basket. */
  cartDocumentRequest: SaleDocumentRequest;
  /** Reused after a failed checkout to make retries idempotent. */
  cartCheckoutRequestId: string | null;
  /** Customer baskets temporarily held at this device. */
  suspendedCarts: SuspendedRetailCart[];

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
  setCartDocumentRequest: (request: SaleDocumentRequest) => void;
  setCartCheckoutRequestId: (requestId: string | null) => void;
  resetCartExtras: () => void;

  /** Returns the created snapshot, or null when there is no cart to hold. */
  suspendCurrentCart: (options: SuspendCurrentCartOptions) => SuspendedRetailCart | null;
  /** Returns false without altering state when the target/store/current cart is unsafe. */
  resumeSuspendedCart: (id: string, options?: ResumeSuspendedCartOptions) => boolean;
  /** Returns false when the snapshot does not belong to the requested store. */
  discardSuspendedCart: (id: string, options?: Pick<ResumeSuspendedCartOptions, 'storeId'>) => boolean;

  cartGiftCards: { id: string; amountCents: number; code: string }[];
  addCartGiftCard: (gc: { id: string; amountCents: number; code: string }) => void;
  removeCartGiftCard: (id: string) => void;

  linkedCustomerId: string | null;
  linkCustomer: (customerId: string) => void;
  unlinkCustomer: () => void;
}

const RETAIL_CART_ID = 1;

const initialCart = (): RetailCart => ({ id: RETAIL_CART_ID, orders: [] });

const receiptDocumentRequest = (): SaleDocumentRequest => ({ type: 'receipt' });

const lineId = () => globalThis.crypto.randomUUID();

const suspendedCartId = () =>
  globalThis.crypto?.randomUUID?.() ?? `suspended-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const sameLineCandidate = (a: OrderItem, b: OrderItem) =>
  a.product.id === b.product.id &&
  (a.notes ?? '') === (b.notes ?? '') &&
  JSON.stringify(a.modifiers ?? []) === JSON.stringify(b.modifiers ?? []);

const cloneOrderItem = (order: OrderItem): OrderItem => ({
  ...order,
  product: {
    ...order.product,
    ...(order.product.priceTiers ? { priceTiers: { ...order.product.priceTiers } } : {}),
    ...(order.product.customFields ? { customFields: { ...order.product.customFields } } : {}),
  },
  ...(order.modifiers ? { modifiers: order.modifiers.map((modifier) => ({ ...modifier })) } : {}),
});

const cloneRetailCart = (cart: RetailCart | Partial<RetailCart> | null | undefined): RetailCart => ({
  id: typeof cart?.id === 'number' ? cart.id : RETAIL_CART_ID,
  orders: Array.isArray(cart?.orders) ? cart.orders.map(cloneOrderItem) : [],
});

const cloneDiscount = (
  discount: CartDiscount | null | undefined,
  invalidateApproval = false,
): CartDiscount | null => {
  if (!discount) return null;
  const snapshot = { ...discount };
  const hadApproval = Boolean(snapshot.approvalId);
  if (invalidateApproval) {
    delete snapshot.approvalId;
    if (hadApproval) snapshot.requiresReapproval = true;
  }
  return snapshot;
};

const cloneGiftCards = (giftCards: POSState['cartGiftCards'] | undefined) =>
  (giftCards ?? []).map((giftCard) => ({ ...giftCard }));

const cloneDocumentRequest = (
  request: SaleDocumentRequest | null | undefined,
): SaleDocumentRequest => {
  if (
    request?.type !== 'invoice-b2c' &&
    request?.type !== 'invoice-b2b' &&
    request?.type !== 'receipt'
  ) {
    return receiptDocumentRequest();
  }
  return request.recipient
    ? { type: request.type, recipient: { ...request.recipient } }
    : { type: request.type };
};

const resolvedHeldBy = (heldBy?: SuspendedCartHeldBy): SuspendedCartHeldBy | undefined => {
  if (heldBy) {
    return {
      userId: heldBy.userId ?? null,
      userName: heldBy.userName ?? null,
    };
  }
  const auth = useAuth.getState();
  return auth.currentUserId || auth.currentUserName
    ? { userId: auth.currentUserId ?? null, userName: auth.currentUserName ?? null }
    : undefined;
};

const normalizeLabel = (label?: string) => {
  const normalized = label?.trim();
  return normalized ? normalized.slice(0, 120) : undefined;
};

const resolveStoreId = (storeId: string | null | undefined) =>
  storeId === undefined ? useAuth.getState().currentStoreId ?? null : storeId;

const createSuspendedSnapshot = (
  state: Pick<
    POSState,
    | 'cart'
    | 'cartDiscount'
    | 'cartGiftCards'
    | 'linkedCustomerId'
    | 'cartDocumentRequest'
    | 'cartCheckoutRequestId'
  >,
  options: { storeId: string | null; heldBy?: SuspendedCartHeldBy; label?: string },
): SuspendedRetailCart => {
  const heldBy = resolvedHeldBy(options.heldBy);
  const label = normalizeLabel(options.label);
  return {
    id: suspendedCartId(),
    storeId: options.storeId,
    suspendedAt: Date.now(),
    ...(heldBy ? { heldBy } : {}),
    ...(label ? { label } : {}),
    cart: cloneRetailCart(state.cart),
    // Manager approvals are time-limited/single-use credentials, never a held-cart credential.
    cartDiscount: cloneDiscount(state.cartDiscount, true),
    cartGiftCards: cloneGiftCards(state.cartGiftCards),
    linkedCustomerId: state.linkedCustomerId,
    documentRequest: cloneDocumentRequest(state.cartDocumentRequest),
    checkoutRequestId: state.cartCheckoutRequestId,
  };
};

const emptyActiveCartState = () => ({
  cart: initialCart(),
  cartDiscount: null,
  cartGiftCards: [] as POSState['cartGiftCards'],
  linkedCustomerId: null,
  cartDocumentRequest: receiptDocumentRequest(),
  cartCheckoutRequestId: null,
});

const normalizeSuspendedCart = (candidate: unknown): SuspendedRetailCart | null => {
  if (!candidate || typeof candidate !== 'object') return null;
  const raw = candidate as Partial<SuspendedRetailCart>;
  if (typeof raw.id !== 'string' || !raw.id.trim()) return null;
  const rawHeldBy = raw.heldBy;
  const heldBy = rawHeldBy && typeof rawHeldBy === 'object'
    ? {
        userId: typeof rawHeldBy.userId === 'string' ? rawHeldBy.userId : null,
        userName: typeof rawHeldBy.userName === 'string' ? rawHeldBy.userName : null,
      }
    : undefined;
  const label = normalizeLabel(raw.label);
  return {
    id: raw.id,
    storeId: typeof raw.storeId === 'string' ? raw.storeId : null,
    suspendedAt: typeof raw.suspendedAt === 'number' ? raw.suspendedAt : Date.now(),
    ...(heldBy ? { heldBy } : {}),
    ...(label ? { label } : {}),
    cart: cloneRetailCart(raw.cart),
    // Never trust an approval token from persisted held-cart data either.
    cartDiscount: cloneDiscount(raw.cartDiscount, true),
    cartGiftCards: cloneGiftCards(raw.cartGiftCards),
    linkedCustomerId: typeof raw.linkedCustomerId === 'string' ? raw.linkedCustomerId : null,
    documentRequest: cloneDocumentRequest(raw.documentRequest),
    checkoutRequestId: typeof raw.checkoutRequestId === 'string' ? raw.checkoutRequestId : null,
  };
};

export const useStore = create<POSState>()(
  persist(
    (set, get) => ({
      cart: initialCart(),
      mobileView: 'menu',
      mainView: 'pos',
      cartDiscount: null,
      cartDocumentRequest: receiptDocumentRequest(),
      cartCheckoutRequestId: null,
      suspendedCarts: [],
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
        set(emptyActiveCartState());
      },

      setCartDiscount: (discount) => {
        if (discount) {
          void audit('discount.apply', {
            cartId: RETAIL_CART_ID,
            amountCents: discount.amountCents,
            reason: discount.reason,
          });
        }
        set({ cartDiscount: cloneDiscount(discount) });
      },

      setCartDocumentRequest: (request) => set({ cartDocumentRequest: cloneDocumentRequest(request) }),
      setCartCheckoutRequestId: (requestId) => set({ cartCheckoutRequestId: requestId }),

      resetCartExtras: () =>
        set({
          cartDiscount: null,
          cartGiftCards: [],
          linkedCustomerId: null,
          cartDocumentRequest: receiptDocumentRequest(),
          cartCheckoutRequestId: null,
        }),

      suspendCurrentCart: (options) => {
        const state = get();
        if (state.cart.orders.length === 0) return null;

        const snapshot = createSuspendedSnapshot(state, {
          storeId: resolveStoreId(options.storeId),
          heldBy: options.heldBy,
          label: options.label,
        });
        set((current) => ({
          suspendedCarts: [...current.suspendedCarts, snapshot],
          ...emptyActiveCartState(),
        }));
        void audit('cart.suspend', {
          suspendedCartId: snapshot.id,
          storeId: snapshot.storeId,
          orderCount: snapshot.cart.orders.length,
        });
        return snapshot;
      },

      resumeSuspendedCart: (id, options) => {
        const state = get();
        const storeId = resolveStoreId(options?.storeId);
        const target = state.suspendedCarts.find(
          (snapshot) => snapshot.id === id && snapshot.storeId === storeId,
        );
        if (!target || (state.cart.orders.length > 0 && !options?.suspendCurrent)) return false;

        const replacement = options?.suspendCurrent && state.cart.orders.length > 0
          ? createSuspendedSnapshot(state, {
              storeId,
              heldBy: options.heldBy,
              label: options.suspendLabel,
            })
          : null;
        set((current) => ({
          suspendedCarts: [
            ...current.suspendedCarts.filter((snapshot) => snapshot.id !== target.id),
            ...(replacement ? [replacement] : []),
          ],
          cart: cloneRetailCart(target.cart),
          cartDiscount: cloneDiscount(target.cartDiscount, true),
          cartGiftCards: cloneGiftCards(target.cartGiftCards),
          linkedCustomerId: target.linkedCustomerId,
          cartDocumentRequest: cloneDocumentRequest(target.documentRequest),
          cartCheckoutRequestId: target.checkoutRequestId,
        }));
        void audit('cart.resume', {
          suspendedCartId: target.id,
          storeId: target.storeId,
          orderCount: target.cart.orders.length,
          replacementSuspendedCartId: replacement?.id,
        });
        return true;
      },

      discardSuspendedCart: (id, options) => {
        const state = get();
        const storeId = resolveStoreId(options?.storeId);
        const target = state.suspendedCarts.find(
          (snapshot) => snapshot.id === id && snapshot.storeId === storeId,
        );
        if (!target) return false;
        set((current) => ({
          suspendedCarts: current.suspendedCarts.filter((snapshot) => snapshot.id !== target.id),
        }));
        void audit('cart.discard', {
          suspendedCartId: target.id,
          storeId: target.storeId,
          orderCount: target.cart.orders.length,
        });
        return true;
      },

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
      version: 7,
      partialize: (state) => ({
        cart: state.cart,
        cartDiscount: state.cartDiscount,
        cartDocumentRequest: state.cartDocumentRequest,
        cartCheckoutRequestId: state.cartCheckoutRequestId,
        suspendedCarts: state.suspendedCarts,
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
              cartDocumentRequest?: SaleDocumentRequest;
              cartCheckoutRequestId?: string | null;
              suspendedCarts?: unknown[];
            }
          | undefined;

        if (!p) {
          return {
            cart: initialCart(),
            cartDiscount: null,
            cartDocumentRequest: receiptDocumentRequest(),
            cartCheckoutRequestId: null,
            suspendedCarts: [],
            cartGiftCards: [],
            mobileView: 'menu',
            mainView: 'pos',
          } as POSState;
        }

        if (version >= 5 && p.cart) {
          return {
            ...p,
            cart: cloneRetailCart({
              id: p.cart.id ?? RETAIL_CART_ID,
              orders: (p.cart.orders ?? []).map((o) => (o.lineId ? o : { ...o, lineId: lineId() })),
            }),
            cartDiscount: cloneDiscount(p.cartDiscount),
            cartDocumentRequest: cloneDocumentRequest(p.cartDocumentRequest),
            cartCheckoutRequestId: typeof p.cartCheckoutRequestId === 'string' ? p.cartCheckoutRequestId : null,
            suspendedCarts: (p.suspendedCarts ?? [])
              .map(normalizeSuspendedCart)
              .filter((snapshot): snapshot is SuspendedRetailCart => snapshot != null),
            cartGiftCards: cloneGiftCards(p.cartGiftCards),
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
          cartDocumentRequest: receiptDocumentRequest(),
          cartCheckoutRequestId: null,
          suspendedCarts: [],
          cartGiftCards: [],
        } as POSState & { _v: number; _ignored: number };
      },
    },
  ),
);
