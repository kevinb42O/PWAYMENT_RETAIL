import { create } from 'zustand';
import { db } from '../db/db';
import { ProductCategory } from '../types';
import { FEATURES } from '../config/features';
import { BELGIAN_RETAIL_VAT_RATE, productCategories } from '../data/categories';
import { useAuth } from '../auth/useAuth';
import { enqueueOutbox } from '../db/outbox';
import { FEATURE_KEYS, featureLimit } from '../billing/entitlements';
import { isSupportedVatRate } from '../utils/vat';
import { useProducts } from './useProducts';
import { materializeLegacySubcategories } from '../catalog/categoryTaxonomy';

interface CategoriesState {
  list: ProductCategory[];
  hydrated: boolean;
  hydrate: () => Promise<void>;
  /** Re-read categories committed by a migration or another application tab. */
  refresh: () => Promise<void>;
  addCategory: (name: string, vatRate?: number) => Promise<ProductCategory | null>;
  addSubcategory: (parentId: string, name: string) => Promise<ProductCategory | null>;
  renameCategory: (id: string, name: string) => Promise<void>;
  setCategoryIcon: (id: string, icon: string) => Promise<void>;
  setCategoryVatRate: (id: string, vatRate: number) => Promise<void>;
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
  [...list].sort((a, b) => {
    const aRoot = a.parentId ? list.find((category) => category.id === a.parentId)?.name ?? '' : a.name;
    const bRoot = b.parentId ? list.find((category) => category.id === b.parentId)?.name ?? '' : b.name;
    return aRoot.localeCompare(bRoot)
      || Number(Boolean(a.parentId)) - Number(Boolean(b.parentId))
      || (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999)
      || a.name.localeCompare(b.name);
  });

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

    const materialized = materializeLegacySubcategories(fromDb, await db.products.toArray());
    await db.transaction('rw', db.categories, db.products, db.outbox, async () => {
      if (materialized.createdCategories.length > 0) {
        await enqueueOutbox('upsert_category', materialized.createdCategories);
      }
      if (materialized.updatedProducts.length > 0) {
        await enqueueOutbox('upsert_product', materialized.updatedProducts);
      }
      if (materialized.createdCategories.length > 0) await db.categories.bulkPut(materialized.createdCategories);
      if (materialized.updatedProducts.length > 0) await db.products.bulkPut(materialized.updatedProducts);
    });
    if (materialized.updatedProducts.length > 0) useProducts.getState().syncPersisted(materialized.updatedProducts);

