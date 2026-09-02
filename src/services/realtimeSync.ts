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

    // A cache from before `serverId` was introduced already has the correct
    // local category identity. Repair it locally instead of waiting on an
    // unnecessary network lookup, which also keeps Realtime updates usable
    // while the device is offline.
    const legacyCategory = await db.categories
      .filter(
        (candidate) =>
          !candidate.serverId
          && normalizedCategoryName(candidate.name)
            === normalizedCategoryName(row.category_name),
      )
      .first();
    if (legacyCategory) return legacyCategory.id;

    const { data: remoteCategory } = await supabase
      .from("categories")
      .select("external_id")
      .eq("store_id", row.store_id)
      .eq("id", row.category_id)
      .maybeSingle();
    if (remoteCategory?.external_id) return remoteCategory.external_id;
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
    familyId: existing?.familyId,
    variantOptions: existing?.variantOptions,
    identifiers: existing?.identifiers,
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

const mapCategory = async (row: Row<"categories">): Promise<ProductCategory> => {
  const categoryId = row.external_id ?? row.id;
  const existing = await db.categories.get(categoryId);
  let parent = row.parent_id
    ? (await db.categories.toArray()).find((category) => category.serverId === row.parent_id)
    : undefined;
  if (row.parent_id && !parent) {
    const { data: remoteParent } = await supabase
      .from("categories")
      // Keep this narrow projection compatible with a backend that is still
      // applying the icon migration; the incoming category event itself
      // carries the icon once that rollout is complete.
      .select("id, external_id, name, vat_rate, sort_order, is_active")
      .eq("store_id", row.store_id)
      .eq("id", row.parent_id)
      .maybeSingle();
    if (remoteParent) {
      parent = {
        id: remoteParent.external_id ?? remoteParent.id,
        serverId: remoteParent.id,
        name: remoteParent.name,
        vatRate: Number(remoteParent.vat_rate),
        sortOrder: remoteParent.sort_order ?? undefined,
        isActive: remoteParent.is_active,
      };
      await db.categories.put(parent);
    }
  }
  return {
    id: categoryId,
    serverId: row.id,
    parentId: parent?.id,
    name: row.name,
    // Keep an icon selected locally while a rolling backend deployment has
    // not started returning the new column yet.
    icon: row.icon ?? existing?.icon,
    vatRate: row.vat_rate == null ? undefined : Number(row.vat_rate),
    sortOrder: row.sort_order ?? undefined,
    isActive: row.is_active,
  };
};

let syncChannel: ReturnType<typeof supabase.channel> | null = null;
let authoritativeRefreshTimer: ReturnType<typeof setTimeout> | null = null;

const scheduleAuthoritativeStoreRefresh = (storeId: string) => {
  if (authoritativeRefreshTimer) clearTimeout(authoritativeRefreshTimer);
  authoritativeRefreshTimer = setTimeout(() => {
    authoritativeRefreshTimer = null;
    // Catalog relations and normalized retail-profile rows can arrive in a
    // batch. One debounced authoritative hydrate avoids transient tuples and
    // ensures platform-confirmed capability states reach every open device.
    void import("./supabaseStoreSync")
      .then(({ syncStoreFromSupabase }) => syncStoreFromSupabase(storeId))
      .catch((error) => console.error("Authoritative retail refresh failed:", error));
  }, 300);
};

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
            const next = await mapCategory(payload.new as Row<"categories">);
            await db.categories.put(next);
            await useCategories.getState().refresh();
          } else if (payload.table === "categories" && payload.eventType === "DELETE") {
            const oldRow = payload.old as Row<"categories">;
            const id = oldRow.external_id ?? oldRow.id;
            await db.categories.delete(id);
            await useCategories.getState().refresh();
          } else if ([
            "product_families",
            "product_family_variants",
            "product_family_option_definitions",
            "product_family_option_values",
            "product_variant_option_values",
            "product_identifiers",
            "store_retail_profiles",
            "store_capability_assessments",
          ].includes(payload.table)) {
            scheduleAuthoritativeStoreRefresh(storeId);
          }
        } catch (err) {
          console.error("Realtime sync mapping error:", err);
        }
      }
    )
    .subscribe();
};

export const stopRealtimeSync = () => {
  if (authoritativeRefreshTimer) {
    clearTimeout(authoritativeRefreshTimer);
    authoritativeRefreshTimer = null;
  }
  if (syncChannel) {
    supabase.removeChannel(syncChannel);
    syncChannel = null;
  }
};
