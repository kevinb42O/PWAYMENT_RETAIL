import { create } from 'zustand';
import { db } from '../db/db';
import { ProductCategory } from '../types';
import { FEATURES } from '../config/features';
import { BELGIAN_RETAIL_VAT_RATE, productCategories } from '../data/categories';
import { useAuth } from '../auth/useAuth';
import { enqueueOutbox } from '../db/outbox';
import { FEATURE_KEYS, featureLimit } from '../billing/entitlements';

interface CategoriesState {
  list: ProductCategory[];
  hydrated: boolean;
  hydrate: () => Promise<void>;
  addCategory: (name: string) => Promise<ProductCategory | null>;
  renameCategory: (id: string, name: string) => Promise<void>;
  removeCategory: (id: string) => Promise<boolean>;
}

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32);

const sortByName = (list: ProductCategory[]) =>
  [...list].sort((a, b) => (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999) || a.name.localeCompare(b.name));

const isOldRetailCategorySeed = (list: ProductCategory[]): boolean => {
  if (list.length === 0 || list.length > 12) return false;
  const ids = new Set(list.map((category) => category.id));
  return ids.has('decks') && ids.has('apparel') && ids.has('services');
};

/**
 * The former browser bootstrap inserted this exact static skate-shop list for
 * every empty tenant. The canonical ordering is not produced by the category
 * form, so it lets us safely repair those untouched, client-only records.
 */
const isStaticRetailCategorySeed = (list: ProductCategory[]): boolean =>
  list.length === productCategories.length &&
  productCategories.every((seed) =>
    list.some(
      (category) =>
        category.id === seed.id &&
        category.name === seed.name &&
        category.vatRate === seed.vatRate &&
        category.sortOrder === seed.sortOrder &&
        category.isActive === seed.isActive,
    ),
  );

export const useCategories = create<CategoriesState>((set, get) => ({
  list: [],
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return;
    let fromDb = await db.categories.toArray();

    if (
      FEATURES.autoResetLegacyCatalog &&
      ((fromDb.length >= 8 && fromDb.every((c) => c.vatRate == null)) || isOldRetailCategorySeed(fromDb))
    ) {
      await db.categories.clear();
      fromDb = [];
    }

    const isDemoStore = useAuth.getState().currentStoreIsDemo;
    const hasNoProducts = (await db.products.count()) === 0;
    if (!isDemoStore && hasNoProducts && isStaticRetailCategorySeed(fromDb)) {
      await db.categories.clear();
      fromDb = [];
    }

    // Demo data is opt-in and restricted to an explicitly flagged demo
    // store. A newly registered tenant always starts with zero categories.
    if (fromDb.length === 0 && isDemoStore && FEATURES.seedDemoProducts) {
      await db.categories.bulkPut(productCategories);
      fromDb = productCategories;
    }

    set({ list: sortByName(fromDb), hydrated: true });
  },

  addCategory: async (rawName) => {
    const name = rawName.trim();
    if (!name) return null;

    const state = get();
    if (state.list.some((c) => c.name.toLowerCase() === name.toLowerCase())) return null;
    const categoryLimit = featureLimit(FEATURE_KEYS.categories);
    if (
      categoryLimit != null &&
      state.list.filter((category) => category.isActive !== false).length >= categoryLimit
    ) {
      throw new Error(
        `Pwayment Basis ondersteunt maximaal ${categoryLimit} hoofdcategorieën. Uw bestaande categorieën blijven bewaard.`,
      );
    }

    const base = slugify(name) || 'category';
    let id = base;
    let i = 2;
    while (state.list.some((c) => c.id === id)) id = `${base}-${i++}`;

    const category: ProductCategory = { id, name, vatRate: BELGIAN_RETAIL_VAT_RATE, isActive: true };
    await enqueueOutbox('upsert_category', [category]);
    await db.categories.put(category);
    set((s) => ({ list: sortByName([...s.list, category]) }));
    return category;
  },

  renameCategory: async (id, rawName) => {
    const name = rawName.trim();
    if (!name) return;
    const cur = await db.categories.get(id);
    if (!cur) return;
    const next = { ...cur, name };
    await enqueueOutbox('upsert_category', [next]);
    await db.categories.put(next);
    set((s) => ({
      list: sortByName(s.list.map((c) => (c.id === id ? next : c))),
    }));
  },

  removeCategory: async (id) => {
    const productsInCategory = await db.products.where('category').equals(id).count();
    if (productsInCategory > 0) return false;
    await enqueueOutbox('delete_category', { categoryId: id });
    await db.categories.delete(id);
    set((s) => ({ list: s.list.filter((c) => c.id !== id) }));
    return true;
  },
}));
