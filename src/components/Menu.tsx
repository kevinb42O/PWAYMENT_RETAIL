import React, { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store/useStore';
import { useProducts } from '../store/useProducts';
import { formatEUR } from '../utils/money';
import { useCategories } from '../store/useCategories';
import { matchesCatalogQuery, normalizeCatalogQuery } from '../utils/productLookup';

const stockLabel = (stockQty?: number): string => {
  if (stockQty == null) return 'Geen voorraadtracking';
  if (stockQty === 0) return 'Uitverkocht';
  return `${stockQty} op voorraad`;
};

const categoryBadgeTone = (subCategory?: string): string => {
  const normalized = subCategory?.toLocaleLowerCase('nl-BE') ?? '';
  if (normalized.includes('cadeaubon')) return 'pos-badge-gift';
  if (normalized.includes('advies')) return 'pos-badge-advice';
  return 'pos-badge-default';
};

interface MenuProps {
  query: string;
  onQueryChange: (value: string) => void;
}

export const Menu: React.FC<MenuProps> = ({ query, onQueryChange }) => {
  const addOrderItem = useStore((s) => s.addOrderItem);
  const findByScanCode = useProducts((s) => s.findByScanCode);
  const products = useProducts((s) => s.list);
  const hydrateProducts = useProducts((s) => s.hydrate);
  const categories = useCategories((s) => s.list);
  const hydrateCategories = useCategories((s) => s.hydrate);

  const [activeCategory, setActiveCategory] = useState<string | 'all'>('all');
  const [activeSubCategory, setActiveSubCategory] = useState<string | 'all'>('all');
  const [activeBrand, setActiveBrand] = useState<string | 'all'>('all');

  useEffect(() => {
    void hydrateProducts();
    void hydrateCategories();
  }, [hydrateProducts, hydrateCategories]);

  const activeProducts = useMemo(
    () => products.filter((product) => product.isActive !== false),
    [products],
  );

  const categoryItems = useMemo(() => {
    if (categories.length > 0) {
      return categories
        .filter((category) => category.isActive !== false)
        .map((category) => ({
          id: category.id,
          name: category.name,
          count: activeProducts.filter((product) => product.category === category.id).length,
        }))
        .filter((category) => category.count > 0);
    }

    const fallback = Array.from(new Set(activeProducts.map((product) => product.category).filter(Boolean))).sort();
    return fallback.map((name) => ({
      id: name,
      name,
      count: activeProducts.filter((product) => product.category === name).length,
    }));
  }, [activeProducts, categories]);

  const categoryProducts = useMemo(
    () => activeProducts.filter((product) => activeCategory === 'all' || product.category === activeCategory),
    [activeCategory, activeProducts],
  );

  const subCategoryItems = useMemo(() => {
    const names = Array.from(new Set(categoryProducts.map((product) => product.subCategory ?? 'Overig'))).sort();
    return names.map((name) => ({
      id: name,
      name,
      count: categoryProducts.filter((product) => (product.subCategory ?? 'Overig') === name).length,
    }));
  }, [categoryProducts]);

  const subCategoryProducts = useMemo(
    () => categoryProducts.filter((product) => activeSubCategory === 'all' || (product.subCategory ?? 'Overig') === activeSubCategory),
    [activeSubCategory, categoryProducts],
  );

  const brandItems = useMemo(() => {
    const names = Array.from(new Set(subCategoryProducts.map((product) => product.brand ?? 'Zonder merk'))).sort();
    return names.map((name) => ({
      id: name,
      name,
      count: subCategoryProducts.filter((product) => (product.brand ?? 'Zonder merk') === name).length,
    }));
  }, [subCategoryProducts]);

  useEffect(() => {
    if (activeCategory !== 'all' && !categoryItems.some((category) => category.id === activeCategory)) {
      setActiveCategory('all');
      setActiveSubCategory('all');
      setActiveBrand('all');
    }
  }, [activeCategory, categoryItems]);

  useEffect(() => {
    if (activeSubCategory !== 'all' && !subCategoryItems.some((subCategory) => subCategory.id === activeSubCategory)) {
      setActiveSubCategory('all');
      setActiveBrand('all');
    }
  }, [activeSubCategory, subCategoryItems]);

  useEffect(() => {
    if (activeBrand !== 'all' && !brandItems.some((brand) => brand.id === activeBrand)) {
      setActiveBrand('all');
    }
  }, [activeBrand, brandItems]);

  const term = normalizeCatalogQuery(query);
  const exactCodeMatch = term ? findByScanCode(query) : null;
  const filteredProducts = useMemo(() => {
    const base = term
      ? activeProducts.filter((product) => matchesCatalogQuery(product, term))
      : subCategoryProducts.filter((product) => activeBrand === 'all' || (product.brand ?? 'Zonder merk') === activeBrand);

    return [...base].sort((a, b) => {
      const subCategoryCompare = (a.subCategory ?? '').localeCompare(b.subCategory ?? '');
      if (subCategoryCompare !== 0) return subCategoryCompare;
      const brandCompare = (a.brand ?? '').localeCompare(b.brand ?? '');
      if (brandCompare !== 0) return brandCompare;
      return a.name.localeCompare(b.name) || (a.variant ?? '').localeCompare(b.variant ?? '');
    });
  }, [activeBrand, activeProducts, subCategoryProducts, term]);

  const activeCategoryName =
    activeCategory === 'all'
      ? 'Alle hoofdcategorieen'
      : categoryItems.find((category) => category.id === activeCategory)?.name ?? 'Alle hoofdcategorieen';
  const activeSubCategoryName = activeSubCategory === 'all' ? 'Alle subcategorieen' : activeSubCategory;
  const resultLabel = filteredProducts.length === 1 ? '1 product' : `${filteredProducts.length} producten`;

  const showSubCategory = activeCategory !== 'all';

  return (
    <div className={`pos-catalog grid h-full grid-cols-1 overflow-hidden bg-zinc-950 text-white ${showSubCategory ? 'lg:grid-cols-[200px_220px_minmax(0,1fr)]' : 'lg:grid-cols-[200px_minmax(0,1fr)]'}`}>
      <div className="overflow-y-auto border-b border-zinc-800 bg-zinc-900 lg:border-b-0 lg:border-r">
        <div className="sticky top-0 z-10 border-b border-zinc-800 bg-zinc-950 px-4 py-3">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Hoofdcategorie</div>
        </div>

        <div className="flex gap-2 overflow-x-auto p-2 lg:block lg:overflow-visible lg:p-0">
          <button
            onClick={() => {
              setActiveCategory('all');
              setActiveSubCategory('all');
              setActiveBrand('all');
              onQueryChange('');
            }}
            className={`min-w-[150px] border-l-4 px-4 py-4 text-left text-sm font-bold transition-colors lg:w-full lg:min-w-0 ${
              activeCategory === 'all' && !term
                ? 'pos-category-active bg-zinc-800 text-white'
                : 'border-l-transparent text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
            }`}
          >
            <span className="block">Alles</span>
            <span className="mt-1 block text-xs font-medium text-zinc-500">{activeProducts.length} producten</span>
          </button>

          {categoryItems.map((category) => (
            <button
              key={category.id}
              onClick={() => {
                setActiveCategory(category.id);
                setActiveSubCategory('all');
                setActiveBrand('all');
                onQueryChange('');
              }}
              className={`min-w-[170px] border-l-4 px-4 py-4 text-left text-sm font-bold transition-colors lg:w-full lg:min-w-0 ${
                activeCategory === category.id && !term
                  ? 'pos-category-active bg-zinc-800 text-white'
                  : 'border-l-transparent text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
              }`}
            >
              <span className="block leading-tight">{category.name}</span>
              <span className="mt-1 block text-xs font-medium text-zinc-500">{category.count} producten</span>
            </button>
          ))}
        </div>
      </div>

      {showSubCategory && (
        <div className="overflow-y-auto border-b border-zinc-800 bg-zinc-950 lg:border-b-0 lg:border-r">
          <div className="sticky top-0 z-10 border-b border-zinc-800 bg-zinc-950 px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Subcategorie</div>
            <div className="mt-1 truncate text-sm font-semibold text-zinc-200">{activeCategoryName}</div>
          </div>

          <div className="flex gap-2 overflow-x-auto p-2 lg:block lg:overflow-visible lg:p-0">
            <button
              onClick={() => {
                setActiveSubCategory('all');
                setActiveBrand('all');
                onQueryChange('');
              }}
              className={`min-w-[170px] border-l-4 px-4 py-3 text-left text-sm font-semibold transition-colors lg:w-full lg:min-w-0 ${
                  activeSubCategory === 'all' && !term
                  ? 'pos-category-active bg-zinc-900 text-white'
                  : 'border-l-transparent text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
              }`}
            >
              <span className="block">Alle subcategorieen</span>
              <span className="mt-1 block text-xs text-zinc-500">{categoryProducts.length} producten</span>
            </button>

            {subCategoryItems.map((subCategory) => (
              <button
                key={subCategory.id}
                onClick={() => {
                  setActiveSubCategory(subCategory.id);
                  setActiveBrand('all');
                  onQueryChange('');
                }}
                className={`min-w-[180px] border-l-4 px-4 py-3 text-left text-sm font-semibold transition-colors lg:w-full lg:min-w-0 ${
                  activeSubCategory === subCategory.id && !term
                    ? 'pos-category-active bg-zinc-900 text-white'
                    : 'border-l-transparent text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
                }`}
              >
                <span className="block leading-tight">{subCategory.name}</span>
                <span className="mt-1 block text-xs text-zinc-500">{subCategory.count} producten</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-col overflow-hidden bg-zinc-950">
        <div className="border-b border-zinc-800 bg-zinc-900/40 p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-white">{term ? 'Zoekresultaten' : `${activeCategoryName} / ${activeSubCategoryName}`}</div>
              <div className="mt-1 text-xs text-zinc-500">
                {term
                  ? exactCodeMatch
                    ? `${resultLabel}. Exacte ${exactCodeMatch.matchedOn === 'barcode' ? 'barcode' : 'SKU'}-match voor ${exactCodeMatch.product.name}. Enter in de scanbalk voegt direct toe.`
                    : `${resultLabel}. Zoek op barcode, SKU, product, merk, subcategorie of maat.`
                  : `${resultLabel}. Filter verder op merk of tik meteen een product aan.`}
              </div>
            </div>

            {term && (
              <button
                onClick={() => onQueryChange('')}
                className="self-start rounded-lg bg-zinc-800 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-700"
              >
                Wis filter
              </button>
            )}
          </div>

          {!term && brandItems.length > 1 && (
            <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
              <button
                onClick={() => setActiveBrand('all')}
                className={`whitespace-nowrap rounded-lg border px-3 py-2 text-xs font-semibold ${
                  activeBrand === 'all'
                    ? 'pos-filter-active'
                    : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:bg-zinc-800 hover:text-white'
                }`}
              >
                Alle merken ({subCategoryProducts.length})
              </button>
              {brandItems.map((brand) => (
                <button
                  key={brand.id}
                  onClick={() => setActiveBrand(brand.id)}
                  className={`whitespace-nowrap rounded-lg border px-3 py-2 text-xs font-semibold ${
                    activeBrand === brand.id
                      ? 'pos-filter-active'
                      : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:bg-zinc-800 hover:text-white'
                  }`}
                >
                  {brand.name} ({brand.count})
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto bg-zinc-950 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {filteredProducts.map((product) => {
              const outOfStock = product.stockQty != null && product.stockQty <= 0;
              const lowStock = product.stockQty != null && product.minStockQty != null && product.stockQty > 0 && product.stockQty <= product.minStockQty;

              return (
                <button
                  key={product.id}
                  onClick={() => addOrderItem(product)}
                  disabled={outOfStock}
                  className={`pos-product-tile relative flex min-h-[144px] flex-col justify-between rounded-xl border p-4 text-left shadow-sm transition-all ${
                    outOfStock ? 'cursor-not-allowed opacity-50' : 'pos-product-tile--interactive hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:scale-[0.99]'
                  }`}
                >
                  <div className="space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <span className={`rounded-md border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${categoryBadgeTone(product.subCategory)}`}>
                        {product.subCategory ?? product.category}
                      </span>
                      {(outOfStock || lowStock) && (
                        <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${outOfStock ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>
                          {outOfStock ? 'Uitverkocht' : 'Lage stock'}
                        </span>
                      )}
                    </div>
                    <span className="block text-sm font-semibold leading-snug text-zinc-900">{product.name}</span>
                    <span className="block text-xs text-zinc-500">{[product.brand, product.variant].filter(Boolean).join(' · ')}</span>
                  </div>

                  <div className="mt-4 flex items-end justify-between gap-3">
                    <span className="text-lg font-bold tracking-tight text-zinc-950">{formatEUR(product.priceCents)}</span>
                    <span className="text-right text-[11px] font-medium text-zinc-400">{stockLabel(product.stockQty)}</span>
                  </div>
                </button>
              );
            })}
            {filteredProducts.length === 0 && (
              <div className="col-span-full py-12 text-center text-zinc-500">
                {term
                  ? 'Geen product gevonden. Controleer barcode, SKU, merk, subcategorie of maat.'
                  : 'Geen producten in deze selectie.'}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
