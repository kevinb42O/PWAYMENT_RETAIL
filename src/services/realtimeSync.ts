import { supabase } from "../lib/supabase";
import { db } from "../db/db";
import { useAuth } from "../auth/useAuth";
import type { Database } from "../types/database.generated";
import type { Customer, Product, ProductCategory } from "../types";
import { useProducts } from "../store/useProducts";
import { useCustomers } from "../store/useCustomers";
import { useCategories } from "../store/useCategories";

type Row<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];

const normalizedCategoryName = (value: string): string =>
  value.trim().toLocaleLowerCase("nl-BE");

/**
 * Products keep the category's public/external id locally, while a Realtime
 * product row only carries the database foreign key. Resolve it through the
 * cached category row instead of replacing the id with the display name.
 */
const resolveCategoryId = async (
  row: Row<"products">,
  existing?: Product,
): Promise<string> => {
  if (row.category_id) {
    const category = await db.categories
      .filter((candidate) => candidate.serverId === row.category_id)
      .first();
    if (category) return category.id;
  }

  // Legacy caches created before `serverId` existed can still be repaired by
  // the category name. Keep the prior id as a safer fallback than corrupting
  // an otherwise navigable product with a display name.
  const categoryName = normalizedCategoryName(row.category_name);
  const matchingCategory = await db.categories
    .filter(
      (candidate) => normalizedCategoryName(candidate.name) === categoryName,
    )
    .first();
  return matchingCategory?.id ?? existing?.category ?? row.category_name;
};

export const mapRealtimeProduct = async (
  row: Row<"products">,
): Promise<Product> => {
  const id = row.external_id ?? row.id;
  const existing = await db.products.get(id);
  return {
    id,
    name: row.name,
    category: await resolveCategoryId(row, existing),
    subCategory: row.subcategory ?? undefined,
    sku: row.sku ?? undefined,
    barcode: row.barcode ?? undefined,
    priceCents: Number(row.price_cents),
    costPriceCents: row.cost_price_cents == null ? undefined : Number(row.cost_price_cents),
    vatRate: Number(row.vat_rate),
    brand: row.brand ?? undefined,
    supplier: row.supplier ?? undefined,
    supplierCode: row.supplier_code ?? undefined,
    variant: row.variant ?? undefined,
    priceTiers: (row.price_tiers ?? {}) as Product["priceTiers"],
    customFields: (row.custom_fields ?? {}) as Product["customFields"],
    stockQty: row.stock_qty ?? undefined,
    minStockQty: row.min_stock_qty ?? undefined,
    color: row.color ?? undefined,
    productType: row.product_type as Product["productType"],
    isActive: row.is_active,
  };
};

const mapCustomer = (row: Row<"customers">): Customer => ({
  id: row.external_id ?? row.id,
  name: row.name,
  email: row.email ?? undefined,
  phone: row.phone ?? undefined,
  address: row.address ?? undefined,
  notes: row.notes ?? undefined,
  priceGroup: row.price_group ?? undefined,
  totalSpentCents: Number(row.total_spent_cents),
  visitCount: row.visit_count,
  lastVisitAt: row.last_visit_at ?? undefined,
  createdAt: row.created_at,
  isActive: row.is_active,
});

const mapCategory = (row: Row<"categories">): ProductCategory => ({
  id: row.external_id ?? row.id,
  serverId: row.id,
  name: row.name,
  vatRate: row.vat_rate == null ? undefined : Number(row.vat_rate),
  sortOrder: row.sort_order ?? undefined,
  isActive: row.is_active,
});

let syncChannel: ReturnType<typeof supabase.channel> | null = null;

export const startRealtimeSync = () => {
  if (syncChannel) return;

  const storeId = useAuth.getState().currentStoreId;
  if (!storeId) return;

  syncChannel = supabase
    .channel("public:sync")
    .on(
      "postgres_changes",
      { event: "*", schema: "public" },
      async (payload) => {
        // Skip changes not belonging to this store
        if (payload.new && (payload.new as any).store_id !== storeId) return;

        try {
          if (payload.table === "products" && payload.new) {
            const next = await mapRealtimeProduct(
              payload.new as Row<"products">,
            );
            await db.products.put(next);
            useProducts.getState().syncPersisted([next]);
          } else if (payload.table === "customers" && payload.new) {
            const next = mapCustomer(payload.new as Row<"customers">);
            await db.customers.put(next);
            useCustomers.getState().syncPersisted({ customer: next });
          } else if (payload.table === "categories" && payload.new) {
            const next = mapCategory(payload.new as Row<"categories">);
            await db.categories.put(next);
            await useCategories.getState().refresh();
          } else if (payload.table === "categories" && payload.eventType === "DELETE") {
            const oldRow = payload.old as Row<"categories">;
            const id = oldRow.external_id ?? oldRow.id;
            await db.categories.delete(id);
            await useCategories.getState().refresh();
          }
        } catch (err) {
          console.error("Realtime sync mapping error:", err);
        }
      }
    )
    .subscribe();
};

export const stopRealtimeSync = () => {
  if (syncChannel) {
    supabase.removeChannel(syncChannel);
    syncChannel = null;
  }
};
