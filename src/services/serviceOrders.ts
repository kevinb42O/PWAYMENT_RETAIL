import { audit, useAuth } from "../auth/useAuth";
import { db } from "../db/db";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import type { ServiceOrder, ServiceOrderEvent } from "../types";
import type { Json } from "../types/database.generated";
import { canUseFeature, FEATURE_KEYS } from "../billing/entitlements";

export interface PublicServiceOrder {
  number: string;
  createdAt: number;
  updatedAt: number;
  promisedAt?: number;
  status: ServiceOrder["status"];
  substatus: string;
  route: ServiceOrder["route"];
  customerName: string;
  assetType: string;
  brand?: string;
  model?: string;
  issue: string;
  totalCents: number;
  paidCents: number;
  events: ServiceOrderEvent[];
  merchantSnapshot: ServiceOrder["merchantSnapshot"];
}

const publicStorageKey = (trackingToken: string): string =>
  `pwayment:service-track:${trackingToken}`;

export const toPublicServiceOrder = (order: ServiceOrder): PublicServiceOrder => ({
  number: order.number,
  createdAt: order.createdAt,
  updatedAt: order.updatedAt,
  promisedAt: order.promisedAt,
  status: order.status,
  substatus: order.substatus,
  route: order.route,
  customerName: order.customerName,
  assetType: order.assetType,
  brand: order.brand,
  model: order.model,
  issue: order.issue,
  totalCents: order.totalCents,
  paidCents: order.paidCents,
  events: order.events
    .filter((event) => event.type === "created" || event.type === "status")
    .map(({ userId: _userId, userName: _userName, ...event }) => event),
  merchantSnapshot: order.merchantSnapshot,
});

const remotePayload = (order: ServiceOrder): Json => ({
  ...order,
  attachments: order.attachments.map(({ dataUrl: _dataUrl, ...attachment }) => attachment),
}) as unknown as Json;

type ServiceRpcClient = {
  rpc: (
    name: "save_service_order" | "list_service_orders" | "get_public_service_order",
    args: Record<string, string | Json>,
  ) => Promise<{ data: Json | null; error: { message: string } | null }>;
};

const serviceRpc = supabase as unknown as ServiceRpcClient;

export const persistServiceOrder = async (
  order: ServiceOrder,
  auditAction: "service_order.create" | "service_order.update" | "service_order.status",
): Promise<{ remote: boolean }> => {
  if (auditAction === "service_order.create" && !canUseFeature(FEATURE_KEYS.serviceOrders)) {
    throw new Error("entitlement:plan-required:service.orders");
  }
  if (
    auditAction === "service_order.create" &&
    order.attachments.length > 0 &&
    !canUseFeature(FEATURE_KEYS.serviceAttachments)
  ) {
    throw new Error("entitlement:plan-required:service.attachments");
  }
  await db.service_orders.put(order);
  try {
    globalThis.localStorage?.setItem(
      publicStorageKey(order.trackingToken),
      JSON.stringify(toPublicServiceOrder(order)),
    );
  } catch {
    // Local public tracking remains best-effort in hardened browser contexts.
  }
  await audit(auditAction, {
    serviceOrderId: order.id,
    number: order.number,
    status: order.status,
  });

  const storeId = useAuth.getState().currentStoreId;
  if (!storeId || !isSupabaseConfigured) return { remote: false };
  try {
    const { error } = await serviceRpc.rpc("save_service_order", {
      target_store_id: storeId,
      order_payload: remotePayload(order),
    });
    if (error) throw new Error(error.message);
    return { remote: true };
  } catch (error) {
    // The order is already safely persisted locally; a later edit retries the remote copy.
    console.warn("service order remote save failed", error);
    return { remote: false };
  }
};

const isServiceOrder = (value: unknown): value is ServiceOrder =>
  Boolean(
    value &&
      typeof value === "object" &&
      "id" in value &&
      "trackingToken" in value &&
      "events" in value,
  );

export const hydrateRemoteServiceOrders = async (): Promise<number> => {
  const storeId = useAuth.getState().currentStoreId;
  if (!storeId || !isSupabaseConfigured) return 0;
  try {
    const { data, error } = await serviceRpc.rpc("list_service_orders", {
      target_store_id: storeId,
    });
    if (error) throw new Error(error.message);
    const rows = (Array.isArray(data) ? data.filter(isServiceOrder) : []) as unknown as ServiceOrder[];
    if (rows.length > 0) await db.service_orders.bulkPut(rows);
    return rows.length;
  } catch (error) {
    console.warn("service order remote hydration failed", error);
    return 0;
  }
};

const parsePublicOrder = (value: unknown): PublicServiceOrder | null => {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<PublicServiceOrder>;
  if (!candidate.number || !candidate.status || !candidate.merchantSnapshot) return null;
  return candidate as PublicServiceOrder;
};

export const getPublicServiceOrder = async (
  trackingToken: string,
): Promise<PublicServiceOrder | null> => {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await serviceRpc.rpc("get_public_service_order", {
        tracking_token: trackingToken,
      });
      if (!error) {
        const parsed = parsePublicOrder(data);
        if (parsed) return parsed;
      }
    } catch {
      // A same-device local fallback is available below.
    }
  }
  try {
    const raw = globalThis.localStorage?.getItem(publicStorageKey(trackingToken));
    return raw ? parsePublicOrder(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
};
