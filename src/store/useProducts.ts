import { create } from 'zustand';
import { Product } from '../types';
import { db } from '../db/db';
import { products as seedProducts } from '../data/products';
import { audit, useAuth } from '../auth/useAuth';
import { enqueueOutbox } from '../db/outbox';
import { FEATURES } from '../config/features';
import { isSupportedVatRate, UnsupportedVatRateError } from '../utils/vat';
import { findProductByScanCode, ProductScanMatch } from '../utils/productLookup';
import { FEATURE_KEYS, featureLimit } from '../billing/entitlements';

interface ProductsState {
  list: Product[];
  hydrated: boolean;
  hydrate: () => Promise<void>;
  /** Re-read current inventory after a webshop order or another tab changed stock. */
  refresh: () => Promise<void>;
  findByScanCode: (code: string) => ProductScanMatch | null;
  upsert: (p: Product) => Promise<void>;
  bulkUpsert: (products: Product[]) => Promise<void>;
  remove: (id: string) => Promise<void>;
  restore: (id: string) => Promise<void>;
  /** Mirror rows already committed to Dexie (e.g. by the checkout service). */
  syncPersisted: (products: Product[]) => void;
}

const normalizeProduct = (p: Product): Product => {
  const sku = p.sku?.trim();
  const barcode = p.barcode?.trim();
  const brand = p.brand?.trim();
  const supplier = p.supplier?.trim();
  const variant = p.variant?.trim();
  const subCategory = p.subCategory?.trim();
  const costPriceCents =
    p.costPriceCents == null || !Number.isFinite(p.costPriceCents)
      ? undefined
      : Math.max(0, Math.round(p.costPriceCents));
  const stockQty =
    p.stockQty == null ? undefined : Number.isFinite(p.stockQty) ? Math.max(0, Math.floor(p.stockQty)) : undefined;
  const minStockQty =
    p.minStockQty == null
      ? undefined
      : Number.isFinite(p.minStockQty)
        ? Math.max(0, Math.floor(p.minStockQty))
        : undefined;

  return {
    ...p,
    sku: sku ? sku : undefined,
    barcode: barcode ? barcode : undefined,
    brand: brand ? brand : undefined,
    supplier: supplier ? supplier : undefined,
    variant: variant ? variant : undefined,
    subCategory: subCategory ? subCategory : undefined,
    costPriceCents,
    vatRate: p.vatRate,
    stockQty,
    minStockQty,
  };
};

const isObsoleteDemoCatalog = (list: Product[]): boolean => {
  if (list.length < 40) return false;
  const legacyIdCount = list.filter((p) => /^(k|t|sm|w|v|b|ww|rw|ro|bu|z|sup)\d+$/i.test(p.id)).length;
  const hasRetailMetadata = list.some((p) => p.sku || p.barcode || p.stockQty != null || p.costPriceCents != null);
  return legacyIdCount / list.length > 0.7 && !hasRetailMetadata;
};

const isOldRetailBootstrapCatalog = (list: Product[]): boolean => {
  if (list.length === 0 || list.length > 30) return false;
  const ids = new Set(list.map((p) => p.id));
  return ids.has('deck-popsicle-825-maple') && ids.has('hoodie-logo-black') && ids.has('service-board-assembly');
};

/**
 * Products live in IndexedDB so the menu can be edited at runtime.
 *
 * On first load, if the table is empty we seed it from the static catalog
 * shipped in `src/data/products.ts`. After that, the static file is only
 * used as a fallback bootstrap — all reads/writes go through Dexie.
 *
 * Soft-delete: removing a product flips `isActive` to false so historical
 * transactions keep referencing a known product, while the menu hides it.
 */