    // Product hydration can materialize subcategories in the same IndexedDB
    // while this hydrate is still running. Publishing `materialized.categories`
    // here would restore the older snapshot captured above and leave products
    // pointing at leaf IDs that the UI cannot resolve until a full reload.
    // IndexedDB is the committed source of truth, so always publish a final
    // read after our transaction has completed.
    const committedCategories = await db.categories.toArray();
    set({ list: sortByName(committedCategories), hydrated: true });
  },

  refresh: async () => {
    const materialized = materializeLegacySubcategories(
      await db.categories.toArray(),
      await db.products.toArray(),
    );
    await db.transaction('rw', db.categories, db.products, db.outbox, async () => {
      if (materialized.createdCategories.length > 0) {
        await enqueueOutbox('upsert_category', materialized.createdCategories);
      }
      if (materialized.updatedProducts.length > 0) {
        await enqueueOutbox('upsert_product', materialized.updatedProducts);
      }
      if (materialized.createdCategories.length > 0) await db.categories.bulkPut(materialized.createdCategories);
      if (materialized.updatedProducts.length > 0) await db.products.bulkPut(materialized.updatedProducts);
    });
    if (materialized.updatedProducts.length > 0) useProducts.getState().syncPersisted(materialized.updatedProducts);
    const committedCategories = await db.categories.toArray();
    set({ list: sortByName(committedCategories), hydrated: true });
  },

  addCategory: async (rawName, requestedVatRate = BELGIAN_RETAIL_VAT_RATE) => {
    const name = rawName.trim();
    if (!name) return null;

    const state = get();
    if (state.list.some((c) => c.name.toLowerCase() === name.toLowerCase())) return null;
    const categoryLimit = featureLimit(FEATURE_KEYS.categories);
    if (
      categoryLimit != null &&
      state.list.filter((category) => !category.parentId && category.isActive !== false).length >= categoryLimit
    ) {
      throw new Error(
        `Pwayment Basis ondersteunt maximaal ${categoryLimit} hoofdcategorieën. Uw bestaande categorieën blijven bewaard.`,
      );
    }

    const base = slugify(name) || 'category';
    let id = base;
    let i = 2;
    while (state.list.some((c) => c.id === id)) id = `${base}-${i++}`;

    if (!isSupportedVatRate(requestedVatRate)) return null;
    const category: ProductCategory = { id, name, vatRate: requestedVatRate, isActive: true };
    await db.transaction('rw', db.categories, db.outbox, async () => {
      await enqueueOutbox('upsert_category', [category]);
      await db.categories.put(category);
    });
    set((s) => ({ list: sortByName([...s.list, category]) }));
    return category;
  },

  addSubcategory: async (parentId, rawName) => {
    const name = rawName.trim();
    const state = get();
    const parent = state.list.find((category) => category.id === parentId && !category.parentId);
    if (!name || !parent) return null;
    if (state.list.some((category) =>
      category.parentId === parentId && category.name.toLocaleLowerCase('nl-BE') === name.toLocaleLowerCase('nl-BE')
    )) return null;

    const base = `${parent.id}-${slugify(name) || 'subcategory'}`.slice(0, 64);
    let id = base;
    let suffix = 2;
    while (state.list.some((category) => category.id === id)) id = `${base}-${suffix++}`;

    const category: ProductCategory = {
      id,
      parentId,
      name,
      vatRate: parent.vatRate,
      isActive: true,
    };
    await db.transaction('rw', db.categories, db.outbox, async () => {
      await enqueueOutbox('upsert_category', [category]);
      await db.categories.put(category);
    });
    set((current) => ({ list: sortByName([...current.list, category]) }));
    return category;
  },

  renameCategory: async (id, rawName) => {
    const name = rawName.trim();
    if (!name) return;
    const cur = await db.categories.get(id);
    if (!cur) return;
    const duplicate = get().list.some((category) =>
      category.id !== id
      && category.parentId === cur.parentId
      && category.name.toLocaleLowerCase('nl-BE') === name.toLocaleLowerCase('nl-BE')
    );
    if (duplicate) throw new Error('Binnen dezelfde hoofdcategorie bestaat deze naam al.');
    const next = { ...cur, name };
    const affectedProducts = cur.parentId
      ? await db.products.filter((product) =>
          product.category === cur.id
          || (product.category === cur.parentId && product.subCategory === cur.name)
        ).toArray()
      : [];
    const renamedProducts = affectedProducts.map((product) => ({
      ...product,
      category: cur.parentId ? cur.id : product.category,
      subCategory: name,
    }));
    await db.transaction('rw', db.categories, db.products, db.outbox, async () => {
      await enqueueOutbox('upsert_category', [next]);
      for (const product of renamedProducts) await enqueueOutbox('upsert_product', [product]);
      await db.categories.put(next);
      if (renamedProducts.length > 0) await db.products.bulkPut(renamedProducts);
    });
    if (renamedProducts.length > 0) useProducts.getState().syncPersisted(renamedProducts);
    set((s) => ({
      list: sortByName(s.list.map((c) => (c.id === id ? next : c))),
    }));
  },

  setCategoryIcon: async (id, icon) => {
    const current = await db.categories.get(id);
    if (!current || current.icon === icon) return;
    const next = { ...current, icon };
    await db.transaction('rw', db.categories, db.outbox, async () => {
      await enqueueOutbox('upsert_category', [next]);
      await db.categories.put(next);
    });
    set((state) => ({
      list: state.list.map((category) => category.id === id ? next : category),
    }));
  },

  setCategoryVatRate: async (id, vatRate) => {
    if (!isSupportedVatRate(vatRate)) return;
    const current = await db.categories.get(id);
    if (!current || current.vatRate === vatRate) return;
    const children = current.parentId ? [] : get().list.filter((category) => category.parentId === id);
    const next = { ...current, vatRate: current.parentId
      ? get().list.find((category) => category.id === current.parentId)?.vatRate ?? vatRate
      : vatRate };
    const updatedChildren = children.map((category) => ({ ...category, vatRate }));
    await db.transaction('rw', db.categories, db.outbox, async () => {
      await enqueueOutbox('upsert_category', [next, ...updatedChildren]);
      await db.categories.bulkPut([next, ...updatedChildren]);
    });
    set((state) => ({
      list: sortByName(state.list.map((category) => {
        if (category.id === id) return next;
        return category.parentId === id ? { ...category, vatRate } : category;
      })),
    }));
  },

  removeCategory: async (id) => {
    const category = await db.categories.get(id);
    if (!category) return false;
    const hasChildren = !category.parentId && (await db.categories.where('parentId').equals(id).count()) > 0;
    if (hasChildren) return false;
    const productsInCategory = await db.products.where('category').equals(id).count();
    if (productsInCategory > 0) return false;
    await db.transaction('rw', db.categories, db.outbox, async () => {
      await enqueueOutbox('delete_category', { categoryId: id });
      await db.categories.delete(id);
    });
    set((s) => ({ list: s.list.filter((c) => c.id !== id) }));
    return true;
  },
}));
