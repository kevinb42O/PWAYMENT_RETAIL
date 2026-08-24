import { create } from 'zustand';
import { ManualCatalogBatchPayload, ManualCatalogFamilyPayload, Product, StockMovement } from '../types';
import { db } from '../db/db';
import { products as seedProducts } from '../data/products';
import { audit, useAuth } from '../auth/useAuth';
import { enqueueOutbox } from '../db/outbox';
import { FEATURES } from '../config/features';
import { isSupportedVatRate, UnsupportedVatRateError } from '../utils/vat';
import { findProductByScanCode, ProductScanMatch } from '../utils/productLookup';
import { FEATURE_KEYS, featureLimit } from '../billing/entitlements';
import { materializeLegacySubcategories } from '../catalog/categoryTaxonomy';

interface ProductsState {
  list: Product[];
  hydrated: boolean;
  hydrate: () => Promise<void>;
  /** Re-read current inventory after a webshop order or another tab changed stock. */
  refresh: () => Promise<void>;
  findByScanCode: (code: string) => ProductScanMatch | null;
  upsert: (p: Product) => Promise<void>;
  bulkUpsert: (products: Product[]) => Promise<void>;
  /** Atomically persist products and their one durable server catalogue command. */
  createCatalogBatch: (products: Product[], family?: ManualCatalogFamilyPayload) => Promise<void>;
  remove: (id: string) => Promise<void>;
  restore: (id: string) => Promise<void>;
  /** Mirror rows already committed to Dexie (e.g. by the checkout service). */
  syncPersisted: (products: Product[]) => void;
}

