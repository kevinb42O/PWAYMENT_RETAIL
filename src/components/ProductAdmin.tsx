import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, Barcode, Boxes, Building2, Check, CheckCircle2, ChevronDown, ChevronRight, CornerDownRight, Download, Package, PackageSearch, Palette, Pencil, Plus, RotateCcw, Search, Tag, Trash2, TrendingUp, Upload, X } from 'lucide-react';
import { useProducts } from '../store/useProducts';
import { useStore } from '../store/useStore';
import { InventoryAdjustmentReason, ManualCatalogFamilyPayload, Product } from '../types';
import { centsToDecimalString, formatEUR, parseDecimalToCents } from '../utils/money';
import { parseProductsCsv, serializeProductsCsv, slugifyId } from '../utils/productCsv';
import { isSupportedVatRate, SUPPORTED_VAT_RATES } from '../utils/vat';
import { FEATURES } from '../config/features';
import { usePlatformFeatureFlag } from '../billing/usePlatformFeatureFlag';
import { Modal } from './Modal';
import { useCategories } from '../store/useCategories';
import { BELGIAN_RETAIL_VAT_RATE } from '../data/categories';
import { generateInternalEAN13 } from '../utils/barcode';
import {
  InventoryAdjustmentError,
  recordInventoryCount,
} from '../services/inventoryAdjustments';
import { useStoreConfiguration } from '../store/useStoreConfiguration';
import { configuredVatFallback } from '../onboarding/storeConfiguration';
import { CatalogBuilder } from './CatalogBuilder';
import { useAuth } from '../auth/useAuth';
import { resolveProductCategoryPath } from '../catalog/categoryTaxonomy';
import { CATEGORY_ICON_GROUPS, CATEGORY_ICON_OPTIONS, categoryIcon, categoryIconLabel } from '../catalog/categoryIcons';

const COLOR_PRESETS: { label: string; cls: string }[] = [
  { label: 'Deck blauw', cls: 'bg-sky-700' },
  { label: 'Hardware zinc', cls: 'bg-zinc-700' },
  { label: 'Wielen groen', cls: 'bg-emerald-700' },
  { label: 'Kleding slate', cls: 'bg-slate-800' },
  { label: 'Schoenen neutral', cls: 'bg-neutral-800' },
  { label: 'Protectie rood', cls: 'bg-red-800' },
  { label: 'Accessoire violet', cls: 'bg-violet-800' },
  { label: 'Tool oranje', cls: 'bg-orange-700' },
  { label: 'Service teal', cls: 'bg-teal-700' },
  { label: 'Licht', cls: 'bg-zinc-200 text-black' },
];

const handledGuidedProductRequests = new Set<number>();

const parseCents = (txt: string): number => {
  const parsed = parseDecimalToCents(txt);
  return parsed.ok ? parsed.cents : 0;
};

const centsToInput = (cents?: number): string => centsToDecimalString(cents ?? 0).replace('.', ',');

const parseWhole = (txt: string): number | undefined => {
  const trimmed = txt.trim();
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  if (!Number.isSafeInteger(n) || n < 0) return undefined;
  return n;
};

const marginPercent = (priceCents: number, costPriceCents?: number): number => {
  if (priceCents <= 0 || costPriceCents == null) return 0;
  return ((priceCents - costPriceCents) / priceCents) * 100;
};

interface ProductAdminProps {
  initialTab?: 'products' | 'categories';
  /** Used by the empty-store guide to enter the existing product editor directly. */
  openNewProductRequestKey?: number;
  /** Explicit Pace selection; never mutates cart or product records. */
  catalogFilter?: { requestKey: number; productIds: string[]; label: string };
}

