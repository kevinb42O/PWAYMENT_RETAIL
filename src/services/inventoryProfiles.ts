import { useAuth } from "../auth/useAuth";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import type { Json } from "../types/database.generated";

export type InventoryStockMode = "simple" | "locations" | "lots" | "serials";
export interface InventoryProfileSummary {
  productId: string;
  stockMode: InventoryStockMode;
  trackStock: boolean;
}

type ProfileRpc = {
  rpc: (fn: "get_inventory_operation_profiles", args: { target_store_id: string }) => Promise<{
    data: Json | null;
    error: { message: string } | null;
  }>;
};

export const loadInventoryProfiles = async (): Promise<Map<string, InventoryProfileSummary>> => {
  const storeId = useAuth.getState().currentStoreId;
  if (!storeId || !isSupabaseConfigured) return new Map();
  const { data, error } = await (supabase as unknown as ProfileRpc).rpc("get_inventory_operation_profiles", { target_store_id: storeId });
  if (error) throw new Error("De voorraadprofielen konden niet worden gecontroleerd.");
  const rows = Array.isArray(data) ? data : [];
  return new Map(rows.flatMap((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const row = value as Record<string, unknown>;
    const productId = typeof row.product_id === "string" ? row.product_id : null;
    const stockMode = ["simple", "locations", "lots", "serials"].includes(String(row.stock_mode))
      ? row.stock_mode as InventoryStockMode : null;
    return productId && stockMode ? [[productId, { productId, stockMode, trackStock: row.track_stock === true }]] : [];
  }));
};
