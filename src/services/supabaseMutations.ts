import { supabase } from "../lib/supabase";
import type { Customer, Product, ProductCategory } from "../types";
import type { Database } from "../types/database.generated";

type ProductInsert = Database["public"]["Tables"]["products"]["Insert"];
type CategoryInsert = Database["public"]["Tables"]["categories"]["Insert"];
type CustomerInsert = Database["public"]["Tables"]["customers"]["Insert"];

const throwIfError = (error: { message: string } | null): void => {
  if (error) throw new Error(error.message);
};

export const upsertSupabaseCategories = async (
  storeId: string | null,
  categories: ProductCategory[],
): Promise<void> => {
  if (!storeId || categories.length === 0) return;
  const rows: CategoryInsert[] = categories.map((category) => ({
    store_id: storeId,
    external_id: category.id,
    name: category.name,
    vat_rate: category.vatRate,
    sort_order: category.sortOrder ?? null,
    is_active: category.isActive !== false,
    is_demo: false,
  }));
  const { error } = await supabase
    .from("categories")
    .upsert(rows, { onConflict: "store_id,external_id" });
  throwIfError(error);
};

export const deleteSupabaseCategory = async (
  storeId: string | null,
  externalId: string,
): Promise<void> => {
  if (!storeId) return;
  const { error } = await supabase
    .from("categories")
    .delete()
    .eq("store_id", storeId)
    .eq("external_id", externalId);
  throwIfError(error);
};

export const upsertSupabaseProducts = async (
  storeId: string | null,
  products: Product[],
): Promise<void> => {
  if (!storeId || products.length === 0) return;

  const categoryExternalIds = Array.from(
    new Set(products.map((product) => product.category).filter(Boolean)),
  );
  const categoryId = new Map<string, string>();
  if (categoryExternalIds.length > 0) {
    const { data, error } = await supabase
      .from("categories")
      .select("id, external_id")
      .eq("store_id", storeId)
      .in("external_id", categoryExternalIds);
    throwIfError(error);
    for (const category of data ?? []) {
      if (category.external_id)
        categoryId.set(category.external_id, category.id);
    }
  }

  const rows: ProductInsert[] = products.map((product) => ({
    store_id: storeId,
    external_id: product.id,
    category_id: categoryId.get(product.category) ?? null,
    name: product.name,
    category_name: product.category,
    subcategory: product.subCategory ?? null,
    sku: product.sku ?? null,
    barcode: product.barcode ?? null,
    price_cents: product.priceCents,
    cost_price_cents: product.costPriceCents ?? null,
    vat_rate: product.vatRate,
    brand: product.brand ?? null,
    supplier: product.supplier ?? null,
    variant: product.variant ?? null,
    stock_qty: product.stockQty ?? null,
    min_stock_qty: product.minStockQty ?? null,
    color: product.color ?? null,
    product_type: product.productType ?? "merchandise",
    is_active: product.isActive !== false,
    is_demo: false,
  }));
  const { error } = await supabase
    .from("products")
    .upsert(rows, { onConflict: "store_id,external_id" });
  throwIfError(error);
};

export const upsertSupabaseCustomers = async (
  storeId: string | null,
  customers: Customer[],
): Promise<void> => {
  if (!storeId || customers.length === 0) return;
  const rows: CustomerInsert[] = customers.map((customer) => ({
    store_id: storeId,
    external_id: customer.id,
    name: customer.name,
    email: customer.email ?? null,
    phone: customer.phone ?? null,
    address: customer.address ?? null,
    notes: customer.notes ?? null,
    total_spent_cents: customer.totalSpentCents,
    visit_count: customer.visitCount,
    last_visit_at: customer.lastVisitAt ?? null,
    is_active: customer.isActive,
    is_demo: false,
    created_at: customer.createdAt,
  }));
  const { error } = await supabase
    .from("customers")
    .upsert(rows, { onConflict: "store_id,external_id" });
  throwIfError(error);
};
