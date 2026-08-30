import { supabase } from "../lib/supabase";
import type {
  FinancialCost,
  FinancialSettings,
  FinancialWorkspaceMutation,
} from "../types";
import type { Json } from "../types/database.generated";

type RpcResult = Promise<{ data: Json | null; error: { message?: string } | null }>;
type FinancialRpcClient = {
  rpc: (
    name: "get_owner_financial_workspace" | "mutate_owner_financial_workspace",
    args: Record<string, string | Json>,
  ) => RpcResult;
};

const client = supabase as unknown as FinancialRpcClient;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const isIsoDate = (value: unknown): value is string =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

const parseCost = (value: unknown): FinancialCost | null => {
  if (!isRecord(value)) return null;
  const vatRate = Number(value.vatRate);
  const cost: FinancialCost = {
    id: String(value.id ?? ""),
    kind: value.kind === "one-off" ? "one-off" : "recurring",
    name: String(value.name ?? "").trim(),
    category: String(value.category ?? "other"),
    customCategory:
      typeof value.customCategory === "string" && value.customCategory.trim()
        ? value.customCategory.trim()
        : undefined,
    supplier:
      typeof value.supplier === "string" && value.supplier.trim()
        ? value.supplier.trim()
        : undefined,
    documentNumber:
      typeof value.documentNumber === "string" && value.documentNumber.trim()
        ? value.documentNumber.trim()
        : undefined,
    amountCents: Number(value.amountCents),
    amountMode:
      value.amountMode === "including-vat" ? "including-vat" : "excluding-vat",
    vatRate: [0, 6, 12, 21].includes(vatRate)
      ? (vatRate as FinancialCost["vatRate"])
      : 0,
    vatRecoverablePercent: Number(value.vatRecoverablePercent),
    behavior: value.behavior === "variable" ? "variable" : "fixed",
    frequency: ["once", "monthly", "quarterly", "yearly"].includes(
      String(value.frequency),
    )
      ? (value.frequency as FinancialCost["frequency"])
      : "monthly",
    startDate: String(value.startDate ?? ""),
    endDate: isIsoDate(value.endDate) ? value.endDate : undefined,
    status: value.status === "archived" ? "archived" : "active",
    createdAt: String(value.createdAt ?? ""),
    updatedAt: String(value.updatedAt ?? ""),
    source: value.source === "demo" ? "demo" : "live",
  };
  if (
    !cost.id ||
    !cost.name ||
    !isIsoDate(cost.startDate) ||
    !Number.isSafeInteger(cost.amountCents) ||
    cost.amountCents < 0 ||
    !Number.isInteger(cost.vatRecoverablePercent) ||
    cost.vatRecoverablePercent < 0 ||
    cost.vatRecoverablePercent > 100 ||
    !Number.isFinite(Date.parse(cost.createdAt)) ||
    !Number.isFinite(Date.parse(cost.updatedAt))
  ) return null;
  return cost;
};

const parseSettings = (value: unknown): FinancialSettings => {
  if (!isRecord(value)) {
    return { id: "store", safetyBufferCents: 0, updatedAt: new Date(0).toISOString() };
  }
  const safetyBufferCents = Number(value.safetyBufferCents);
  return {
    id: "store",
    safetyBufferCents:
      Number.isSafeInteger(safetyBufferCents) && safetyBufferCents >= 0
        ? safetyBufferCents
        : 0,
    updatedAt: Number.isFinite(Date.parse(String(value.updatedAt ?? "")))
      ? String(value.updatedAt)
      : new Date(0).toISOString(),
  };
};

export const fetchOwnerFinancialWorkspace = async (
  storeId: string,
): Promise<{ costs: FinancialCost[]; settings: FinancialSettings }> => {
  const { data, error } = await client.rpc("get_owner_financial_workspace", {
    target_store_id: storeId,
  });
  if (error) throw new Error(error.message || "Financiële gegevens konden niet worden geladen.");
  if (!isRecord(data)) throw new Error("De financiële serverrespons is ongeldig.");
  return {
    costs: Array.isArray(data.costs)
      ? data.costs.map(parseCost).filter((cost): cost is FinancialCost => cost != null)
      : [],
    settings: parseSettings(data.settings),
  };
};

export const pushFinancialWorkspaceMutation = async (
  storeId: string,
  mutation: FinancialWorkspaceMutation,
): Promise<void> => {
  const { error } = await client.rpc("mutate_owner_financial_workspace", {
    target_store_id: storeId,
    mutation_payload: JSON.parse(JSON.stringify(mutation)) as Json,
  });
  if (error) throw new Error(error.message || "Financiële wijziging kon niet worden gesynchroniseerd.");
};