const normalizeProduct = (p: Product, previous?: Product): Product => {
  const sku = p.sku?.trim();
  const barcode = p.barcode?.trim();
  const brand = p.brand?.trim();
  const supplier = p.supplier?.trim();
  const supplierCode = p.supplierCode?.trim();
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
  const suppliedIdentifiers = (p.identifiers ?? [])
    .map((identifier) => ({
      ...identifier,
      value: identifier.value.trim(),
    }))
    .filter((identifier) => Boolean(identifier.value));
  const barcodeIdentifierType: 'upc' | 'ean' | 'alternate' = /^\d{12}$/.test(barcode?.replace(/\s/g, '') ?? '')
    ? 'upc'
    : /^\d{8}$|^\d{13}$|^\d{14}$/.test(barcode?.replace(/\s/g, '') ?? '')
      ? 'ean'
      : 'alternate';
  const canonicalIdentifiers = [
    ...(sku ? [{ type: 'internal-sku' as const, value: sku, isScannable: true, isPrimary: !barcode }] : []),
    ...(barcode ? [{
      type: barcodeIdentifierType,
      value: barcode,
      isScannable: true,
      isPrimary: true,
    }] : []),
    ...(supplierCode ? [{ type: 'supplier-code' as const, value: supplierCode, isScannable: false, isPrimary: false }] : []),
  ];
  const codeKey = (value: string) => value.replace(/\s/g, '').toLocaleLowerCase('nl-BE');
  const replacedIdentifierValues = new Set(
    [previous?.sku, previous?.barcode, previous?.supplierCode]
      .filter((value): value is string => Boolean(value))
      .map(codeKey),
  );
  const canonicalValues = new Set(canonicalIdentifiers.map((identifier) => codeKey(identifier.value)));
  const retainedIdentifiers = suppliedIdentifiers
    .filter((identifier) => {
      const key = codeKey(identifier.value);
      return !replacedIdentifierValues.has(key) && !canonicalValues.has(key);
    })
    .map((identifier) => ({
      ...identifier,
      isPrimary: canonicalIdentifiers.length > 0 ? false : identifier.isPrimary,
    }));
  const inferredIdentifiers = [...canonicalIdentifiers, ...retainedIdentifiers];

  return {
    ...p,
    sku: sku ? sku : undefined,
    barcode: barcode ? barcode : undefined,
    brand: brand ? brand : undefined,
    supplier: supplier ? supplier : undefined,
    supplierCode: supplierCode ? supplierCode : undefined,
    variant: variant ? variant : undefined,
    subCategory: subCategory ? subCategory : undefined,
    costPriceCents,
    vatRate: p.vatRate,
    stockQty,
    minStockQty,
    identifiers: inferredIdentifiers.length > 0 ? inferredIdentifiers : undefined,
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

const requestId = (): string =>
  globalThis.crypto?.randomUUID?.()
  ?? `catalog-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

const assertUniqueCatalogCodes = (incoming: Product[], existing: Product[]) => {
  const incomingIds = new Set(incoming.map((product) => product.id));
  if (incomingIds.size !== incoming.length) {
    throw new Error('De catalogusopdracht bevat hetzelfde product meer dan één keer.');
  }
  const scanCodeOwner = new Map<string, { id: string; label: string }>();
  for (const product of [...existing, ...incoming]) {
    const codes = [
      product.sku?.trim() ? { value: product.sku, label: 'SKU' } : null,
      product.barcode?.trim() ? { value: product.barcode, label: 'barcode' } : null,
    ].filter((code): code is { value: string; label: string } => Boolean(code));
    for (const code of codes) {
      const normalizedCode = code.value.replace(/\s/g, '').toLocaleLowerCase('nl-BE');
      const owner = scanCodeOwner.get(normalizedCode);
      if (owner) {
        if (owner.id === product.id) {
          throw new Error('SKU en barcode mogen niet dezelfde scancode gebruiken.');
        }
        throw new Error(`${code.label === 'SKU' ? 'SKU' : 'Barcode'} ${code.value} wordt al door een ander product gebruikt.`);
      }
      scanCodeOwner.set(normalizedCode, { id: product.id, label: code.label });
    }
  }
};

/**
 * Products live in IndexedDB so the menu can be edited at runtime.
 *
 * A real tenant starts with an empty table. The static catalog is available
 * only for an explicitly flagged demo store; all real reads/writes go through
 * Dexie.
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
      const isDemoStore = useAuth.getState().currentStoreIsDemo;
      if (isDemoStore && FEATURES.seedDemoProducts && seedProducts.length > 0) {
        const seeded: Product[] = seedProducts.map((p) => normalizeProduct({ ...p, isActive: true }, p));
        const materialized = materializeLegacySubcategories(await db.categories.toArray(), seeded);
        await db.transaction('rw', db.categories, db.products, db.outbox, async () => {
          if (materialized.createdCategories.length > 0) {
            await enqueueOutbox('upsert_category', materialized.createdCategories);
          }
          if (materialized.updatedProducts.length > 0) {
            await enqueueOutbox('upsert_product', materialized.updatedProducts);
          }
          await db.products.bulkPut(materialized.products);
          if (materialized.createdCategories.length > 0) await db.categories.bulkPut(materialized.createdCategories);
        });
        set({ list: materialized.products, hydrated: true });
        void import('./useCategories').then(({ useCategories }) => {
          if (useCategories.getState().hydrated) void useCategories.getState().refresh();
        });
      } else {
        set({ list: [], hydrated: true });
      }
      return;
    }

    const normalized = existing.map((p) => normalizeProduct(p, p));
    const materialized = materializeLegacySubcategories(await db.categories.toArray(), normalized);
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
    set({ list: materialized.products, hydrated: true });
    if (materialized.createdCategories.length > 0) {
      void import('./useCategories').then(({ useCategories }) => {
        if (useCategories.getState().hydrated) void useCategories.getState().refresh();
      });
    }
  },

  refresh: async () => {
    const current = await db.products.toArray();
    set({ list: current.map((product) => normalizeProduct(product, product)), hydrated: true });
  },

  upsert: async (p) => {
    if (!isSupportedVatRate(p.vatRate)) throw new UnsupportedVatRateError(p.vatRate, p.name);
    const existing = await db.products.get(p.id);
    const next: Product = normalizeProduct({ ...p, isActive: p.isActive ?? true }, existing);
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
    const existingById = new Map(get().list.map((product) => [product.id, product]));
    const next = products.map((p) => normalizeProduct(
      { ...p, isActive: p.isActive ?? true },
      existingById.get(p.id),
    ));
    const productLimit = featureLimit(FEATURE_KEYS.activeProducts);
    if (productLimit != null) {
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

  createCatalogBatch: async (products, family) => {
    if (products.length === 0) throw new Error('Voeg minstens één product toe.');
    if (products.length > 200) throw new Error('Bewaar maximaal 100 actieve en 100 gearchiveerde varianten per productfamilie.');
    for (const product of products) {
      if (!isSupportedVatRate(product.vatRate)) {
        throw new UnsupportedVatRateError(product.vatRate, product.name);
      }
    }
    const existingById = new Map(get().list.map((product) => [product.id, product]));
    const next = products.map((product) => normalizeProduct({
      ...product,
      isActive: product.isActive ?? true,
    }, existingById.get(product.id)));
    assertUniqueCatalogCodes(next, get().list.filter(
      (product) => !next.some((candidate) => candidate.id === product.id),
    ));

    if (family) {
      const variantIds = new Set(family.variants.map((variant) => variant.productExternalId));
      if (variantIds.size !== family.variants.length) {
        throw new Error('Dezelfde variant staat meer dan één keer in de productfamilie.');
      }
      const productIds = new Set(next.map((product) => product.id));
      if (family.variants.some((variant) => !productIds.has(variant.productExternalId))) {
        throw new Error('Een variant verwijst naar een product dat niet in deze catalogusopdracht zit.');
      }
    }

    const productLimit = featureLimit(FEATURE_KEYS.activeProducts);
    if (productLimit != null) {
      const activeOutsideBatch = get().list.filter(
        (product) => product.isActive !== false && !next.some((candidate) => candidate.id === product.id),
      ).length;
      const activeInsideBatch = next.filter((product) => product.isActive !== false).length;
      if (activeOutsideBatch + activeInsideBatch > productLimit) {
        const newlyActivated = next.filter((product) =>
          product.isActive !== false && existingById.get(product.id)?.isActive !== true,
        ).length;
        throw new Error(
          `Deze actie activeert ${newlyActivated} product${newlyActivated === 1 ? '' : 'en'} en overschrijdt de limiet van ${productLimit}.`,
        );
      }
    }

    const catalogRequestId = requestId();
    const now = Date.now();
    const auth = useAuth.getState();
    await db.transaction(
      'rw',
      [db.products, db.stock_movements, db.audit, db.outbox],
      async () => {
        const existingRows = new Map(
          (await db.products.bulkGet(next.map((product) => product.id)))
            .filter((product): product is Product => Boolean(product))
            .map((product) => [product.id, product]),
        );
        const payload: ManualCatalogBatchPayload = {
          requestId: catalogRequestId,
          products: next,
          family,
          existingProductExternalIds: [...existingRows.keys()],
        };
        await db.outbox.add({
          timestamp: now,
          kind: 'upsert_catalog_batch',
          payload,
          attempts: 0,
          deliveryStatus: 'pending',
          nextAttemptAt: now,
        });
        await db.products.bulkPut(next);

        const openingMovements: StockMovement[] = next
          .filter((product) => !existingRows.has(product.id) && product.stockQty != null && product.stockQty > 0)
          .map((product) => ({
            productId: product.id,
            productName: product.name,
            quantityDelta: product.stockQty!,
            reason: 'manual-adjustment' as const,
            timestamp: now,
            userId: auth.currentUserId ?? undefined,
            userName: auth.currentUserName ?? undefined,
            quantityBefore: 0,
            quantityAfter: product.stockQty!,
            adjustmentReason: 'opening-balance' as const,
            note: 'Openingsvoorraad bij catalogusaanmaak',
            clientRequestId: `${catalogRequestId}:${product.id}:opening`,
          }));
        if (openingMovements.length > 0) {
          await db.stock_movements.bulkAdd(openingMovements);
        }
        await db.audit.add({
          timestamp: now,
          userId: auth.currentUserId,
          userName: auth.currentUserName,
          action: existingRows.size > 0 ? 'product.update' : 'product.create',
          detail: {
            requestId: catalogRequestId,
            productIds: next.map((product) => product.id),
            familyId: family?.familyId,
            openingBalanceCount: openingMovements.length,
          },
        });
      },
    );

    set((state) => {
      const byId = new Map(next.map((product) => [product.id, product]));
      const merged = state.list.map((product) => byId.get(product.id) ?? product);
      const known = new Set(state.list.map((product) => product.id));
      for (const product of next) if (!known.has(product.id)) merged.push(product);
      return { list: merged };
    });
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