export const ProductAdmin: React.FC<ProductAdminProps> = ({ initialTab = 'products', openNewProductRequestKey, catalogFilter }) => {
  const list = useProducts((s) => s.list);
  const hydrateProducts = useProducts((s) => s.hydrate);
  const bulkUpsert = useProducts((s) => s.bulkUpsert);
  const createCatalogBatch = useProducts((s) => s.createCatalogBatch);
  const remove = useProducts((s) => s.remove);
  const restore = useProducts((s) => s.restore);
  const syncPersistedProducts = useProducts((s) => s.syncPersisted);
  const setMainView = useStore((s) => s.setMainView);
  const csvImportEnabled = usePlatformFeatureFlag('csv_import', FEATURES.csvImport);

  const categories = useCategories((s) => s.list);
  const hydrateCategories = useCategories((s) => s.hydrate);
  const addCategory = useCategories((s) => s.addCategory);
  const addSubcategory = useCategories((s) => s.addSubcategory);
  const removeCategory = useCategories((s) => s.removeCategory);
  const renameCategory = useCategories((s) => s.renameCategory);
  const setCategoryIcon = useCategories((s) => s.setCategoryIcon);
  const setCategoryVatRate = useCategories((s) => s.setCategoryVatRate);
  const storeConfiguration = useStoreConfiguration((s) => s.configuration);
  const configuredDefaultVat = configuredVatFallback(storeConfiguration);
  const currentStoreId = useAuth((state) => state.currentStoreId);

  type SortKey = 'name' | 'category' | 'subCategory' | 'sku' | 'costPriceCents' | 'priceCents' | 'margin' | 'stockQty' | 'vatRate' | 'isActive';
  type SortDirection = 'asc' | 'desc';

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [viewTab, setViewTab] = useState<'products' | 'categories'>(initialTab);
  const [filter, setFilter] = useState<'active' | 'archived' | 'all'>('active');
  const [categoryFilter, setCategoryFilter] = useState<string | 'all'>('all');
  const [search, setSearch] = useState('');
  const [paceSelection, setPaceSelection] = useState<{ productIds: string[]; label: string } | null>(null);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryVatRate, setNewCategoryVatRate] = useState<number>(configuredDefaultVat);
  const [newSubcategoryByParent, setNewSubcategoryByParent] = useState<Record<string, string>>({});
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editingCatName, setEditingCatName] = useState<string>('');
  const [expandedCategoryIds, setExpandedCategoryIds] = useState<Set<string>>(() => new Set());
  const [iconPickerFor, setIconPickerFor] = useState<string | null>(null);
  const [iconSearch, setIconSearch] = useState('');
  const [iconGroupId, setIconGroupId] = useState(CATEGORY_ICON_GROUPS[0].id);
  const [editing, setEditing] = useState<Product | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [priceText, setPriceText] = useState('0,00');
  const [costText, setCostText] = useState('0,00');
  const [countedStockText, setCountedStockText] = useState('');
  const [adjustmentReason, setAdjustmentReason] = useState<InventoryAdjustmentReason>('cycle-count');
  const [adjustmentNote, setAdjustmentNote] = useState('');
  const [adjustmentFeedback, setAdjustmentFeedback] = useState<string | null>(null);
  const [savingAdjustment, setSavingAdjustment] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Product | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDirection>('asc');
  const [headerContainer, setHeaderContainer] = useState<HTMLElement | null>(null);
  const [guidedProductName, setGuidedProductName] = useState<string | null>(null);
  const [catalogBuilderOpen, setCatalogBuilderOpen] = useState(false);
  const [editingFamilyId, setEditingFamilyId] = useState<string | undefined>();

  useEffect(() => {
    setViewTab(initialTab);
    if (initialTab === 'categories') {
      setCatalogBuilderOpen(false);
      setEditingFamilyId(undefined);
      setEditing(null);
    }
  }, [initialTab]);

  useEffect(() => {
    if (!catalogFilter) return;
    setViewTab('products');
    setFilter('active');
    setCategoryFilter('all');
    setSearch('');
    setPaceSelection({ productIds: catalogFilter.productIds, label: catalogFilter.label });
  }, [catalogFilter?.requestKey]);

  useEffect(() => {
    setNewCategoryVatRate(configuredDefaultVat);
  }, [configuredDefaultVat]);

  useEffect(() => {
    setHeaderContainer(document.getElementById('catalog-header-actions'));
  }, [viewTab]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  useEffect(() => {
    void hydrateCategories();
    void hydrateProducts();
  }, [hydrateProducts, hydrateCategories]);

  const categoryNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of categories) m.set(c.id, c.name);
    return m;
  }, [categories]);

  const rootCategories = useMemo(
    () => categories.filter((category) => !category.parentId),
    [categories],
  );
  const subcategoriesByParent = useMemo(() => {
    const grouped = new Map<string, typeof categories>();
    for (const category of categories) {
      if (!category.parentId) continue;
      grouped.set(category.parentId, [...(grouped.get(category.parentId) ?? []), category]);
    }
    return grouped;
  }, [categories]);

  const categoryVatById = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of categories) m.set(c.id, c.vatRate ?? configuredDefaultVat);
    return m;
  }, [categories, configuredDefaultVat]);

  const productCountByCat = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of list) {
      if (p.isActive !== false) {
        const path = resolveProductCategoryPath(p, categories);
        const rootId = path?.root.id ?? p.category;
        map.set(rootId, (map.get(rootId) || 0) + 1);
      }
    }
    return map;
  }, [categories, list]);
  const productCountBySubcategory = useMemo(() => {
    const counts = new Map<string, number>();
    for (const subcategory of categories.filter((category) => category.parentId)) {
      const count = list.filter((product) =>
        product.isActive !== false
        && resolveProductCategoryPath(product, categories)?.leaf?.id === subcategory.id
      ).length;
      counts.set(subcategory.id, count);
    }
    return counts;
  }, [categories, list]);
  const familySizeById = useMemo(() => {
    const map = new Map<string, number>();
    for (const product of list) if (product.familyId) {
      map.set(product.familyId, (map.get(product.familyId) ?? 0) + 1);
    }
    return map;
  }, [list]);
  const editingBelongsToFamily = Boolean(
    editing?.familyId
      && ((familySizeById.get(editing.familyId) ?? 0) > 1 || editing.variantOptions),
  );

  const activeProducts = list.filter((p) => p.isActive !== false);
  const inventoryStats = useMemo(() => {
    const tracked = activeProducts.filter((p) => p.stockQty != null);
    const stockUnits = tracked.reduce((sum, p) => sum + (p.stockQty ?? 0), 0);
    const inventoryCost = tracked.reduce((sum, p) => sum + (p.costPriceCents ?? 0) * (p.stockQty ?? 0), 0);
    const inventoryRetail = tracked.reduce((sum, p) => sum + p.priceCents * (p.stockQty ?? 0), 0);
    const lowStock = tracked.filter((p) => p.minStockQty != null && (p.stockQty ?? 0) <= p.minStockQty).length;
    return { stockUnits, inventoryCost, inventoryRetail, potentialMargin: inventoryRetail - inventoryCost, lowStock };
  }, [activeProducts]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return list
      .filter((p) => {
        if (filter === 'active' && p.isActive === false) return false;
        if (filter === 'archived' && p.isActive !== false) return false;
        const categoryPath = resolveProductCategoryPath(p, categories);
        if (categoryFilter !== 'all' && categoryPath?.root.id !== categoryFilter) return false;
        if (paceSelection && !paceSelection.productIds.includes(p.id)) return false;
        if (!term) return true;

        const catName = categoryPath?.root.name ?? categoryNameById.get(p.category) ?? p.category;
        const searchHaystack = [
          p.name, p.brand, p.supplier, p.variant, p.sku, p.barcode,
          p.subCategory, catName, ...(p.identifiers ?? []).map((identifier) => identifier.value),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        return searchHaystack.includes(term);
      })
      .sort((a, b) => {
        const mult = sortDir === 'asc' ? 1 : -1;

        if (sortKey === 'name') return mult * a.name.localeCompare(b.name);
        if (sortKey === 'category') {
          const catA = resolveProductCategoryPath(a, categories)?.root.name ?? categoryNameById.get(a.category) ?? a.category;
          const catB = resolveProductCategoryPath(b, categories)?.root.name ?? categoryNameById.get(b.category) ?? b.category;
          return mult * catA.localeCompare(catB);
        }
        if (sortKey === 'subCategory') return mult * (a.subCategory ?? '').localeCompare(b.subCategory ?? '');
        if (sortKey === 'sku') return mult * (a.sku ?? '').localeCompare(b.sku ?? '');
        if (sortKey === 'costPriceCents') return mult * ((a.costPriceCents ?? 0) - (b.costPriceCents ?? 0));
        if (sortKey === 'priceCents') return mult * (a.priceCents - b.priceCents);
        if (sortKey === 'margin') return mult * (marginPercent(a.priceCents, a.costPriceCents) - marginPercent(b.priceCents, b.costPriceCents));
        if (sortKey === 'stockQty') return mult * ((a.stockQty ?? -1) - (b.stockQty ?? -1));
        if (sortKey === 'vatRate') return mult * ((a.vatRate ?? BELGIAN_RETAIL_VAT_RATE) - (b.vatRate ?? BELGIAN_RETAIL_VAT_RATE));
        if (sortKey === 'isActive') return mult * ((a.isActive === false ? 0 : 1) - (b.isActive === false ? 0 : 1));

        return 0;
      });
  }, [list, filter, categoryFilter, paceSelection, search, sortKey, sortDir, categoryNameById, categories]);

  const ensureStartingCategory = async () => {
    // A real new tenant has no seeded categories. Create one safe starting
    // category so the first-product route from the guided setup is usable
    // immediately, while the merchant can still rename or add categories later.
    let category = rootCategories[0];
    if (!category) {
      try {
        category = await addCategory('Algemeen', configuredDefaultVat) ?? undefined;
      } catch (error) {
        alert(error instanceof Error ? error.message : 'De startcategorie kon niet worden aangemaakt.');
        return;
      }
    }
    return category;
  };

  const openNew = async (seed?: Product) => {
    const category = await ensureStartingCategory();
    if (!category) return;
    const emptyProduct: Product = {
      id: '',
      name: '',
      category: category.id,
      subCategory: '',
      priceCents: 0,
      costPriceCents: 0,
      vatRate: category.vatRate ?? configuredDefaultVat,
      brand: '',
      supplier: '',
      supplierCode: '',
      variant: '',
      priceTiers: {},
      sku: '',
      barcode: '',
      stockQty: 0,
      minStockQty: 0,
      color: 'bg-sky-700',
      isActive: true,
    };
    const seedPath = seed ? resolveProductCategoryPath(seed, categories) : null;
    const next = seed ? {
      ...emptyProduct,
      ...seed,
      id: '',
      category: seedPath?.root.id ?? seed.category,
      subCategory: seedPath?.leaf?.name ?? seed.subCategory,
    } : emptyProduct;
    setEditing(next);
    setIsNew(true);
    setPriceText(centsToInput(next.priceCents));
    setCostText(centsToInput(next.costPriceCents));
    setCountedStockText('');
    setAdjustmentReason('opening-balance');
    setAdjustmentNote('');
    setAdjustmentFeedback(null);
  };

  const openCatalogBuilder = async () => {
    const category = await ensureStartingCategory();
    if (!category) return;
    setEditingFamilyId(undefined);
    setCatalogBuilderOpen(true);
  };

  const openFamilyBuilder = (familyId: string) => {
    setEditing(null);
    setEditingFamilyId(familyId);
    setCatalogBuilderOpen(true);
  };

  const saveCatalogBuilderProducts = async (
    products: Product[],
    family?: ManualCatalogFamilyPayload,
  ) => {
    await createCatalogBatch(products, family);
    if (openNewProductRequestKey && products[0]) {
      setGuidedProductName(products[0].name);
      window.dispatchEvent(new CustomEvent('pwayment:first-product-ready', {
        detail: { productName: products[0].name },
      }));
    }
  };

  useEffect(() => {
    if (
      !openNewProductRequestKey ||
      handledGuidedProductRequests.has(openNewProductRequestKey)
    ) return;
    handledGuidedProductRequests.add(openNewProductRequestKey);
    void openCatalogBuilder();
  }, [openNewProductRequestKey, categories, configuredDefaultVat]);

  const openEdit = (p: Product) => {
    const path = resolveProductCategoryPath(p, categories);
    setEditing({
      ...p,
      category: path?.root.id ?? p.category,
      subCategory: path?.leaf?.name ?? p.subCategory,
    });
    setIsNew(false);
    setPriceText(centsToInput(p.priceCents));
    setCostText(centsToInput(p.costPriceCents));
    setCountedStockText(p.stockQty == null ? '' : String(p.stockQty));
    setAdjustmentReason('cycle-count');
    setAdjustmentNote('');
    setAdjustmentFeedback(null);
  };

  const close = () => {
    setEditing(null);
    setIsNew(false);
    setAdjustmentFeedback(null);
  };

  const save = async () => {
    if (!editing) return;
    const name = editing.name.trim();
    const sku = editing.sku?.trim();
    const barcode = editing.barcode?.trim();
    const brand = editing.brand?.trim();
    const supplier = editing.supplier?.trim();
    const supplierCode = editing.supplierCode?.trim();
    const variant = editing.variant?.trim();
    const subCategory = editing.subCategory?.trim();

    if (!name) {
      alert('Naam is verplicht.');
      return;
    }
    if (!editing.category) {
      alert('Categorie is verplicht.');
      return;
    }

    const price = parseDecimalToCents(priceText);
    if (!price.ok || price.cents <= 0) {
      alert('Verkoopprijs is ongeldig. Gebruik bv. 12,50 en meer dan EUR 0,00.');
      return;
    }
    const cost = parseDecimalToCents(costText || '0');
    if (!cost.ok) {
      alert('Aankoopprijs is ongeldig. Gebruik bv. 6,25.');
      return;
    }
    const priceCents = price.cents;
    const costPriceCents = cost.cents;

    const vatRate = categoryVatById.get(editing.category);
    if (!isSupportedVatRate(vatRate)) {
      alert(
        `De categorie heeft BTW-tarief ${String(vatRate)}%. Enkel ${SUPPORTED_VAT_RATES.join('% en ')}% zijn ondersteund.`,
      );
      return;
    }

    if (sku && list.some((p) => p.id !== editing.id && p.sku?.toLowerCase() === sku.toLowerCase())) {
      alert('SKU bestaat al. Gebruik een unieke SKU.');
      return;
    }

    if (barcode && list.some((p) => p.id !== editing.id && p.barcode === barcode)) {
      alert('Barcode bestaat al. Gebruik een unieke barcode.');
      return;
    }

    // Stock is deliberately not editable through the catalog form. Existing
    // products retain their current quantity; a physical count below records
    // every actual correction with a reason and audit trail.
    const stockQty = isNew ? editing.stockQty ?? 0 : editing.stockQty;
    const minStockQty = parseWhole(String(editing.minStockQty ?? ''));

    let id = editing.id.trim();
    if (isNew) {
      const base = slugifyId(`${brand || 'item'}-${name}`) || 'product';
      let candidate = base;
      let i = 2;
      while (list.some((p) => p.id === candidate)) candidate = `${base}-${i++}`;
      id = candidate;
    }

    const productToSave: Product = {
      ...editing,
      id,
      name,
      sku: sku || undefined,
      barcode: barcode || undefined,
      brand: brand || undefined,
      supplier: supplier || undefined,
      supplierCode: supplierCode || undefined,
      variant: variant || undefined,
      category: subCategory
        ? subcategoriesByParent.get(editing.category)?.find(
            (category) => category.name.toLocaleLowerCase('nl-BE') === subCategory.toLocaleLowerCase('nl-BE'),
          )?.id ?? editing.category
        : editing.category,
      subCategory: subCategory || undefined,
      costPriceCents,
      priceCents,
      vatRate,
      stockQty,
      minStockQty,
      isActive: editing.isActive ?? true,
    };
    await createCatalogBatch([productToSave]);
    if (isNew && openNewProductRequestKey) {
      setGuidedProductName(name);
      window.dispatchEvent(
        new CustomEvent("pwayment:first-product-ready", {
          detail: { productName: name },
        }),
      );
    }
    close();
  };

  const saveInventoryCount = async () => {
    if (!editing || isNew) return;
    if (editing.stockQty == null) {
      setAdjustmentFeedback('Dit product volgt geen voorraad. Activeer voorraadtracking eerst via de productconfiguratie.');
      return;
    }
    const countedStockQty = parseWhole(countedStockText);
    if (countedStockQty == null) {
      setAdjustmentFeedback('Vul een geldig geteld aantal in.');
      return;
    }
    if (adjustmentReason === 'other' && !adjustmentNote.trim()) {
      setAdjustmentFeedback('Geef bij “Andere reden” een korte toelichting.');
      return;
    }

    setSavingAdjustment(true);
    setAdjustmentFeedback(null);
    try {
      const requestId = globalThis.crypto?.randomUUID?.()
        ?? `inventory-count-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      const result = await recordInventoryCount({
        clientRequestId: requestId,
        productId: editing.id,
        expectedStockQty: editing.stockQty,
        countedStockQty,
        reason: adjustmentReason,
        note: adjustmentNote,
      });
      syncPersistedProducts([result.product]);
      setEditing((current) => current?.id === result.product.id ? { ...current, stockQty: result.product.stockQty } : current);
      setCountedStockText(String(result.product.stockQty ?? ''));
      setAdjustmentNote('');
      setAdjustmentFeedback(
        result.movement
          ? `Telling vastgelegd: ${result.movement.quantityBefore} → ${result.movement.quantityAfter} stuks.`
          : 'Telling vastgelegd: systeemvoorraad en fysieke telling komen overeen.',
      );
    } catch (error) {
      setAdjustmentFeedback(
        error instanceof InventoryAdjustmentError || error instanceof Error
          ? error.message
          : 'De voorraadtelling kon niet worden vastgelegd.',
      );
    } finally {
      setSavingAdjustment(false);
    }
  };

  const createCategory = async () => {
    const created = await addCategory(newCategoryName, newCategoryVatRate);
    if (!created) {
      alert('Categorie kon niet toegevoegd worden (bestaat al of is ongeldig).');
      return;
    }
    setNewCategoryName('');
  };

  const createSubcategory = async (parentId: string) => {
    const created = await addSubcategory(parentId, newSubcategoryByParent[parentId] ?? '');
    if (!created) {
      alert('Subcategorie kon niet toegevoegd worden (bestaat al of is ongeldig).');
      return;
    }
    setNewSubcategoryByParent((current) => ({ ...current, [parentId]: '' }));
  };

  const deleteCategory = async (id: string) => {
    const ok = await removeCategory(id);
    if (!ok) {
      alert('Categorie bevat nog producten. Verplaats of archiveer eerst die producten.');
      return;
    }
    if (categoryFilter === id) setCategoryFilter('all');
  };

  const exportProducts = () => {
    const csv = serializeProductsCsv(list);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `pwayment_products_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
  };

  const importProducts = async (file: File) => {
    if (!csvImportEnabled) {
      alert('CSV-import is uitgeschakeld.');
      return;
    }
    const { products, issues } = parseProductsCsv(await file.text(), {
      existing: list,
      categoryVatById,
      categories,
    });

    if (issues.length > 0) {
      const shown = issues.slice(0, 15).map((i) => `Regel ${i.line}: ${i.message}`).join('\n');
      alert(
        `Import geannuleerd — ${issues.length} fout(en) gevonden. Er is niets gewijzigd.\n\n${shown}` +
          (issues.length > 15 ? `\n… en ${issues.length - 15} meer.` : ''),
      );
      return;
    }
    if (products.length === 0) {
      alert('Geen rijen gevonden om te importeren.');
      return;
    }

    try {
      await bulkUpsert(products);
      alert(`${products.length} producten geimporteerd.`);
    } catch (err) {
      alert(`Import mislukt, niets gewijzigd: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const Kpi = ({ label, value, tone = 'slate' }: { label: string; value: string; tone?: 'slate' | 'amber' | 'emerald' }) => (
    <div className={`p-4 rounded-2xl border bg-white ${tone === 'amber' ? 'border-amber-200' : tone === 'emerald' ? 'border-emerald-200' : 'border-slate-200'} shadow-2xs`}>
      <div className="text-[10px] uppercase font-black text-slate-400 tracking-wider mb-1">{label}</div>
      <div className="text-xl font-black text-slate-900">{value}</div>
    </div>
  );

  const renderSortTh = (key: SortKey, label: string, align: 'left' | 'right' | 'center' = 'left', extraClass = '') => {
    const isActive = sortKey === key;
    return (
      <th
        onClick={() => handleSort(key)}
        className={`py-3 px-3 font-black cursor-pointer select-none group hover:text-slate-900 transition-colors text-${align} ${extraClass}`}
      >
        <div className={`flex items-center gap-1.5 ${align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start'}`}>
          <span>{label}</span>
          {isActive ? (
            sortDir === 'asc' ? <ArrowUp size={12} className="text-slate-900 shrink-0" /> : <ArrowDown size={12} className="text-slate-900 shrink-0" />
          ) : (
            <ArrowUpDown size={12} className="text-slate-300 group-hover:text-slate-500 shrink-0 opacity-60 group-hover:opacity-100 transition-opacity" />
          )}
        </div>
      </th>
    );
  };

  if (catalogBuilderOpen) {
    return (
      <CatalogBuilder
        categories={categories}
        products={list}
        defaultVat={configuredDefaultVat}
        categoryVatById={categoryVatById}
        draftKey={`pwayment:catalog-draft:${currentStoreId ?? 'local'}`}
        editingFamilyId={editingFamilyId}
        onClose={() => { setCatalogBuilderOpen(false); setEditingFamilyId(undefined); }}
        onOpenImport={() => {
          setCatalogBuilderOpen(false);
          setMainView('integration-hub');
        }}
        onOpenFullEditor={(seed) => {
          setCatalogBuilderOpen(false);
          void openNew(seed);
        }}
        onSaveProducts={saveCatalogBuilderProducts}
      />
    );
  }

  return (
    <div className="product-admin space-y-6">
      {guidedProductName && (
        <section className="relative overflow-hidden rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 via-white to-sky-50 p-5 shadow-2xs">
          <div className="absolute -right-10 -top-10 h-28 w-28 rounded-full bg-sky-200/45 blur-2xl" />
          <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm"><CheckCircle2 size={19} /></span>
              <div>
                <p className="text-sm font-black text-slate-950"><span className="font-black">{guidedProductName}</span> staat klaar voor verkoop.</p>
                <p className="mt-1 text-xs leading-5 text-slate-600">Dat was je eerste product. Kies je volgende stap — je hoeft nergens naar te zoeken.</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setMainView('pos')} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#0e7490] bg-[#0e7490] px-3.5 text-xs font-extrabold text-white shadow-sm transition hover:border-[#0f6677] hover:bg-[#0f6677]"><Package size={15} /> Naar de kassa</button>
              <button type="button" onClick={() => void openCatalogBuilder()} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-bold text-slate-700 hover:bg-slate-50"><Plus size={15} /> Nog een product</button>
              <button type="button" onClick={() => setMainView('integration-hub')} className="inline-flex min-h-10 items-center gap-2 rounded-xl px-2.5 text-xs font-bold text-sky-800 hover:bg-sky-100"><Upload size={15} /> Importeren</button>
            </div>
          </div>
        </section>
      )}
      {/* Portal action buttons to main page header container (helemaal rechtsboven) */}
      {headerContainer
        ? createPortal(
            <div className="product-admin-header-actions flex flex-wrap items-center gap-2">
              {viewTab === 'products' && (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void importProducts(file);
                      e.currentTarget.value = '';
                    }}
                  />
                  <button
                    onClick={exportProducts}
                    className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-all border border-slate-200 shadow-2xs cursor-pointer"
                  >
                    <Download size={15} />
                    <span className="hidden sm:inline">Export CSV</span>
                  </button>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={!csvImportEnabled}
                    title={csvImportEnabled ? undefined : 'CSV-import is uitgeschakeld'}
                    className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-all border border-slate-200 shadow-2xs disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <Upload size={15} />
                    <span className="hidden sm:inline">Import CSV</span>
                  </button>
                  <button
                    onClick={() => void openCatalogBuilder()}
                    className="flex items-center gap-2 rounded-xl border border-[#0e7490] bg-[#0e7490] px-4 py-2 text-xs font-black text-white shadow-sm transition hover:border-[#0f6677] hover:bg-[#0f6677] cursor-pointer"
                  >
                    <Plus size={16} />
                    <span>Product toevoegen</span>
                  </button>
                </>
              )}
            </div>,
            headerContainer
          )
        : (
          viewTab === 'products' && (
            <div className="flex justify-end gap-2 pb-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void importProducts(file);
                  e.currentTarget.value = '';
                }}
              />
              <button
                onClick={exportProducts}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-all border border-slate-200 shadow-2xs cursor-pointer"
              >
                <Download size={15} />
                <span>Export CSV</span>
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={!csvImportEnabled}
                title={csvImportEnabled ? undefined : 'CSV-import is uitgeschakeld'}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-all border border-slate-200 shadow-2xs disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                <Upload size={15} />
                <span>Import CSV</span>
              </button>
              <button
                    onClick={() => void openCatalogBuilder()}
                className="flex items-center gap-2 rounded-xl border border-[#0e7490] bg-[#0e7490] px-4 py-2 text-xs font-black text-white shadow-sm transition hover:border-[#0f6677] hover:bg-[#0f6677] cursor-pointer"
              >
                <Plus size={16} />
                <span>Product toevoegen</span>
              </button>
            </div>
          )
        )}

      {viewTab === 'categories' ? (
        <div className="space-y-6">
          {/* Create Category Card */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-5 space-y-3 shadow-2xs">
            <div className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-2">
              <Plus size={15} className="text-slate-500" />
              <span>Nieuwe Categorie Toevoegen</span>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void createCategory();
                }}
                placeholder="bv. Accessoires, Skateboards, Kleding, Protection..."
                className="flex-1 bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
              <select
                aria-label="BTW-tarief voor nieuwe categorie"
                value={newCategoryVatRate}
                onChange={(event) => setNewCategoryVatRate(Number(event.target.value))}
                className="bg-white border border-slate-300 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
              >
                {SUPPORTED_VAT_RATES.map((rate) => <option key={rate} value={rate}>{rate}% BTW</option>)}
              </select>
              <button
                onClick={() => void createCategory()}
                className="flex shrink-0 items-center justify-center gap-2 rounded-xl border border-[#0e7490] bg-[#0e7490] px-5 py-2.5 text-xs font-black text-white shadow-sm transition hover:border-[#0f6677] hover:bg-[#0f6677] cursor-pointer"
              >
                <Plus size={16} />
                <span>Categorie Toevoegen</span>
              </button>
            </div>
          </div>

          {/* Categories List */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
            <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">
                {rootCategories.length} hoofdcategorieën · {categories.length - rootCategories.length} subcategorieën
              </span>
              <span className="text-[11px] font-bold text-slate-400">
                Onboarding-default: {configuredDefaultVat}%
              </span>
            </div>

            <div className="divide-y divide-slate-100">
              {rootCategories.map((c) => {
                const productCount = productCountByCat.get(c.id) || 0;
                const isEditingThis = editingCatId === c.id;
                const isExpanded = expandedCategoryIds.has(c.id);
                const subcategories = subcategoriesByParent.get(c.id) ?? [];
                const CategoryIcon = categoryIcon(c.icon);
                const selectedIconGroup = CATEGORY_ICON_GROUPS.find((group) => group.id === iconGroupId);
                const shownIcons = iconSearch.trim()
                  ? CATEGORY_ICON_OPTIONS.filter(([name, label]) =>
                    `${name} ${label}`.toLocaleLowerCase('nl-BE').includes(iconSearch.trim().toLocaleLowerCase('nl-BE')),
                  )
                  : selectedIconGroup?.icons ?? CATEGORY_ICON_OPTIONS;

                return (
                  <div key={c.id}>
                  <div
                    className="cursor-pointer p-4 flex items-center justify-between gap-4 hover:bg-slate-50/60 transition-colors"
                    role="button"
                    tabIndex={0}
                    onClick={() => setExpandedCategoryIds((current) => {
                      const next = new Set(current);
                      next.has(c.id) ? next.delete(c.id) : next.add(c.id);
                      return next;
                    })}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter' && event.key !== ' ') return;
                      event.preventDefault();
                      setExpandedCategoryIds((current) => {
                        const next = new Set(current);
                        next.has(c.id) ? next.delete(c.id) : next.add(c.id);
                        return next;
                      });
                    }}
                    aria-expanded={isExpanded}
                  >
                    <div className="flex-1 min-w-0 flex items-center gap-3">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setIconPickerFor(iconPickerFor === c.id ? null : c.id);
                          setIconSearch('');
                          const group = CATEGORY_ICON_GROUPS.find((candidate) =>
                            candidate.icons.some(([name]) => name === c.icon),
                          );
                          setIconGroupId(group?.id ?? CATEGORY_ICON_GROUPS[0].id);
                        }}
                        className="group flex shrink-0 items-center justify-center rounded-xl bg-slate-100 p-2.5 text-slate-700 transition hover:bg-sky-100 hover:text-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500"
                        title={`Icoon wijzigen (${categoryIconLabel(c.icon)})`}
                        aria-label={`Icoon voor ${c.name} wijzigen`}
                        aria-expanded={iconPickerFor === c.id}
                      >
                        <CategoryIcon size={18} strokeWidth={2} />
                      </button>
                      {isEditingThis ? (
                        <div className="flex items-center gap-2 flex-1 max-w-md" onClick={(event) => event.stopPropagation()}>
                          <input
                            value={editingCatName}
                            onChange={(e) => setEditingCatName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                void renameCategory(c.id, editingCatName);
                                setEditingCatId(null);
                              } else if (e.key === 'Escape') {
                                setEditingCatId(null);
                              }
                            }}
                            className="flex-1 bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                            autoFocus
                          />
                          <button
                            onClick={async () => {
                              await renameCategory(c.id, editingCatName);
                              setEditingCatId(null);
                            }}
                            className="rounded-xl border border-[#0e7490] bg-[#0e7490] p-2 text-white transition-colors hover:border-[#0f6677] hover:bg-[#0f6677] cursor-pointer"
                            title="Opslaan"
                          >
                            <Check size={15} />
                          </button>
                          <button
                            onClick={() => setEditingCatId(null)}
                            className="p-2 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors cursor-pointer"
                            title="Annuleren"
                          >
                            <X size={15} />
                          </button>
                        </div>
                      ) : (
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-sm text-slate-900">{c.name}</span>
                            <button
                              onClick={(event) => {
                                event.stopPropagation();
                                setEditingCatId(c.id);
                                setEditingCatName(c.name);
                              }}
                              className="p-1 rounded-md text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
                              title="Categorie Hernoemen / Aanpassen"
                            >
                              <Pencil size={13} />
                            </button>
                          </div>
                          <div className="text-[11px] text-slate-400 font-medium mt-0.5">
                            ID: <code className="font-mono text-slate-600">{c.id}</code> • BTW: {c.vatRate ?? BELGIAN_RETAIL_VAT_RATE}%
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <label className="flex items-center gap-2 text-[11px] font-bold text-slate-500">
                        <span className="sr-only">BTW-tarief voor {c.name}</span>
                        <select
                          value={c.vatRate ?? configuredDefaultVat}
                          onClick={(event) => event.stopPropagation()}
                          onChange={(event) => void setCategoryVatRate(c.id, Number(event.target.value))}
                          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-900"
                        >
                          {SUPPORTED_VAT_RATES.map((rate) => <option key={rate} value={rate}>{rate}% BTW</option>)}
                        </select>
                      </label>
                      <span className="px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
                        {productCount} {productCount === 1 ? 'product' : 'producten'}
                      </span>

                      <button
                        onClick={(event) => { event.stopPropagation(); void deleteCategory(c.id); }}
                        className="p-2 rounded-xl text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-100 transition-colors cursor-pointer"
                        title="Categorie Verwijderen"
                      >
                        <Trash2 size={16} />
                      </button>
                      {isExpanded ? <ChevronDown size={17} className="text-slate-400" /> : <ChevronRight size={17} className="text-slate-400" />}
                    </div>
                  </div>
                  {iconPickerFor === c.id && (
                    <div className="border-t border-sky-100 bg-sky-50/70 px-4 py-4 sm:pl-16">
                      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-xs font-extrabold text-slate-900">Kies een categorie-icoon</p>
                          <p className="mt-0.5 text-[11px] font-medium text-slate-500">Dit icoon verschijnt in de kassa en wordt opgeslagen voor alle toestellen.</p>
                        </div>
                        <label className="relative block">
                          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                          <input value={iconSearch} onChange={(event) => setIconSearch(event.target.value)} placeholder="Zoek een icoon" className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-3 text-xs font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-sky-500 sm:w-48" />
                        </label>
                      </div>
                      <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
                        {CATEGORY_ICON_GROUPS.map((group) => <button key={group.id} type="button" onClick={() => { setIconGroupId(group.id); setIconSearch(''); }} className={`shrink-0 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition ${iconGroupId === group.id ? 'border-sky-600 bg-sky-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-sky-300 hover:text-sky-700'}`}>{group.label}</button>)}
                      </div>
                      <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-9 lg:grid-cols-12">
                        {shownIcons.map(([name, label, Icon]) => {
                          const selected = c.icon === name;
                          return <button key={name} type="button" onClick={() => { void setCategoryIcon(c.id, name); setIconPickerFor(null); }} title={label} aria-label={`${label} selecteren`} aria-pressed={selected} className={`flex aspect-square items-center justify-center rounded-lg border transition ${selected ? 'border-sky-600 bg-sky-600 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700'}`}><Icon size={18} strokeWidth={2} /></button>;
                        })}
                      </div>
                      {shownIcons.length === 0 && <p className="py-3 text-xs font-semibold text-slate-500">Geen icoon gevonden. Probeer bijvoorbeeld “sport”, “eten” of “auto”.</p>}
                    </div>
                  )}
                  {isExpanded && <div className="border-t border-slate-100 bg-slate-50/50 px-4 py-3 sm:pl-16">
                    <div className="space-y-2">
                      {subcategories.map((subcategory) => {
                        const isEditingSubcategory = editingCatId === subcategory.id;
                        const count = productCountBySubcategory.get(subcategory.id) ?? 0;
                        return (
                          <div key={subcategory.id} className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex min-w-0 items-center gap-2.5">
                              <CornerDownRight size={15} className="shrink-0 text-sky-600" />
                              {isEditingSubcategory ? (
                                <div className="flex min-w-0 flex-1 items-center gap-2">
                                  <input
                                    value={editingCatName}
                                    onChange={(event) => setEditingCatName(event.target.value)}
                                    onKeyDown={(event) => {
                                      if (event.key === 'Enter') {
                                        void renameCategory(subcategory.id, editingCatName);
                                        setEditingCatId(null);
                                      } else if (event.key === 'Escape') setEditingCatId(null);
                                    }}
                                    className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-slate-900"
                                    autoFocus
                                  />
                                  <button type="button" onClick={async () => { await renameCategory(subcategory.id, editingCatName); setEditingCatId(null); }} className="rounded-lg bg-[#0e7490] p-1.5 text-white" title="Opslaan"><Check size={14} /></button>
                                  <button type="button" onClick={() => setEditingCatId(null)} className="rounded-lg bg-slate-100 p-1.5 text-slate-600" title="Annuleren"><X size={14} /></button>
                                </div>
                              ) : (
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className="truncate text-xs font-extrabold text-slate-800">{subcategory.name}</span>
                                    <button type="button" onClick={() => { setEditingCatId(subcategory.id); setEditingCatName(subcategory.name); }} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-900" title="Subcategorie hernoemen"><Pencil size={12} /></button>
                                  </div>
                                  <span className="text-[10px] font-semibold text-slate-400">Neemt {c.vatRate ?? configuredDefaultVat}% BTW over van {c.name}</span>
                                </div>
                              )}
                            </div>
                            <div className="flex shrink-0 items-center gap-2 pl-6 sm:pl-0">
                              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-bold text-slate-600">{count} {count === 1 ? 'product' : 'producten'}</span>
                              <button type="button" onClick={() => void deleteCategory(subcategory.id)} className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-50" title="Subcategorie verwijderen"><Trash2 size={14} /></button>
                            </div>
                          </div>
                        );
                      })}
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <input
                          value={newSubcategoryByParent[c.id] ?? ''}
                          onChange={(event) => setNewSubcategoryByParent((current) => ({ ...current, [c.id]: event.target.value }))}
                          onKeyDown={(event) => { if (event.key === 'Enter') void createSubcategory(c.id); }}
                          placeholder={`Nieuwe subcategorie onder ${c.name}`}
                          className="min-w-0 flex-1 rounded-xl border border-dashed border-slate-300 bg-white px-3 py-2 text-xs font-semibold focus:border-sky-500 focus:outline-none"
                        />
                        <button type="button" onClick={() => void createSubcategory(c.id)} className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-extrabold text-sky-800 hover:bg-sky-100"><Plus size={14} /> Subcategorie toevoegen</button>
                      </div>
                    </div>
                  </div>}
                  </div>
                );
              })}

              {rootCategories.length === 0 && (
                <div className="p-8 text-center text-xs text-slate-400 font-medium">
                  Nog geen categorieën aanwezig.
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <>
          {paceSelection && (
            <div className="flex flex-col gap-3 rounded-2xl border border-cyan-200 bg-cyan-50 p-4 text-sm text-cyan-950 shadow-2xs sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <PackageSearch size={19} className="mt-0.5 shrink-0 text-cyan-700" />
                <div>
                  <strong className="block">Pace-selectie · {paceSelection.label}</strong>
                  <span className="mt-0.5 block text-xs text-cyan-800">Alleen beschikbare, passende catalogusartikelen worden getoond. Er is niets aan het winkelmandje toegevoegd.</span>
                </div>
              </div>
              <button type="button" onClick={() => setPaceSelection(null)} className="shrink-0 rounded-xl border border-cyan-300 bg-white px-3 py-2 text-xs font-bold text-cyan-900 hover:bg-cyan-100">Toon volledige catalogus</button>
            </div>
          )}

          {/* KPI Stats Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <Kpi label="Actieve Producten" value={String(activeProducts.length)} />
            <Kpi label="Voorraad Stuks" value={String(inventoryStats.stockUnits)} />
            <Kpi label="Totale Aankoopwaarde" value={formatEUR(inventoryStats.inventoryCost)} />
            <Kpi label="Totale Verkoopwaarde" value={formatEUR(inventoryStats.inventoryRetail)} />
            <Kpi
              label="Potentiële Marge"
              value={formatEUR(inventoryStats.potentialMargin)}
              tone={inventoryStats.lowStock > 0 ? 'amber' : 'emerald'}
            />
          </div>

          {/* Low Stock Alert Banner */}
          {inventoryStats.lowStock > 0 && (
            <div className="flex items-center gap-2.5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900 font-medium shadow-2xs">
              <AlertTriangle size={18} className="text-amber-600 shrink-0" />
              <span><strong>{inventoryStats.lowStock} producten</strong> zitten op of onder de ingestelde minimumvoorraad.</span>
            </div>
          )}

          {/* Search & Filter Toolbar */}
          <div className="flex flex-col sm:flex-row flex-wrap items-center justify-between gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200/80">
            <div className="relative flex-1 min-w-[240px] w-full sm:w-auto">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Zoek op productnaam, merk, SKU of barcode..."
                className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 shadow-2xs"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-start">
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900 shadow-2xs cursor-pointer"
              >
                <option value="all">Alle Categorieën</option>
                {rootCategories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>

              {/* Status Filter Switcher */}
              <div className="flex bg-slate-50 p-0.5 rounded-xl border border-slate-200">
                {(['active', 'archived', 'all'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      filter === f
                        ? 'border border-[#bae6fd] bg-[#f0f9ff] text-[#0e7490] shadow-none'
                        : 'text-slate-600 hover:bg-white hover:text-slate-900 font-semibold'
                    }`}
                  >
                    {f === 'active' ? 'Actief' : f === 'archived' ? 'Gearchiveerd' : 'Alles'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Product Catalog Table - High-End Layout with Single-Line SKUs */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-semibold">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-400 text-[10px] uppercase tracking-wider">
                  <tr>
                    {renderSortTh('name', 'Product & Merk', 'left', 'px-4')}
                    {renderSortTh('category', 'Categorie', 'left')}
                    {renderSortTh('subCategory', 'Subcategorie', 'left')}
                    {renderSortTh('sku', 'SKU Code', 'left', 'min-w-[140px]')}
                    {renderSortTh('costPriceCents', 'Aankoop', 'right')}
                    {renderSortTh('priceCents', 'Verkoop', 'right')}
                    {renderSortTh('margin', 'Marge %', 'right')}
                    {renderSortTh('stockQty', 'Voorraad', 'center')}
                    {renderSortTh('vatRate', 'Btw', 'center')}
                    {renderSortTh('isActive', 'Status', 'center')}
                    <th className="sticky right-0 z-10 border-l border-slate-200 bg-slate-50 py-3 pl-4 pr-5 text-right font-black shadow-[-8px_0_16px_-14px_rgba(15,23,42,0.45)]">Acties</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={11} className="text-center py-12 text-slate-400 font-medium">
                        Geen producten gevonden die voldoen aan de zoekcriteria.
                      </td>
                    </tr>
                  )}
                  {filtered.map((p) => {
                    const lowStock = p.stockQty != null && p.minStockQty != null && p.stockQty <= p.minStockQty;
                    return (
                      <tr key={p.id} className="group hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <span className={`inline-block w-3.5 h-3.5 rounded-full shrink-0 ${p.color || 'bg-slate-700'}`} />
                            <div className="min-w-0">
                              <button
                                type="button"
                                onClick={() => openEdit(p)}
                                className="block max-w-[200px] truncate text-left font-extrabold text-slate-900 hover:text-sky-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                                title={`Bewerk ${p.name}`}
                              >
                                {p.name}
                              </button>
                              <div className="text-[11px] text-slate-400 truncate max-w-[180px]">
                                {[p.brand, p.variant].filter(Boolean).join(' • ') || p.id}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-3 font-bold text-slate-800 whitespace-nowrap">
                          {resolveProductCategoryPath(p, categories)?.root.name ?? categoryNameById.get(p.category) ?? p.category}
                        </td>
                        <td className="py-3 px-3 text-slate-500 whitespace-nowrap">
                          {resolveProductCategoryPath(p, categories)?.leaf?.name ?? p.subCategory ?? '-'}
                        </td>
                        {/* SINGLE-LINE Crisp SKU Code Display */}
                        <td className="py-3 px-3 whitespace-nowrap font-mono text-[11px] text-slate-600 font-extrabold" title={p.sku}>
                          {p.sku ? (
                            <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200/80">
                              {p.sku}
                            </span>
                          ) : (
                            <span className="text-slate-300">-</span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right tabular-nums text-slate-500 whitespace-nowrap">
                          {formatEUR(p.costPriceCents ?? 0)}
                        </td>
                        <td className="py-3 px-3 text-right tabular-nums font-black text-slate-900 whitespace-nowrap">
                          {formatEUR(p.priceCents)}
                        </td>
                        <td className="py-3 px-3 text-right tabular-nums font-extrabold text-emerald-700 whitespace-nowrap">
                          {marginPercent(p.priceCents, p.costPriceCents).toFixed(1)}%
                        </td>
                        <td className="py-3 px-3 text-center whitespace-nowrap">
                          {p.stockQty == null ? (
                            <span className="text-slate-400">-</span>
                          ) : (
                            <span className={`px-2 py-0.5 rounded-full font-bold text-xs ${
                              lowStock
                                ? 'bg-amber-100 text-amber-900 border border-amber-200'
                                : 'bg-slate-100 text-slate-800'
                            }`}>
                              {p.stockQty} st.
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-center text-slate-500 whitespace-nowrap">
                          {p.vatRate ?? BELGIAN_RETAIL_VAT_RATE}%
                        </td>
                        <td className="py-3 px-3 text-center whitespace-nowrap">
                          {p.isActive === false ? (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500 uppercase">
                              Gearchiveerd
                            </span>
                          ) : (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 uppercase border border-emerald-200">
                              Actief
                            </span>
                          )}
                        </td>
                        <td className="sticky right-0 z-[1] border-l border-slate-100 bg-white py-3 pl-4 pr-5 text-right whitespace-nowrap shadow-[-8px_0_16px_-14px_rgba(15,23,42,0.45)] transition-colors group-hover:bg-slate-50">
                          <div className="flex items-center justify-end gap-2">
                            {p.familyId && ((familySizeById.get(p.familyId) ?? 0) > 1 || p.variantOptions) && (
                              <button
                                type="button"
                                onClick={() => openFamilyBuilder(p.familyId!)}
                                className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-2.5 text-[11px] font-extrabold text-sky-800 transition-colors hover:bg-sky-100"
                                title={`Beheer alle varianten van ${p.name}`}
                              >
                                <Boxes size={13} /> Familie
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => openEdit(p)}
                              className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] font-extrabold text-slate-700 shadow-sm transition-colors hover:border-sky-300 hover:bg-sky-50 hover:text-sky-800"
                              title={`Bewerk ${p.name}`}
                            >
                              <Pencil size={13} /> Bewerk
                            </button>
                            {p.isActive === false ? (
                              <button
                                type="button"
                                onClick={() => void restore(p.id)}
                                className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 text-[11px] font-extrabold text-emerald-800 transition-colors hover:bg-emerald-100"
                                title={`${p.name} herstellen`}
                              >
                                <RotateCcw size={13} /> Herstel
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDelete(p)}
                                className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-2.5 text-[11px] font-extrabold text-rose-700 transition-colors hover:bg-rose-100"
                                title={`${p.name} verwijderen uit de actieve lijst`}
                              >
                                <Trash2 size={13} /> Verwijder
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Edit / New Product Modal */}
      {editing && (
        <Modal
          open
          size="5xl"
          className="product-admin-modal"
          onClose={close}
          icon={<Package size={22} />}
          title={isNew ? 'Nieuw Product Toevoegen' : 'Product Bewerken'}
          subtitle={
            isNew
              ? 'Voeg een nieuw artikel toe aan uw winkelcatalogus en kassa'
              : `ID: ${editing.id} • ${editing.name || 'Naamloos product'}`
          }
          footer={
            <div className="flex items-center justify-between gap-4">
              <div className="text-xs text-slate-400 font-medium hidden sm:block">
                {isNew ? '* Productnaam, Categorie en Verkoopprijs zijn verplicht' : 'Alle gewijzigde gegevens worden direct gesynchroniseerd met de kassa'}
              </div>
              <div className="flex items-center gap-3 ml-auto">
                <button
                  type="button"
                  onClick={close}
                  className="px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all border border-slate-200 cursor-pointer"
                >
                  Annuleren
                </button>
                <button
                  type="button"
                  onClick={() => void save()}
                  className="flex items-center gap-2 rounded-xl border border-[#0e7490] bg-[#0e7490] px-6 py-2.5 text-xs font-black text-white shadow-sm transition hover:border-[#0f6677] hover:bg-[#0f6677] cursor-pointer"
                >
                  <CheckCircle2 size={16} />
                  <span>{isNew ? 'Product Aanmaken' : 'Product Opslaan'}</span>
                </button>
              </div>
            </div>
          }
        >
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 text-slate-900">
            {/* LEFT COLUMN: Main Details, Categorization, Pricing (8 Cols) */}
            <div className="lg:col-span-8 space-y-6">
              {editingBelongsToFamily && editing.familyId && (
                <div className="flex flex-col gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-sky-800 shadow-2xs"><Boxes size={17} /></span>
                    <div>
                      <p className="text-xs font-black text-slate-900">Dit artikel is onderdeel van een productfamilie</p>
                      <p className="mt-1 text-xs leading-5 text-slate-600">Naam, merk, categorie en variantopties wijzig je centraal, zodat alle varianten onderling consistent blijven. Prijzen, codes en minimumvoorraad kun je hier per artikel aanpassen.</p>
                    </div>
                  </div>
                  <button type="button" onClick={() => openFamilyBuilder(editing.familyId!)} className="shrink-0 rounded-xl border border-[#0e7490] bg-[#0e7490] px-4 py-2.5 text-xs font-black text-white shadow-sm transition hover:border-[#0f6677] hover:bg-[#0f6677]">Familie beheren</button>
                </div>
              )}
              {/* CARD 1: Product Identiteit & Categorisatie */}
              <div className="product-admin-section rounded-2xl p-5 space-y-4">
                <div className="product-admin-section-title flex items-center gap-2 text-xs font-black uppercase tracking-wider pb-2.5">
                  <Tag size={15} className="text-slate-500" />
                  <span>Basisinformatie & Categorisatie</span>
                </div>

                <Field label="Productnaam *">
                  <input
                    value={editing.name}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    disabled={editingBelongsToFamily}
                    placeholder="bv. Flat Shoe Laces Black"
                    className="w-full bg-white border border-slate-300 focus:border-slate-900 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-900 shadow-2xs focus:outline-none focus:ring-2 focus:ring-slate-900/10 placeholder:font-normal disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                  />
                </Field>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                  <Field label="Merk">
                    <input
                      value={editing.brand ?? ''}
                      onChange={(e) => setEditing({ ...editing, brand: e.target.value })}
                      disabled={editingBelongsToFamily}
                      placeholder="bv. Sidewalk Supply"
                      className="w-full bg-white border border-slate-300 focus:border-slate-900 rounded-xl px-3.5 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                    />
                  </Field>
                  <Field label="Leverancier">
                    <input
                      value={editing.supplier ?? ''}
                      onChange={(e) => setEditing({ ...editing, supplier: e.target.value })}
                      placeholder="bv. Footwear Distrib"
                      className="w-full bg-white border border-slate-300 focus:border-slate-900 rounded-xl px-3.5 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                    />
                  </Field>
                  <Field label="Leverancierscode">
                    <input
                      value={editing.supplierCode ?? ''}
                      onChange={(e) => setEditing({ ...editing, supplierCode: e.target.value })}
                      placeholder="bv. TEL-MOD-360"
                      className="w-full bg-white border border-slate-300 focus:border-slate-900 rounded-xl px-3.5 py-2 text-xs font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                    />
                  </Field>
                  <Field label="Variant / Maat">
                    <input
                      value={editing.variant ?? ''}
                      onChange={(e) => setEditing({ ...editing, variant: e.target.value })}
                      disabled={editingBelongsToFamily}
                      placeholder="bv. 120 cm / XL"
                      className="w-full bg-white border border-slate-300 focus:border-slate-900 rounded-xl px-3.5 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                    />
                  </Field>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <Field label="Categorie *">
                    <select
                      value={editing.category}
                      onChange={(e) => setEditing({ ...editing, category: e.target.value, subCategory: undefined })}
                      disabled={editingBelongsToFamily}
                      className="w-full bg-white border border-slate-300 focus:border-slate-900 rounded-xl px-3.5 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 cursor-pointer disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                    >
                      {rootCategories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.vatRate ?? BELGIAN_RETAIL_VAT_RATE}% BTW)
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Subcategorie">
                    <select
                      value={editing.subCategory ?? ''}
                      onChange={(e) => setEditing({ ...editing, subCategory: e.target.value })}
                      disabled={editingBelongsToFamily}
                      className="w-full bg-white border border-slate-300 focus:border-slate-900 rounded-xl px-3.5 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                    >
                      <option value="">Geen subcategorie</option>
                      {(subcategoriesByParent.get(editing.category) ?? []).map((subcategory) => (
                        <option key={subcategory.id} value={subcategory.name}>{subcategory.name}</option>
                      ))}
                      {editing.subCategory && !(subcategoriesByParent.get(editing.category) ?? []).some((subcategory) => subcategory.name === editing.subCategory) && (
                        <option value={editing.subCategory}>{editing.subCategory} (bestaande waarde)</option>
                      )}
                    </select>
                  </Field>
                </div>
              </div>

              {/* CARD 2: SKU & Barcodes */}
              <div className="product-admin-section rounded-2xl p-5 space-y-4">
                <div className="product-admin-section-title flex items-center gap-2 text-xs font-black uppercase tracking-wider pb-2.5">
                  <Barcode size={15} className="text-slate-500" />
                  <span>Identificatie & Barcodes</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <Field label="SKU Code (Interne Code)">
                    <input
                      value={editing.sku ?? ''}
                      onChange={(e) => setEditing({ ...editing, sku: e.target.value })}
                      placeholder="bv. SHO-SIDE-SUPP-120"
                      className="w-full bg-white border border-slate-300 focus:border-slate-900 rounded-xl px-3.5 py-2 text-xs font-mono font-bold text-slate-800 uppercase focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                    />
                  </Field>

                  <Field label="EAN Barcode">
                    <div className="flex gap-2">
                      <input
                        value={editing.barcode ?? ''}
                        onChange={(e) => setEditing({ ...editing, barcode: e.target.value })}
                        placeholder="bv. 5407001000046"
                        className="flex-1 min-w-0 bg-white border border-slate-300 focus:border-slate-900 rounded-xl px-3.5 py-2 text-xs font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setEditing({
                            ...editing,
                            barcode: generateInternalEAN13(editing.id || editing.name || 'item'),
                          })
                        }
                        className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-[#0e7490] bg-[#0e7490] px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:border-[#0f6677] hover:bg-[#0f6677] cursor-pointer"
                        title="Genereer een unieke interne EAN-13 barcode"
                      >
                        <Barcode size={13} />
                        <span>Genereer EAN</span>
                      </button>
                    </div>
                  </Field>
                </div>
              </div>

              {/* CARD 3: Financiën & Winstmarge */}
              <div className="product-admin-section rounded-2xl p-5 space-y-4">
                <div className="product-admin-section-title flex items-center justify-between pb-2.5">
                  <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider">
                    <TrendingUp size={15} className="text-slate-500" />
                    <span>Prijzen & Winstmarge</span>
                  </div>
                  <span className="text-[11px] font-bold text-slate-400">
                    Inclusief {categoryVatById.get(editing.category) ?? BELGIAN_RETAIL_VAT_RATE}% BTW
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                  <Field label="Aankoopprijs (excl. BTW)">
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">€</span>
                      <input
                        value={costText}
                        onChange={(e) => setCostText(e.target.value)}
                        placeholder="0,00"
                        className="w-full bg-white border border-slate-300 focus:border-slate-900 rounded-xl pl-7 pr-3.5 py-2 text-xs font-bold text-slate-900 tabular-nums focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                      />
                    </div>
                  </Field>

                  <Field label="Verkoopprijs (incl. BTW) *">
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">€</span>
                      <input
                        value={priceText}
                        onChange={(e) => setPriceText(e.target.value)}
                        placeholder="0,00"
                        className="w-full bg-white border border-slate-300 focus:border-slate-900 rounded-xl pl-7 pr-3.5 py-2 text-xs font-bold text-slate-900 tabular-nums focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                      />
                    </div>
                  </Field>

                  <Field label="Berekende Winstmarge">
                    {(() => {
                      const costCents = parseCents(costText);
                      const priceCents = parseCents(priceText);
                      const margin = marginPercent(priceCents, costCents);
                      const profitCents = priceCents - costCents;

                      const isGood = margin >= 30;
                      const isMedium = margin >= 10 && margin < 30;

                      const badgeBg = isGood
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : isMedium
                        ? 'bg-amber-50 border-amber-200 text-amber-900'
                        : 'bg-rose-50 border-rose-200 text-rose-800';

                      return (
                        <div className={`px-3.5 py-2 rounded-xl border flex flex-col justify-center ${badgeBg} h-[38px]`}>
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-black tabular-nums">
                              {margin.toFixed(1)}% Marge
                            </span>
                            <span className="text-[10px] font-extrabold opacity-80">
                              {profitCents >= 0 ? `+${formatEUR(profitCents)}` : formatEUR(profitCents)} / st.
                            </span>
                          </div>
                        </div>
                      );
                    })()}
                  </Field>
                </div>

                <div className="product-admin-tier-panel rounded-2xl p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-black text-violet-950">Klantprijzen</div>
                      <div className="mt-0.5 text-[10px] font-semibold text-violet-700">De prijsgroep van de gekoppelde klant kiest automatisch het juiste tarief aan de kassa.</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const current = editing.priceTiers ?? {};
                        let index = Object.keys(current).length + 1;
                        let group = `prijsgroep-${index}`;
                        while (group in current) group = `prijsgroep-${++index}`;
                        setEditing({ ...editing, priceTiers: { ...current, [group]: editing.priceCents } });
                      }}
                      className="shrink-0 rounded-xl bg-[#0e7490] px-3 py-2 text-[11px] font-black text-white hover:bg-[#0f6677]"
                    >
                      + Prijsgroep
                    </button>
                  </div>
                  {Object.entries(editing.priceTiers ?? {}).length === 0 ? (
                    <div className="product-admin-tier-empty mt-3 rounded-xl border border-dashed p-3 text-[11px]">Geen afwijkende klantprijzen. Iedereen betaalt de standaard verkoopprijs.</div>
                  ) : (
                    <div className="mt-3 space-y-2">
                      {Object.entries(editing.priceTiers ?? {}).map(([group, cents]) => (
                        <div key={group} className="grid grid-cols-[1fr_120px_32px] items-center gap-2">
                          <input
                            value={group}
                            onChange={(event) => {
                              const nextGroup = event.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
                              if (!nextGroup || nextGroup === group) return;
                              const next = { ...(editing.priceTiers ?? {}) };
                              delete next[group];
                              next[nextGroup] = cents;
                              setEditing({ ...editing, priceTiers: next });
                            }}
                            className="product-admin-tier-input rounded-xl border bg-white px-3 py-2 text-xs font-bold focus:outline-none"
                            aria-label="Naam prijsgroep"
                          />
                          <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">€</span><input
                            type="number"
                            min="0"
                            step="0.01"
                            value={(cents / 100).toFixed(2)}
                            onChange={(event) => setEditing({ ...editing, priceTiers: { ...(editing.priceTiers ?? {}), [group]: Math.max(0, Math.round(Number(event.target.value || 0) * 100)) } })}
                            className="product-admin-tier-input w-full rounded-xl border bg-white py-2 pl-7 pr-2 text-xs font-black focus:outline-none"
                            aria-label={`Prijs voor ${group}`}
                          /></div>
                          <button type="button" onClick={() => { const next = { ...(editing.priceTiers ?? {}) }; delete next[group]; setEditing({ ...editing, priceTiers: next }); }} className="flex h-8 w-8 items-center justify-center rounded-lg text-red-500 hover:bg-red-100" aria-label={`Verwijder ${group}`}><X size={14} /></button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN: Inventory & Kassa Tegel Live Preview (4 Cols) */}
            <div className="lg:col-span-4 space-y-6">
              {/* CARD 4: Voorraadbeheer */}
              <div className="product-admin-section rounded-2xl p-5 space-y-4">
                <div className="product-admin-section-title flex items-center gap-2 text-xs font-black uppercase tracking-wider pb-2.5">
                  <Boxes size={15} className="text-slate-500" />
                  <span>Voorraadbeheer</span>
                </div>

                <div className="space-y-3.5">
                  <Field label="Systeemvoorraad (Stuks)">
                    <div className="flex h-[38px] items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-xs font-bold text-slate-900 tabular-nums">
                      <span>{editing.stockQty == null ? 'Voorraad niet gevolgd' : `${editing.stockQty} stuks`}</span>
                      {editing.stockQty != null && <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Alleen via telling</span>}
                    </div>
                  </Field>

                  <Field label="Minimum Drempelvoorraad">
                    <input
                      inputMode="numeric"
                      value={editing.minStockQty ?? ''}
                      onChange={(e) => setEditing({ ...editing, minStockQty: parseWhole(e.target.value) })}
                      placeholder="bv. 5"
                      className="w-full bg-white border border-slate-300 focus:border-slate-900 rounded-xl px-3.5 py-2 text-xs font-bold text-slate-900 tabular-nums focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                    />
                  </Field>
                </div>

                {isNew ? (
                  <div className="rounded-xl border border-sky-100 bg-sky-50 p-3 text-[11px] font-semibold leading-5 text-sky-900">
                    Maak het product eerst aan. Leg de openingsvoorraad daarna vast via een fysieke telling, zodat de beginstand controleerbaar blijft.
                  </div>
                ) : editing.stockQty == null ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] font-semibold leading-5 text-slate-600">
                    Dit product is niet voorraad-getrackt. Er kan dus geen telling of voorraadcorrectie worden geboekt.
                  </div>
                ) : (
                  <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                    <div>
                      <div className="text-[11px] font-black uppercase tracking-wider text-slate-700">Fysieke telling / correctie</div>
                      <p className="mt-1 text-[11px] leading-4 text-slate-500">De getelde hoeveelheid vervangt de systeemvoorraad alleen na een reden, auditrecord en voorraadbeweging.</p>
                    </div>
                    <Field label="Geteld aantal">
                      <input
                        inputMode="numeric"
                        value={countedStockText}
                        onChange={(event) => setCountedStockText(event.target.value)}
                        placeholder="bv. 20"
                        className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-900 tabular-nums focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                      />
                    </Field>
                    <Field label="Reden">
                      <select
                        value={adjustmentReason}
                        onChange={(event) => setAdjustmentReason(event.target.value as InventoryAdjustmentReason)}
                        className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                      >
                        <option value="cycle-count">Fysieke telling</option>
                        <option value="opening-balance">Openingsvoorraad</option>
                        <option value="damage">Schade</option>
                        <option value="loss">Verlies / derving</option>
                        <option value="found">Teruggevonden voorraad</option>
                        <option value="other">Andere reden</option>
                      </select>
                    </Field>
                    <Field label={adjustmentReason === 'other' ? 'Toelichting *' : 'Toelichting (optioneel)'}>
                      <textarea
                        value={adjustmentNote}
                        onChange={(event) => setAdjustmentNote(event.target.value)}
                        rows={2}
                        placeholder="bv. Telling na levering of schadecontrole"
                        className="w-full resize-y rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                      />
                    </Field>
                    {adjustmentFeedback && (
                      <p className={`rounded-lg px-3 py-2 text-[11px] font-semibold ${adjustmentFeedback.startsWith('Telling vastgelegd') ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-700'}`}>
                        {adjustmentFeedback}
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={() => void saveInventoryCount()}
                      disabled={savingAdjustment}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[#0e7490] bg-[#0e7490] px-3.5 py-2.5 text-xs font-black text-white shadow-sm transition hover:border-[#0f6677] hover:bg-[#0f6677] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Boxes size={15} />
                      {savingAdjustment ? 'Telling vastleggen…' : 'Leg telling vast'}
                    </button>
                  </div>
                )}

                {/* Dynamic Stock Status Chip */}
                {editing.stockQty != null && (
                  <div className="pt-1">
                    {editing.minStockQty != null && editing.stockQty <= editing.minStockQty ? (
                      <div className="flex items-center gap-2 p-2.5 rounded-xl bg-amber-100/70 border border-amber-200 text-amber-900 text-[11px] font-bold">
                        <AlertTriangle size={14} className="text-amber-600 shrink-0" />
                        <span>Lage voorraad waarschuwing!</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-bold">
                        <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
                        <span>Voorraad op peil ({editing.stockQty} st.)</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* CARD 5: Kassa Tegel & Live Preview */}
              <div className="product-admin-section rounded-2xl p-5 space-y-4">
                <div className="product-admin-section-title flex items-center gap-2 text-xs font-black uppercase tracking-wider pb-2.5">
                  <Palette size={15} className="text-slate-500" />
                  <span>Kassa Tegel & Weergave</span>
                </div>

                <div>
                  <span className="block text-[11px] font-bold text-slate-700 mb-2 uppercase tracking-wider">
                    Selecteer Tegelkleur
                  </span>
                  <div className="grid grid-cols-5 gap-2">
                    {COLOR_PRESETS.map((c) => {
                      const isSelected = editing.color === c.cls;
                      return (
                        <button
                          key={c.cls}
                          type="button"
                          onClick={() => setEditing({ ...editing, color: c.cls })}
                          className={`h-9 rounded-xl ${c.cls} border-2 flex items-center justify-center transition-all cursor-pointer ${
                            isSelected
                              ? 'border-slate-900 shadow-md scale-105 ring-2 ring-slate-900/20'
                              : 'border-transparent hover:scale-98 opacity-90 hover:opacity-100'
                          }`}
                          title={c.label}
                        >
                          {isSelected && <Check size={14} className="text-white drop-shadow-xs" />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* POS Tile Live Preview */}
                <div className="pt-2">
                  <span className="block text-[11px] font-bold text-slate-700 mb-2 uppercase tracking-wider">
                    Live Kassa-Voorbeeld
                  </span>
                  <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800">
                    <div
                      className={`p-4 rounded-xl shadow-md ${editing.color || 'bg-slate-800'} text-white transition-all`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-[10px] uppercase tracking-wider font-extrabold opacity-80 truncate">
                          {editing.brand || 'MERK'}
                        </span>
                        <span className="text-xs font-black bg-black/30 px-2 py-0.5 rounded-md backdrop-blur-xs">
                          {formatEUR(parseCents(priceText))}
                        </span>
                      </div>
                      <div className="font-black text-sm mt-3 line-clamp-2 leading-tight">
                        {editing.name || 'Productnaam'}
                      </div>
                      {editing.variant && (
                        <div className="text-[10px] opacity-75 mt-1 font-medium">
                          {editing.variant}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* Delete / Archive Confirmation Modal */}
      {confirmDelete && (
        <Modal
          open
          onClose={() => setConfirmDelete(null)}
          title="Product verwijderen uit lijst"
          footer={
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold border border-slate-200"
              >
                Annuleren
              </button>
              <button
                onClick={async () => {
                  await remove(confirmDelete.id);
                  setConfirmDelete(null);
                }}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center gap-2"
              >
                <Trash2 size={15} />
                <span>Verwijder uit lijst</span>
              </button>
            </div>
          }
        >
          <p className="text-xs text-slate-600 font-medium">
            Weet u zeker dat u <strong>{confirmDelete.name}</strong> wilt verwijderen uit de actieve lijst? Het verdwijnt meteen uit de kassa en dit overzicht, maar blijft veilig bewaard in de historiek. U kunt het later terugzetten via <strong>Gearchiveerd</strong>.
          </p>
        </Modal>
      )}
    </div>
  );
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="block">
    <span className="block text-[11px] font-bold text-slate-700 mb-1 uppercase tracking-wider">{label}</span>
    {children}
  </label>
);

const Kpi: React.FC<{ label: string; value: string; tone?: 'emerald' | 'amber' }> = ({ label, value, tone }) => (
  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
    <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</div>
    <div className={`mt-1 text-xl font-black tabular-nums ${
      tone === 'amber' ? 'text-amber-800' : tone === 'emerald' ? 'text-emerald-700' : 'text-slate-900'
    }`}>
      {value}
    </div>
  </div>
);
