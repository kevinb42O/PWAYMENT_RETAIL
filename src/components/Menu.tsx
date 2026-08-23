import React, { useEffect, useMemo, useState } from "react";
import { useStore } from "../store/useStore";
import { useProducts } from "../store/useProducts";
import { formatEUR } from "../utils/money";
import { useCategories } from "../store/useCategories";
import {
  matchesCatalogQuery,
  normalizeCatalogQuery,
} from "../utils/productLookup";
import { Box, Grid2X2, Layers3, Sparkles, FileSpreadsheet, PackagePlus } from "lucide-react";
import { isGiftCardProduct } from "../utils/financial";

const stockLabel = (stockQty?: number): string => {
  if (stockQty == null) return "Geen voorraadtracking";
  if (stockQty === 0) return "Uitverkocht";
  return `${stockQty} op voorraad`;
};

const categoryBadgeTone = (subCategory?: string): string => {
  const normalized = subCategory?.toLocaleLowerCase("nl-BE") ?? "";
  if (normalized.includes("cadeaubon")) return "pos-badge-gift";
  if (normalized.includes("advies")) return "pos-badge-advice";
  return "pos-badge-default";
};

interface MenuProps {
  query: string;
  onQueryChange: (value: string) => void;
  onStartStoreSetup?: () => void;
  onImportProducts?: () => void;
  onAddProduct?: () => void;
}

