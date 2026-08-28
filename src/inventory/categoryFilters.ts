import { categoryPathLabel, resolveProductCategoryPath } from "../catalog/categoryTaxonomy";
import type { Product, ProductCategory } from "../types";

export interface InventoryCategoryFilterOption {
  value: string;
  label: string;
  productCount: number;
}

const fallbackCategoryLabel = (product: Product): string => {
  const root = product.categorySnapshot?.rootName?.trim();
  const leaf = product.categorySnapshot?.leafName?.trim() || product.subCategory?.trim();
  if (root && leaf) return `${root} / ${leaf}`;
  return leaf || root || "Overige categorie";
};

export const inventoryCategoryFilterOptions = (
  products: Product[],
  categories: ProductCategory[],
): InventoryCategoryFilterOption[] => {
  const grouped = new Map<string, { product: Product; count: number }>();
  for (const product of products) {
    const value = product.category?.trim();
    if (!value || product.stockQty == null || product.isActive === false) continue;
    const current = grouped.get(value);
    grouped.set(value, { product: current?.product ?? product, count: (current?.count ?? 0) + 1 });
  }

  return [...grouped.entries()]
    .map(([value, entry]) => {
      const path = resolveProductCategoryPath(entry.product, categories);
      return {
        value,
        label: path ? categoryPathLabel(path) : fallbackCategoryLabel(entry.product),
        productCount: entry.count,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label, "nl-BE") || a.value.localeCompare(b.value));
};
