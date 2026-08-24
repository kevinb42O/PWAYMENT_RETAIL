import type { Product, ProductCategory } from "../types";

export interface CategoryPath {
  root: ProductCategory;
  leaf?: ProductCategory;
}

export const normalizeCategoryLabel = (value: string): string =>
  value.trim().toLocaleLowerCase("nl-BE");

const slugify = (value: string): string =>
  value
    .toLocaleLowerCase("nl-BE")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32) || "subcategory";

export const rootCategories = (categories: ProductCategory[]): ProductCategory[] =>
  categories.filter((category) => !category.parentId);

export const childCategories = (
  categories: ProductCategory[],
  parentId: string,
): ProductCategory[] => categories.filter((category) => category.parentId === parentId);

export const resolveCategoryPath = (
  categoryId: string | undefined,
  categories: ProductCategory[],
  legacySubcategoryName?: string,
): CategoryPath | null => {
  if (!categoryId) return null;
  const byId = new Map(categories.map((category) => [category.id, category]));
  let assigned = byId.get(categoryId);
  if (!assigned) {
    const normalized = normalizeCategoryLabel(categoryId);
    assigned = categories.find((category) => normalizeCategoryLabel(category.name) === normalized);
  }
  if (!assigned) return null;
  if (assigned.parentId) {
    const root = byId.get(assigned.parentId);
    return root ? { root, leaf: assigned } : null;
  }
  const legacyLeaf = legacySubcategoryName
    ? childCategories(categories, assigned.id).find(
        (category) => normalizeCategoryLabel(category.name) === normalizeCategoryLabel(legacySubcategoryName),
      )
    : undefined;
  return { root: assigned, leaf: legacyLeaf };
};

export const resolveProductCategoryPath = (
  product: Pick<Product, "category" | "subCategory">,
  categories: ProductCategory[],
): CategoryPath | null => resolveCategoryPath(product.category, categories, product.subCategory);

export const canonicalProductCategoryId = (
  product: Pick<Product, "category" | "subCategory">,
  categories: ProductCategory[],
): string => {
  const path = resolveProductCategoryPath(product, categories);
  return path?.leaf?.id ?? path?.root.id ?? product.category;
};

export const categoryPathLabel = (path: CategoryPath | null): string => {
  if (!path) return "Ongecategoriseerd";
  return path.leaf ? `${path.root.name} / ${path.leaf.name}` : path.root.name;
};

export const productRootCategoryLabel = (
  product: Pick<Product, "category" | "categorySnapshot">,
): string => product.categorySnapshot?.rootName ?? product.category ?? "Ongecategoriseerd";

export const productLeafCategoryLabel = (
  product: Pick<Product, "subCategory" | "categorySnapshot">,
): string | undefined => product.categorySnapshot?.leafName ?? product.subCategory;

export interface MaterializedTaxonomy {
  categories: ProductCategory[];
  products: Product[];
  createdCategories: ProductCategory[];
  updatedProducts: Product[];
}

/**
 * Converts the legacy root-id + free-text subcategory representation into the
 * canonical representation where `product.category` always points at the
 * most-specific category record. It is deterministic and safe to run again.
 */
export const materializeLegacySubcategories = (
  originalCategories: ProductCategory[],
  originalProducts: Product[],
): MaterializedTaxonomy => {
  const categories = originalCategories.map((category) => ({ ...category }));
  const usedIds = new Set(categories.map((category) => category.id));
  const childrenByPath = new Map<string, ProductCategory>();
  for (const category of categories) {
    if (!category.parentId) continue;
    childrenByPath.set(
      `${category.parentId}\u001f${normalizeCategoryLabel(category.name)}`,
      category,
    );
  }
  const createdCategories: ProductCategory[] = [];
  const updatedProducts: Product[] = [];
  const products = originalProducts.map((product) => {
    const existingPath = resolveProductCategoryPath(product, categories);
    if (existingPath?.leaf) {
      if (product.category === existingPath.leaf.id && product.subCategory === existingPath.leaf.name) return product;
      const updated = { ...product, category: existingPath.leaf.id, subCategory: existingPath.leaf.name };
      updatedProducts.push(updated);
      return updated;
    }
    if (!existingPath?.root || !product.subCategory?.trim()) return product;
    const name = product.subCategory.trim();
    const key = `${existingPath.root.id}\u001f${normalizeCategoryLabel(name)}`;
    let leaf = childrenByPath.get(key);
    if (!leaf) {
      const base = `${existingPath.root.id}-${slugify(name)}`.slice(0, 64);
      let id = base;
      let suffix = 2;
      while (usedIds.has(id)) id = `${base}-${suffix++}`;
      usedIds.add(id);
      leaf = {
        id,
        parentId: existingPath.root.id,
        name,
        vatRate: existingPath.root.vatRate,
        isActive: existingPath.root.isActive !== false,
      };
      categories.push(leaf);
      createdCategories.push(leaf);
      childrenByPath.set(key, leaf);
    }
    const updated = { ...product, category: leaf.id, subCategory: leaf.name };
    updatedProducts.push(updated);
    return updated;
  });
  return { categories, products, createdCategories, updatedProducts };
};
