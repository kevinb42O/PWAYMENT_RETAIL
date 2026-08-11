import { supabase } from "../lib/supabase";
import type { PurchaseOrder } from "../types";
import type { Json } from "../types/database.generated";
import { syncStoreFromSupabase } from "./supabaseStoreSync";

const toIso = (value?: number): string | undefined =>
  value == null ? undefined : new Date(value).toISOString();

const orderPayload = (order: PurchaseOrder) => ({
  id: order.id,
  supplier: order.supplier,
  status: order.status,
  created_at: toIso(order.createdAt),
  ordered_at: toIso(order.orderedAt),
  received_at: toIso(order.receivedAt),
  expected_delivery_at: toIso(order.expectedDeliveryAt),
  reference: order.reference,
  note: order.note,
  owner_name: order.ownerName,
  items: order.items.map((item) => ({
    product_id: item.productId,
    ordered_qty: item.orderedQty,
    received_qty: item.receivedQty,
    unit_cost_cents: item.unitCostCents,
    forecast_snapshot: {
      currentStockQtyAtDraft: item.currentStockQtyAtDraft,
      minStockQtyAtDraft: item.minStockQtyAtDraft,
      estimatedStockoutAt: item.estimatedStockoutAt,
      forecastConfidence: item.forecastConfidence,
      forecastTrend: item.forecastTrend,
    },
  })),
});

export const saveSupabasePurchaseOrders = async (
  storeId: string,
  orders: PurchaseOrder[],
): Promise<void> => {
  const rpc = supabase.rpc as unknown as (
    functionName: string,
    args: { target_store_id: string; payload: Json },
  ) => Promise<{ error: { message: string } | null }>;
  for (const order of orders) {
    const { error } = await rpc("save_purchase_order", {
      target_store_id: storeId,
      payload: orderPayload(order) as unknown as Json,
    });
    if (error) {
      const match = error.message.match(/purchase:[a-z-]+:(.+)/s);
      throw new Error(
        match?.[1]?.trim() ||
          "De inkooporder kon niet veilig worden opgeslagen.",
      );
    }
  }
  await syncStoreFromSupabase(storeId);
};
