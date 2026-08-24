import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useAuth } from "../auth/useAuth";
import { db } from "../db/db";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import type { Product } from "../types";
import type { MerchantInfo } from "../data/merchant";
import { buildCustomerInsights, type ServerPaceRecommendation } from "./customerInsights";

export const useCustomerInsights = (
  customerId: string | null,
  products: Product[],
  merchant: MerchantInfo,
) => {
  const storeId = useAuth((state) => state.currentStoreId);
  const storeIsDemo = useAuth((state) => state.currentStoreIsDemo);
  const useLocalAffinityFallback = storeIsDemo || !isSupabaseConfigured || !storeId;
  const transactions = useLiveQuery(
    () => !customerId
      ? []
      : useLocalAffinityFallback
        ? db.transactions.toArray()
        : db.transactions.where("customerId").equals(customerId).toArray(),
    [customerId, useLocalAffinityFallback],
    [],
  ) ?? [];
  const [serverRecommendations, setServerRecommendations] = useState<ServerPaceRecommendation[]>([]);
  const purchasedProductIds = useMemo(() => [...new Set(transactions.flatMap((transaction) =>
    transaction.customerId === customerId && (transaction.kind ?? "sale") === "sale" && transaction.isFinalized === 1
      ? transaction.items.map((item) => item.product.id)
      : [],
  ))].sort(), [customerId, transactions]);

  useEffect(() => {
    let active = true;
    if (!customerId || !storeId || storeIsDemo || !isSupabaseConfigured || purchasedProductIds.length === 0) {
      setServerRecommendations([]);
      return () => { active = false; };
    }
    void supabase.rpc("get_pace_product_recommendations", {
      target_store_id: storeId,
      purchased_product_external_ids: purchasedProductIds,
      result_limit: 6,
    }).then(({ data, error }) => {
      if (!active) return;
      if (error) {
        console.warn("Pace-affiniteiten laden mislukt; lokale fallback blijft actief", error);
        setServerRecommendations([]);
        return;
      }
      setServerRecommendations((data ?? []).flatMap((row) => row.product_external_id
        ? [{ productId: row.product_external_id, pairSaleCount: Number(row.pair_sale_count), confidence: Number(row.confidence) }]
        : []));
    });
    return () => { active = false; };
  }, [customerId, purchasedProductIds, storeId, storeIsDemo]);

  return useMemo(() => {
    if (!customerId || !merchant.customerInsightSettings?.enabled) return [];
    return buildCustomerInsights({
      customerId,
      transactions,
      products,
      policy: merchant.commercialReturnPolicy,
      settings: merchant.customerInsightSettings,
      timezone: merchant.timezone,
      serverRecommendations,
    });
  }, [customerId, merchant.commercialReturnPolicy, merchant.customerInsightSettings, merchant.timezone, products, serverRecommendations, transactions]);
};