export const useProducts = create<ProductsState>((set, get) => ({
  list: [],
  hydrated: false,

  findByScanCode: (code) => findProductByScanCode(get().list, code),

  hydrate: async () => {
    if (get().hydrated) return;
    let existing = await db.products.toArray();

    if (
      FEATURES.autoResetLegacyCatalog &&
      (isObsoleteDemoCatalog(existing) || isOldRetailBootstrapCatalog(existing))
    ) {
      await db.products.clear();
      existing = [];
    }

    if (existing.length === 0) {
      if ((FEATURES.seedDemoProducts || FEATURES.seedRetailCatalog) && seedProducts.length > 0) {
        const seeded: Product[] = seedProducts.map((p) => normalizeProduct({ ...p, isActive: true }));
        await db.products.bulkPut(seeded);
        set({ list: seeded, hydrated: true });
      } else {
        set({ list: [], hydrated: true });
      }
      return;
    }

    set({ list: existing.map((p) => normalizeProduct(p)), hydrated: true });
  },

  refresh: async () => {
    const current = await db.products.toArray();
    set({ list: current.map((product) => normalizeProduct(product)), hydrated: true });
  },

  upsert: async (p) => {
    if (!isSupportedVatRate(p.vatRate)) throw new UnsupportedVatRateError(p.vatRate, p.name);
    const existing = await db.products.get(p.id);
    const next: Product = normalizeProduct({ ...p, isActive: p.isActive ?? true });
    const productLimit = featureLimit(FEATURE_KEYS.activeProducts);
    const activatesNewSlot = next.isActive !== false && existing?.isActive !== true;
    if (
      activatesNewSlot &&
      productLimit != null &&
      get().list.filter((product) => product.isActive !== false).length >= productLimit
    ) {
      throw new Error(
        `Pwayment Basis ondersteunt maximaal ${productLimit} actieve producten. Archiveer eerst een product of activeer Retail Professional.`,
      );
    }
    await enqueueOutbox('upsert_product', [next]);
    await db.products.put(next);
    set((s) => {
      const idx = s.list.findIndex((x) => x.id === p.id);
      const out = idx >= 0 ? s.list.map((x) => (x.id === p.id ? next : x)) : [...s.list, next];
      return { list: out };
    });
    void audit(existing ? 'product.update' : 'product.create', {
      productId: p.id,
      name: p.name,
      costPriceCents: next.costPriceCents,
      priceCents: p.priceCents,
      vatRate: next.vatRate,
    });
  },

  bulkUpsert: async (products) => {
    for (const p of products) {
      if (!isSupportedVatRate(p.vatRate)) throw new UnsupportedVatRateError(p.vatRate, p.name);
    }
    const next = products.map((p) => normalizeProduct({ ...p, isActive: p.isActive ?? true }));
    const productLimit = featureLimit(FEATURE_KEYS.activeProducts);
    if (productLimit != null) {
      const existingById = new Map(get().list.map((product) => [product.id, product]));
      const currentlyActive = get().list.filter((product) => product.isActive !== false).length;
      const newActiveSlots = next.filter(
        (product) =>
          product.isActive !== false && existingById.get(product.id)?.isActive !== true,
      ).length;
      if (currentlyActive + newActiveSlots > productLimit) {
        throw new Error(
          `Deze import zou de limiet van ${productLimit} actieve producten in Pwayment Basis overschrijden. Bestaande producten blijven ongewijzigd.`,
        );
      }
    }
    await enqueueOutbox('upsert_product', next);
    await db.transaction('rw', db.products, async () => {
      await db.products.bulkPut(next);
    });
    set((s) => {
      const byId = new Map(next.map((p) => [p.id, p]));
      const merged = s.list.map((p) => byId.get(p.id) ?? p);
      const known = new Set(s.list.map((p) => p.id));
      for (const p of next) if (!known.has(p.id)) merged.push(p);
      return { list: merged };
    });
    void audit('product.update', { bulk: true, count: next.length });
  },

  remove: async (id) => {
    const cur = await db.products.get(id);
    if (!cur) return;
    const next: Product = { ...cur, isActive: false };
    await enqueueOutbox('upsert_product', [next]);
    await db.products.put(next);
    set((s) => ({ list: s.list.map((x) => (x.id === id ? next : x)) }));
    void audit('product.delete', { productId: id, name: cur.name });
  },

  restore: async (id) => {
    const cur = await db.products.get(id);
    if (!cur) return;
    const productLimit = featureLimit(FEATURE_KEYS.activeProducts);
    if (
      productLimit != null &&
      get().list.filter((product) => product.isActive !== false).length >= productLimit
    ) {
      throw new Error(
        `Pwayment Basis ondersteunt maximaal ${productLimit} actieve producten. Uw gearchiveerde product blijft veilig bewaard.`,
      );
    }
    const next: Product = { ...cur, isActive: true };
    await enqueueOutbox('upsert_product', [next]);
    await db.products.put(next);
    set((s) => ({ list: s.list.map((x) => (x.id === id ? next : x)) }));
    void audit('product.restore', { productId: id, name: cur.name });
  },

  syncPersisted: (products) => {
    if (products.length === 0) return;
    set((s) => ({
      list: s.list.map((p) => products.find((u) => u.id === p.id) ?? p),
    }));
  },
}));