export const Menu: React.FC<MenuProps> = ({
  query,
  onQueryChange,
  onStartStoreSetup,
  onImportProducts,
  onAddProduct,
}) => {
  const addOrderItem = useStore((s) => s.addOrderItem);
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
        .filter((category) => category.isActive !== false)
        .map((category) => ({
          id: category.id,
          name: category.name,
          count: activeProducts.filter(
            (product) => product.category === category.id,
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
      count: activeProducts.filter((product) => product.category === name)
        .length,
    }));
  }, [activeProducts, categories]);

  const categoryProducts = useMemo(
    () =>
      activeProducts.filter(
        (product) =>
          activeCategory === "all" || product.category === activeCategory,
      ),
    [activeCategory, activeProducts],
  );

  const subCategoryItems = useMemo(() => {
    const names = Array.from(
      new Set(
        categoryProducts.map((product) => product.subCategory ?? "Overig"),
      ),
    ).sort();
    return names.map((name) => ({
      id: name,
      name,
      count: categoryProducts.filter(
        (product) => (product.subCategory ?? "Overig") === name,
      ).length,
    }));
  }, [categoryProducts]);

  const subCategoryProducts = useMemo(
    () =>
      categoryProducts.filter(
        (product) =>
          activeSubCategory === "all" ||
          (product.subCategory ?? "Overig") === activeSubCategory,
      ),
    [activeSubCategory, categoryProducts],
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
      ? activeProducts.filter((product) => matchesCatalogQuery(product, term))
      : subCategoryProducts.filter(
          (product) =>
            activeBrand === "all" ||
            (product.brand ?? "Zonder merk") === activeBrand,
        );

    return [...base].sort((a, b) => {
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
  }, [activeBrand, activeProducts, subCategoryProducts, term]);

  useEffect(() => {
    setVisibleProductCount(40);
  }, [activeBrand, activeCategory, activeSubCategory, term]);

  const visibleProducts = filteredProducts.slice(0, visibleProductCount);

  const activeCategoryName =
    activeCategory === "all"
      ? "Alle hoofdcategorieën"
      : (categoryItems.find((category) => category.id === activeCategory)
          ?.name ?? "Alle hoofdcategorieën");
  const activeSubCategoryName =
    activeSubCategory === "all" ? "Alle subcategorieën" : activeSubCategory;
  const resultLabel =
    filteredProducts.length === 1
      ? "1 product"
      : `${filteredProducts.length} producten`;

  const showSubCategory = activeCategory !== "all";

  return (
    <div
      className={`pos-catalog grid h-full grid-cols-1 overflow-hidden text-slate-900 ${showSubCategory ? "lg:grid-cols-[210px_230px_minmax(0,1fr)]" : "lg:grid-cols-[210px_minmax(0,1fr)]"}`}
    >
      {/* Hoofdcategorieën kolom */}
      <div className="pos-category-rail overflow-y-auto border-b border-slate-200 lg:border-b-0 lg:border-r">
        <div className="pos-rail-heading sticky top-0 z-10 border-b border-slate-200/70 px-4 py-3.5 backdrop-blur-md">
          <div className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
            <Grid2X2 size={13} /> Hoofdcategorie
          </div>
        </div>

        <div className="flex gap-1.5 overflow-x-auto p-2 lg:block lg:overflow-visible lg:p-0">
          <button
            onClick={() => {
              setActiveCategory("all");
              setActiveSubCategory("all");
              setActiveBrand("all");
              onQueryChange("");
            }}
            className={`min-w-[150px] border-l-4 px-4 py-3.5 text-left transition-all lg:w-full lg:min-w-0 ${
              activeCategory === "all" && !term
                ? "pos-rail-active border-l-sky-600 text-slate-900 font-bold"
                : "border-l-transparent text-slate-600 hover:bg-white/60 hover:text-slate-900 font-medium"
            }`}
          >
            <span className="block text-sm">Alles</span>
            <span
              className={`mt-0.5 block text-xs ${activeCategory === "all" && !term ? "text-sky-700 font-semibold" : "text-slate-600"}`}
            >
              {activeProducts.length} producten
            </span>
          </button>

          {categoryItems.map((category) => {
            const isActive = activeCategory === category.id && !term;
            return (
              <button
                key={category.id}
                onClick={() => {
                  setActiveCategory(category.id);
                  setActiveSubCategory("all");
                  setActiveBrand("all");
                  onQueryChange("");
                }}
                className={`min-w-[170px] border-l-4 px-4 py-3.5 text-left transition-all lg:w-full lg:min-w-0 ${
                  isActive
                    ? "pos-rail-active border-l-sky-600 text-slate-900 font-bold"
                    : "border-l-transparent text-slate-600 hover:bg-white/60 hover:text-slate-900 font-medium"
                }`}
              >
                <span className="block text-sm leading-tight">
                  {category.name}
                </span>
                <span
                  className={`mt-0.5 block text-xs ${isActive ? "text-sky-700 font-semibold" : "text-slate-600"}`}
                >
                  {category.count} producten
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Subcategorieën kolom */}
      {showSubCategory && (
        <div className="pos-category-rail pos-category-rail--secondary overflow-y-auto border-b border-slate-200 lg:border-b-0 lg:border-r">
          <div className="pos-rail-heading sticky top-0 z-10 border-b border-slate-200/70 px-4 py-3 backdrop-blur-md">
            <div className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
              <Layers3 size={13} /> Subcategorie
            </div>
            <div className="mt-0.5 truncate text-xs font-bold text-slate-800">
              {activeCategoryName}
            </div>
          </div>

          <div className="flex gap-1.5 overflow-x-auto p-2 lg:block lg:overflow-visible lg:p-0">
            <button
              onClick={() => {
                setActiveSubCategory("all");
                setActiveBrand("all");
                onQueryChange("");
              }}
              className={`min-w-[170px] border-l-4 px-4 py-3 text-left transition-all lg:w-full lg:min-w-0 ${
                activeSubCategory === "all" && !term
                  ? "pos-rail-active border-l-sky-600 text-slate-900 font-bold"
                  : "border-l-transparent text-slate-600 hover:bg-white/60 hover:text-slate-900 font-medium"
              }`}
            >
              <span className="block text-sm">Alle subcategorieën</span>
              <span
                className={`mt-0.5 block text-xs ${activeSubCategory === "all" && !term ? "text-sky-700 font-semibold" : "text-slate-600"}`}
              >
                {categoryProducts.length} producten
              </span>
            </button>

            {subCategoryItems.map((subCategory) => {
              const isActive = activeSubCategory === subCategory.id && !term;
              return (
                <button
                  key={subCategory.id}
                  onClick={() => {
                    setActiveSubCategory(subCategory.id);
                    setActiveBrand("all");
                    onQueryChange("");
                  }}
                  className={`min-w-[180px] border-l-4 px-4 py-3 text-left transition-all lg:w-full lg:min-w-0 ${
                    isActive
                      ? "pos-rail-active border-l-sky-600 text-slate-900 font-bold"
                      : "border-l-transparent text-slate-600 hover:bg-white/60 hover:text-slate-900 font-medium"
                  }`}
                >
                  <span className="block text-sm leading-tight">
                    {subCategory.name}
                  </span>
                  <span
                    className={`mt-0.5 block text-xs ${isActive ? "text-sky-700 font-semibold" : "text-slate-600"}`}
                  >
                    {subCategory.count} producten
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Producten raster area */}
      <div className="pos-product-stage flex min-w-0 flex-col overflow-hidden">
        <div className="pos-catalog-toolbar border-b border-slate-200/80 p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-extrabold text-slate-900">
                <Box size={16} className="text-sky-600" />
                {term
                  ? "Zoekresultaten"
                  : `${activeCategoryName} / ${activeSubCategoryName}`}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {term
                  ? exactCodeMatch
                    ? `${resultLabel}. Exacte ${exactCodeMatch.matchedOn === "barcode" ? "barcode" : exactCodeMatch.matchedOn === "identifier" ? "productidentificatie" : "SKU"}-match voor ${exactCodeMatch.product.name}.`
                    : `${resultLabel}. Zoek op barcode, SKU, product, merk of subcategorie.`
                  : `${resultLabel}. Filter verder op merk of kies een product.`}
              </div>
            </div>

            {term && (
              <button
                onClick={() => onQueryChange("")}
                className="self-start rounded-lg bg-slate-200 hover:bg-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors"
              >
                Wis filter
              </button>
            )}
          </div>

          {!term && brandItems.length > 1 && (
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              <button
                onClick={() => setActiveBrand("all")}
                className={`whitespace-nowrap rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all ${
                  activeBrand === "all"
                    ? "pos-filter-active"
                    : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                Alle merken ({subCategoryProducts.length})
              </button>
              {brandItems.map((brand) => (
                <button
                  key={brand.id}
                  onClick={() => setActiveBrand(brand.id)}
                  className={`whitespace-nowrap rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all ${
                    activeBrand === brand.id
                      ? "pos-filter-active"
                      : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                >
                  {brand.name} ({brand.count})
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Product grid */}
        <div className="pos-product-grid flex-1 overflow-y-auto p-4 lg:p-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {visibleProducts.map((product) => {
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
                  onClick={() => addOrderItem(product)}
                  disabled={outOfStock}
                  className={`pos-product-card relative flex min-h-[146px] flex-col justify-between overflow-hidden rounded-xl border p-4 text-left transition-colors ${
                    outOfStock
                      ? "cursor-not-allowed opacity-50 bg-slate-50"
                      : "hover:border-sky-300 active:bg-sky-50/40"
                  }`}
                >
                  <div className="relative z-10 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <span className="rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                        {product.subCategory ?? product.category}
                      </span>
                      {(outOfStock || lowStock) && (
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            outOfStock
                              ? "bg-red-50 text-red-700 border border-red-200"
                              : "bg-amber-50 text-amber-700 border border-amber-200"
                          }`}
                        >
                          {outOfStock ? "Uitverkocht" : "Lage stock"}
                        </span>
                      )}
                    </div>
                    <span className="block text-sm font-bold leading-snug text-slate-900">
                      {product.name}
                    </span>
                    <span className="block text-xs font-medium text-slate-500">
                      {[product.brand, product.variant]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </div>

                  <div className="relative z-10 mt-3 flex items-end justify-between gap-3 pt-3 border-t border-slate-100">
                    <span className="text-base font-extrabold tracking-tight text-slate-950">
                      {formatEUR(product.priceCents)}
                    </span>
                    <span className="max-w-28 text-right text-[10px] font-semibold leading-tight text-slate-600">
                      {stockLabel(product.stockQty)}
                    </span>
                  </div>
                </button>
              );
            })}
            {filteredProducts.length === 0 && (
              term ? (
                <div className="col-span-full py-12 text-center text-slate-500 font-medium">
                  Geen product gevonden. Controleer barcode, SKU, merk, subcategorie of maat.
                </div>
              ) : activeProducts.length === 0 && onStartStoreSetup ? (
                <section className="col-span-full mx-auto my-3 w-full max-w-2xl overflow-hidden rounded-3xl border border-sky-100 bg-white shadow-[0_20px_60px_-30px_rgba(15,23,42,0.28)]">
                  <div className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-sky-950 px-6 py-7 text-white sm:px-8">
                    <div className="absolute -right-10 -top-14 h-40 w-40 rounded-full bg-sky-400/25 blur-2xl" />
                    <div className="relative flex items-start gap-4">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/12 text-sky-200 ring-1 ring-white/15"><Sparkles size={20} /></span>
                      <div>
                        <p className="text-lg font-black tracking-tight">Je kassa is klaar. Nu je assortiment nog.</p>
                        <p className="mt-1.5 max-w-xl text-sm leading-6 text-slate-300">We helpen je zaakgegevens afwerken en brengen je in een paar heldere stappen naar je eerste verkoop.</p>
                      </div>
                    </div>
                  </div>
                  <div className="grid gap-3 p-5 sm:grid-cols-[1fr_auto] sm:items-center sm:p-6">
                    <div>
                      <p className="text-sm font-extrabold text-slate-900">Start zonder zoeken in instellingen.</p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">Vul je bongegevens in en kies daarna: importeren of je eerste product toevoegen.</p>
                    </div>
                    <button type="button" onClick={onStartStoreSetup} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-extrabold text-white shadow-md transition hover:bg-black">
                      Start je winkel <Sparkles size={16} />
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2 border-t border-slate-100 bg-slate-50/80 px-5 py-3 sm:px-6">
                    <button type="button" onClick={onImportProducts} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-bold text-sky-800 hover:bg-sky-100"><FileSpreadsheet size={14} /> Productlijst importeren</button>
                    <button type="button" onClick={onAddProduct} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-200"><PackagePlus size={14} /> Eerste product toevoegen</button>
                  </div>
                </section>
              ) : (
                <div className="col-span-full py-12 text-center text-slate-500 font-medium">Geen producten in deze selectie.</div>
              )
            )}
            {filteredProducts.length > visibleProducts.length && (
              <button
                type="button"
                onClick={() => setVisibleProductCount((count) => count + 40)}
                className="col-span-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700 shadow-sm hover:border-sky-300 hover:bg-sky-50 focus:outline-none focus:ring-2 focus:ring-sky-500"
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
