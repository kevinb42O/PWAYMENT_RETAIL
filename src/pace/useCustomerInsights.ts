import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db/db";
import type { Product } from "../types";
import type { MerchantInfo } from "../data/merchant";
import { buildCustomerInsights } from "./customerInsights";

export const useCustomerInsights = (
  customerId: string | null,
  products: Product[],
  merchant: MerchantInfo,
) => useLiveQuery(async () => {
  if (!customerId || !merchant.customerInsightSettings?.enabled) return [];
  const transactions = await db.transactions.where("customerId").equals(customerId).toArray();
  return buildCustomerInsights({
    customerId,
    transactions,
    products,
    policy: merchant.commercialReturnPolicy,
    settings: merchant.customerInsightSettings,
    timezone: merchant.timezone,
  });
}, [customerId, products, merchant.commercialReturnPolicy, merchant.customerInsightSettings, merchant.timezone], []) ?? [];
