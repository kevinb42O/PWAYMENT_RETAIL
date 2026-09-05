import React, { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../store/useStore";
import { useProducts } from "../store/useProducts";
import { formatEUR } from "../utils/money";
import { useCategories } from "../store/useCategories";
import {
  matchesCatalogQuery,
  normalizeCatalogQuery,
} from "../utils/productLookup";
import { Grid2X2, Layers3, FileSpreadsheet, List, Check, PackageCheck } from "lucide-react";
import { isGiftCardProduct } from "../utils/financial";
import { resolveProductCategoryPath } from "../catalog/categoryTaxonomy";
import { categoryIcon } from "../catalog/categoryIcons";

const stockLabel = (stockQty?: number): string => {
  if (stockQty == null) return "Geen voorraadtracking";
  if (stockQty === 0) return "Uitverkocht";
  return `${stockQty} op voorraad`;
};

interface MenuProps {
  query: string;
  onQueryChange: (value: string) => void;
  onStartStoreSetup?: () => void;
  onImportProducts?: () => void;
  onAddCategory?: () => void;
  onProductSelected?: (feedback: {
    productName: string;
    priceCents: number;
    sourceRect: { left: number; top: number; width: number; height: number };
  }) => void;
}

export const Menu: React.FC<MenuProps> = ({
  query,
  onQueryChange,
  onStartStoreSetup,
  onImportProducts,
  onAddCategory,
  onProductSelected,
}) => {
  const addOrderItem = useStore((s) => s.addOrderItem);
  const cart = useStore((s) => s.cart);
  const findByScanCode = useProducts((s) => s.findByScanCode);
  const products = useProducts((s) => s.list);
  const hydrateProducts = useProducts((s) => s.hydrate);
  const categories = useCategories((s) => s.list);
  const hydrateCategories = useCategories((s) => s.hydrate);

  const [activeCategory, setActiveCategory] = useState<string | "all">("all");
  const [activeSubCategory, setActiveSubCategory] = useState<string | "all">(
    "all",
  );
  const [activeBrand, setActiveBrand] = useState<string | "all">("all");
  const [visibleProductCount, setVisibleProductCount] = useState(40);
  const [catalogView, setCatalogView] = useState<"grid" | "list">(() => {
    try { return localStorage.getItem("pwayment:catalog-view") === "list" ? "list" : "grid"; }
    catch { return "grid"; }
  });
  const [inStockOnly, setInStockOnly] = useState(false);
  const productGridRef = useRef<HTMLDivElement>(null);
  const cartQuantities = useMemo(() => {
    const quantities = new Map<string, number>();
    for (const item of cart.orders) quantities.set(item.product.id, (quantities.get(item.product.id) ?? 0) + item.quantity);
    return quantities;
  }, [cart]);
  useEffect(() => {
    try { localStorage.setItem("pwayment:catalog-view", catalogView); } catch { /* Optional view preference. */ }
  }, [catalogView]);
  const [recentlyAdded, setRecentlyAdded] = useState<{ productId: string; nonce: number } | null>(null);
  const addedFeedbackTimerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (addedFeedbackTimerRef.current != null) window.clearTimeout(addedFeedbackTimerRef.current);
  }, []);

  useEffect(() => {
    void hydrateProducts();
    void hydrateCategories();
  }, [hydrateProducts, hydrateCategories]);

  const activeProducts = useMemo(
    () =>
      products.filter(
        (product) => product.isActive !== false && !isGiftCardProduct(product),
      ),
    [products],
  );

  const categoryItems = useMemo(() => {
    if (categories.length > 0) {
      return categories
        .filter((category) => category.isActive !== false && !category.parentId)
        .map((category) => ({
          id: category.id,
          name: category.name,
          icon: category.icon,
          count: activeProducts.filter(
            (product) => resolveProductCategoryPath(product, categories)?.root.id === category.id,
          ).length,
        }))
        .filter((category) => category.count > 0);
    }

    const fallback = Array.from(
      new Set(
        activeProducts.map((product) => product.category).filter(Boolean),
      ),
    ).sort();
    return fallback.map((name) => ({
      id: name,
      name,
      icon: undefined,
      count: activeProducts.filter((product) => product.category === name)
        .length,
    }));
  }, [activeProducts, categories]);

  const categoryProducts = useMemo(
    () =>
      activeProducts.filter(
        (product) =>
          activeCategory === "all"
          || resolveProductCategoryPath(product, categories)?.root.id === activeCategory,
      ),
    [activeCategory, activeProducts, categories],
  );

  const subCategoryItems = useMemo(() => {
    const names = Array.from(
      new Set(
        categoryProducts.map((product) =>
          resolveProductCategoryPath(product, categories)?.leaf?.name
          ?? product.subCategory
          ?? "Overig"
        ),
      ),
    ).sort();
    return names.map((name) => ({
      id: name,
      name,
      count: categoryProducts.filter(
        (product) => (
          resolveProductCategoryPath(product, categories)?.leaf?.name
          ?? product.subCategory
          ?? "Overig"
        ) === name,
      ).length,
    }));
  }, [categories, categoryProducts]);

  const subCategoryProducts = useMemo(
    () =>
      categoryProducts.filter(
        (product) =>
          activeSubCategory === "all" ||
          (
            resolveProductCategoryPath(product, categories)?.leaf?.name
            ?? product.subCategory
            ?? "Overig"
          ) === activeSubCategory,
      ),
    [activeSubCategory, categories, categoryProducts],
  );

  const brandItems = useMemo(() => {
    const names = Array.from(
      new Set(
        subCategoryProducts.map((product) => product.brand ?? "Zonder merk"),
      ),
    ).sort();
    return names.map((name) => ({
      id: name,
      name,
      count: subCategoryProducts.filter(
        (product) => (product.brand ?? "Zonder merk") === name,
      ).length,
    }));
  }, [subCategoryProducts]);

  useEffect(() => {
    if (
      activeCategory !== "all" &&
      !categoryItems.some((category) => category.id === activeCategory)
    ) {
      setActiveCategory("all");
      setActiveSubCategory("all");
      setActiveBrand("all");
    }
  }, [activeCategory, categoryItems]);

  useEffect(() => {
    if (
      activeSubCategory !== "all" &&
      !subCategoryItems.some(
        (subCategory) => subCategory.id === activeSubCategory,
      )
    ) {
      setActiveSubCategory("all");
      setActiveBrand("all");
    }
  }, [activeSubCategory, subCategoryItems]);

  useEffect(() => {
    if (
      activeBrand !== "all" &&
      !brandItems.some((brand) => brand.id === activeBrand)
    ) {
      setActiveBrand("all");
    }
  }, [activeBrand, brandItems]);

  const term = normalizeCatalogQuery(query);
  const exactCodeMatch = term ? findByScanCode(query) : null;
  const filteredProducts = useMemo(() => {
    const base = term
      ? activeProducts.filter((product) => {
          if (matchesCatalogQuery(product, term)) return true;
          const path = resolveProductCategoryPath(product, categories);
          return [path?.root.name, path?.leaf?.name]
            .filter(Boolean)
            .some((label) => normalizeCatalogQuery(label ?? "").includes(term));
        })
      : subCategoryProducts.filter(
          (product) =>
            activeBrand === "all" ||
            (product.brand ?? "Zonder merk") === activeBrand,
        );

    return base.filter((product) => !inStockOnly || product.stockQty == null || product.stockQty > 0).sort((a, b) => {
      const subCategoryCompare = (a.subCategory ?? "").localeCompare(
        b.subCategory ?? "",
      );
      if (subCategoryCompare !== 0) return subCategoryCompare;
      const brandCompare = (a.brand ?? "").localeCompare(b.brand ?? "");
      if (brandCompare !== 0) return brandCompare;
      return (
        a.name.localeCompare(b.name) ||
        (a.variant ?? "").localeCompare(b.variant ?? "")
      );
    });
  }, [activeBrand, activeProducts, categories, subCategoryProducts, term, inStockOnly]);

  useEffect(() => {
    setVisibleProductCount(40);
    productGridRef.current?.scrollTo({ top: 0 });
  }, [activeBrand, activeCategory, activeSubCategory, term, inStockOnly]);

  const visibleProducts = filteredProducts.slice(0, visibleProductCount);

  const activeCategoryName =
    activeCategory === "all"
      ? "Alle hoofdcategorieën"
      : (categoryItems.find((category) => category.id === activeCategory)
          ?.name ?? "Alle hoofdcategorieën");
  const activeSubCategoryName =
    activeSubCategory === "all" ? "Alle subcategorieën" : activeSubCategory;
  const showSubCategory = activeCategory !== "all";

  return (
    <div
      className="pos-catalog pos-catalog-refined grid h-full grid-cols-1 overflow-hidden lg:grid-cols-[190px_minmax(0,1fr)]"
    >
      {/* Hoofdcategorieën kolom */}
      <div className="pos-category-rail overflow-y-auto border-b border-slate-200 lg:border-b-0 lg:border-r">
        <div className="pos-rail-heading sticky top-0 z-10 border-b border-slate-200/70 px-4 py-3.5 backdrop-blur-md">
          <div className="pos-rail-label flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-wider">
            <Grid2X2 size={13} /> Collecties
          </div>
        </div>

        <div className="flex gap-1.5 overflow-x-auto p-2 lg:block lg:overflow-visible lg:p-0">
          <button
            aria-pressed={activeCategory === "all" && !term}
            onClick={() => {
              setActiveCategory("all");
              setActiveSubCategory("all");
              setActiveBrand("all");
              onQueryChange("");
            }}
            className={`pos-rail-item min-w-[150px] border-l-4 px-4 py-3.5 text-left transition-all lg:w-full lg:min-w-0 ${
              activeCategory === "all" && !term
                ? "pos-rail-active border-l-sky-600 font-bold"
                : "border-l-transparent hover:bg-white/60 font-medium"
            }`}
          >
            <span className="flex items-center gap-3">
              <Grid2X2 size={21} strokeWidth={2} className={`pos-rail-icon ${activeCategory === "all" && !term ? "pos-rail-icon--active" : ""}`} />
              <span>
                <span className="block text-sm">Alles</span>
                <span className={`pos-rail-count mt-0.5 block text-xs ${activeCategory === "all" && !term ? "pos-rail-count--active font-semibold" : ""}`}>{activeProducts.length} producten</span>
              </span>
            </span>
          </button>

          {categoryItems.map((category) => {
            const isActive = activeCategory === category.id && !term;
            const CategoryIcon = categoryIcon(category.icon);
            return (
              <button
                key={category.id}
                aria-pressed={isActive}
                onClick={() => {
                  setActiveCategory(category.id);
                  setActiveSubCategory("all");
                  setActiveBrand("all");
                  onQueryChange("");
                }}
                className={`pos-rail-item min-w-[170px] border-l-4 px-4 py-3.5 text-left transition-all lg:w-full lg:min-w-0 ${
                  isActive
                    ? "pos-rail-active border-l-sky-600 font-bold"
                    : "border-l-transparent hover:bg-white/60 font-medium"
                }`}
              >
                <span className="flex items-center gap-3">
                  <CategoryIcon size={21} strokeWidth={2} className={`pos-rail-icon ${isActive ? "pos-rail-icon--active" : ""}`} />
                  <span className="min-w-0">
                    <span className="block text-sm leading-tight">{category.name}</span>
                    <span className={`pos-rail-count mt-0.5 block text-xs ${isActive ? "pos-rail-count--active font-semibold" : ""}`}>{category.count} producten</span>
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Producten raster area */}
      <div className="pos-product-stage flex min-w-0 flex-col overflow-hidden">
        <div className="pos-catalog-toolbar border-b border-slate-200/80 p-4">
          <div className="pos-catalog-title-row flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="pos-catalog-heading">
                {term
                  ? "Zoekresultaten"
                  : activeCategory === "all" ? "Alle producten" : activeSubCategory === "all" ? activeCategoryName : activeSubCategoryName}
                <span className="pos-result-count">{filteredProducts.length}</span>
              </h1>
            </div>
            <div className="pos-catalog-view-switch" role="group" aria-label="Productweergave">
              <button type="button" aria-label="Rasterweergave" aria-pressed={catalogView === "grid"} onClick={() => setCatalogView("grid")} title="Rasterweergave"><Grid2X2 size={17} /></button>
              <button type="button" aria-label="Lijstweergave" aria-pressed={catalogView === "list"} onClick={() => setCatalogView("list")} title="Lijstweergave"><List size={18} /></button>
            </div>
            {term && (
              <button
                onClick={() => onQueryChange("")}
                className="pos-filter-reset self-start rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors"
              >
                Wis filter
              </button>
            )}
          </div>

          {term && exactCodeMatch && (
            <p className="pos-catalog-summary" role="status">
              Exacte {exactCodeMatch.matchedOn === "barcode" ? "barcode" : exactCodeMatch.matchedOn === "identifier" ? "productidentificatie" : "SKU"}-match: {exactCodeMatch.product.name}.
            </p>
          )}
          {showSubCategory && !term && (
            <div className="pos-subcategory-strip" role="group" aria-label="Subcategorieën">
              <button type="button" aria-pressed={activeSubCategory === "all"} onClick={() => { setActiveSubCategory("all"); setActiveBrand("all"); }}>
                Alle subcategorieën <span>{categoryProducts.length}</span>
              </button>
              {subCategoryItems.map((subCategory) => (
                <button type="button" key={subCategory.id} aria-pressed={activeSubCategory === subCategory.id} onClick={() => { setActiveSubCategory(subCategory.id); setActiveBrand("all"); }}>
                  {subCategory.name} <span>{subCategory.count}</span>
                </button>
              ))}
            </div>
          )}
          <div className="pos-catalog-filter-row">
            <button type="button" className="pos-stock-filter" title="Verberg uitverkochte artikelen. Producten zonder voorraadtracking blijven zichtbaar." aria-pressed={inStockOnly} onClick={() => setInStockOnly((value) => !value)}>
              <PackageCheck size={15} /> Op voorraad {inStockOnly && <Check size={13} />}
            </button>
          {!term && brandItems.length > 1 && (
            <div className="pos-brand-strip flex gap-2 overflow-x-auto" role="group" aria-label="Merken">
              <button
                aria-pressed={activeBrand === "all"}
                onClick={() => setActiveBrand("all")}
                className={`whitespace-nowrap rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all ${
                  activeBrand === "all"
                  ? "pos-filter-active"
                  : "pos-filter-button"
                }`}
              >
                Alle merken ({subCategoryProducts.length})
              </button>
              {brandItems.map((brand) => (
                <button
                  key={brand.id}
                  aria-pressed={activeBrand === brand.id}
                  onClick={() => setActiveBrand(brand.id)}
                  className={`whitespace-nowrap rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all ${
                    activeBrand === brand.id
                    ? "pos-filter-active"
                    : "pos-filter-button"
                  }`}
                >
                  {brand.name} ({brand.count})
                </button>
              ))}
            </div>
          )}
          </div>
        </div>

        {/* Product grid */}
        <div ref={productGridRef} className="pos-product-grid flex-1 overflow-y-auto p-4 lg:p-5">
          <div className={`pos-product-grid-layout grid gap-3 ${catalogView === "list" ? "pos-product-grid-layout--list" : ""}`}>
            {visibleProducts.map((product) => {
              const categoryPath = resolveProductCategoryPath(product, categories);
              const quantityInCart = cartQuantities.get(product.id) ?? 0;
              const outOfStock =
                product.stockQty != null && product.stockQty <= 0;
              const lowStock =
                product.stockQty != null &&
                product.minStockQty != null &&
                product.stockQty > 0 &&
                product.stockQty <= product.minStockQty;

              return (
                <button
                  key={product.id}
                  style={{ viewTransitionName: `pos-product-${String(product.id).replace(/[^a-zA-Z0-9_-]/g, "-")}` }}
                  onClick={(event) => {
                    const rect = event.currentTarget.getBoundingClientRect();
                    addOrderItem(product);
                    setRecentlyAdded({ productId: product.id, nonce: Date.now() });
                    if (addedFeedbackTimerRef.current != null) window.clearTimeout(addedFeedbackTimerRef.current);
                    addedFeedbackTimerRef.current = window.setTimeout(() => setRecentlyAdded(null), 520);
                    onProductSelected?.({
                      productName: product.name,
                      priceCents: product.priceCents,
                      sourceRect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
                    });
                  }}
                  disabled={outOfStock}
                  data-in-cart={quantityInCart > 0 || undefined}
                  className={`pos-product-card relative flex min-h-[146px] flex-col justify-between overflow-hidden rounded-xl border p-4 text-left transition-colors ${
                    outOfStock
                      ? "cursor-not-allowed opacity-50 bg-slate-50"
                      : "hover:border-sky-300 active:bg-sky-50/40"
                  }`}
                >
                  {recentlyAdded?.productId === product.id && (
                    <span key={recentlyAdded.nonce} className="pos-product-added-feedback" aria-hidden="true">+1</span>
                  )}
                  <div className="pos-product-details relative z-10">
                    <span className="pos-product-context">
                      <span className="pos-product-category-badge">
                        {categoryPath?.leaf?.name
                          ?? categoryPath?.root.name
                          ?? product.subCategory
                          ?? product.category}
                      </span>
                      {quantityInCart > 0 && <span className="pos-product-in-cart">{quantityInCart} in mandje</span>}
                    </span>
                    <span className="pos-product-title block text-sm font-bold leading-snug">
                      {product.name}
                    </span>
                    <span className="pos-product-meta block text-xs font-medium">
                      {[product.brand, product.variant]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </div>

                  <div className="pos-product-footer relative z-10 mt-3 flex items-end justify-between gap-3 pt-3 border-t">
                    <span className="pos-product-price text-base font-extrabold tracking-tight">
                      {formatEUR(product.priceCents)}
                    </span>
                    <span className={`pos-product-stock max-w-28 text-right text-[10px] font-semibold leading-tight ${outOfStock ? "pos-product-stock--out" : lowStock ? "pos-product-stock--low" : ""}`}>
                      {stockLabel(product.stockQty)}{lowStock ? " · laag" : ""}
                    </span>
                  </div>
                </button>
              );
            })}
            {filteredProducts.length === 0 && (
              term ? (
                <div className="pos-catalog-empty col-span-full py-12 text-center font-medium">
                  Geen product gevonden. Controleer barcode, SKU, merk, subcategorie of maat.
                </div>
              ) : activeProducts.length === 0 && onStartStoreSetup ? (
                <section className="store-setup-empty-state col-span-full mx-auto my-6 w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs sm:p-6">
                  <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Nieuwe winkel</p>
                      <h2 className="mt-1 text-base font-black tracking-tight text-slate-900">Voeg je eerste producten toe</h2>
                      <p className="mt-1 max-w-xl text-xs leading-5 text-slate-500">Werk eerst je kassaticketgegevens af, orden je categorieën en voeg daarna je eerste product toe.</p>
                    </div>
                    <button type="button" onClick={onStartStoreSetup} className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-xl bg-[#0e7490] px-4 text-xs font-extrabold text-white shadow-sm transition hover:bg-[#155e75]">
                      Je winkel starten
                    </button>
                  </div>
                  <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 border-t border-slate-100 pt-4">
                    <button type="button" onClick={onImportProducts} className="inline-flex items-center gap-1.5 text-xs font-extrabold text-[#0e7490] hover:text-[#155e75] hover:underline"><FileSpreadsheet size={14} /> Productlijst importeren</button>
                    {onAddCategory && <button type="button" onClick={onAddCategory} className="inline-flex items-center gap-1.5 text-xs font-extrabold text-slate-600 hover:text-slate-900 hover:underline"><Layers3 size={14} /> Eerste categorieën toevoegen</button>}
                  </div>
                </section>
              ) : (
                <div className="pos-catalog-empty col-span-full py-12 text-center font-medium">
                  <p>Geen producten in deze selectie.</p>
                  <button type="button" className="pos-filter-reset mt-4 rounded-lg px-4 py-2 text-xs" onClick={() => { setInStockOnly(false); setActiveCategory("all"); setActiveSubCategory("all"); setActiveBrand("all"); }}>Wis filters</button>
                </div>
              )
            )}
            {filteredProducts.length > visibleProducts.length && (
              <button
                type="button"
                onClick={() => setVisibleProductCount((count) => count + 40)}
                className="pos-load-more col-span-full rounded-xl border px-4 py-3 text-sm font-bold shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
              >
                Toon volgende{" "}
                {Math.min(40, filteredProducts.length - visibleProducts.length)}{" "}
                van {filteredProducts.length} producten
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
