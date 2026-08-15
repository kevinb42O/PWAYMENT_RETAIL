import { supabase } from "../lib/supabase";
import type { Customer, Product, ProductCategory } from "../types";
import type { Database } from "../types/database.generated";

type ProductInsert = Database["public"]["Tables"]["products"]["Insert"];
type CategoryInsert = Database["public"]["Tables"]["categories"]["Insert"];
type CustomerInsert = Database["public"]["Tables"]["customers"]["Insert"];

const throwIfError = (error: { message: string } | null): void => {
  if (error) throw new Error(error.message);
};

const isMissingExtensionColumn = (
  error: { message: string } | null,
  columns: string[],
): boolean =>
  Boolean(
    error &&
      columns.some((column) => error.message.toLocaleLowerCase("en").includes(column)),
  );

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
  const categoryName = new Map<string, string>();
  if (categoryExternalIds.length > 0) {
    const { data, error } = await supabase
      .from("categories")
      .select("id, external_id, name")
      .eq("store_id", storeId)
      .in("external_id", categoryExternalIds);
    throwIfError(error);
    for (const category of data ?? []) {
      if (category.external_id) {
        categoryId.set(category.external_id, category.id);
        categoryName.set(category.external_id, category.name);
      }
    }
  }

  const rows: ProductInsert[] = products.map((product) => ({
    store_id: storeId,
    external_id: product.id,
    category_id: categoryId.get(product.category) ?? null,
    name: product.name,
    category_name: categoryName.get(product.category) ?? product.category,
    subcategory: product.subCategory ?? null,
    sku: product.sku ?? null,
    barcode: product.barcode ?? null,
    price_cents: product.priceCents,
    cost_price_cents: product.costPriceCents ?? null,
    vat_rate: product.vatRate,
    brand: product.brand ?? null,
    supplier: product.supplier ?? null,
    supplier_code: product.supplierCode ?? null,
    variant: product.variant ?? null,
    price_tiers: (product.priceTiers ?? {}) as Database["public"]["Tables"]["products"]["Insert"]["price_tiers"],
    custom_fields: (product.customFields ?? {}) as Database["public"]["Tables"]["products"]["Insert"]["custom_fields"],
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
  if (!error) return;
  if (!isMissingExtensionColumn(error, ["supplier_code", "price_tiers", "custom_fields"])) {
    throwIfError(error);
    return;
  }

  // Rolling-deploy compatibility: core product changes may safely reach an
  // older backend while the extension migration is awaiting owner approval.
  const legacyRows = rows.map(({ supplier_code: _supplierCode, price_tiers: _priceTiers, custom_fields: _customFields, ...row }) => row);
  const { error: legacyError } = await supabase
    .from("products")
    .upsert(legacyRows, { onConflict: "store_id,external_id" });
  throwIfError(legacyError);
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
    price_group: customer.priceGroup ?? null,
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
  if (!error) return;
  if (!isMissingExtensionColumn(error, ["price_group"])) {
    throwIfError(error);
    return;
  }
  const legacyRows = rows.map(({ price_group: _priceGroup, ...row }) => row);
  const { error: legacyError } = await supabase
    .from("customers")
    .upsert(legacyRows, { onConflict: "store_id,external_id" });
  throwIfError(legacyError);
};
