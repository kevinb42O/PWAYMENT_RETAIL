import { supabase } from "../lib/supabase";

export type PlatformRole =
  | "superadmin"
  | "operations"
  | "support"
  | "billing"
  | "read_only";

export interface PlatformSession {
  user_id: string;
  role: PlatformRole;
  scopes: string[];
  mfa_verified_at: string | null;
}

export interface PlatformIncident {
  id: string;
  title: string;
  severity: "p1" | "p2" | "p3" | "p4";
  status: string;
  affected_store_count: number;
  last_seen_at: string;
}

export type PlatformHealthStatus =
  | "not_activated"
  | "healthy"
  | "at_risk"
  | "critical"
  | "inactive"
  | "data_only";

export interface PlatformHealthSnapshot {
  status: PlatformHealthStatus;
  coverage_status: "not_activated" | "measured" | "server_data_only";
  primary_reason: string;
  recommended_action: string;
  last_seen_at: string | null;
  last_active_at: string | null;
  last_successful_sync_at: string | null;
  last_sync_issue_at: string | null;
  pending_queue_count: number;
  oldest_queue_age_seconds: number | null;
  failed_sync_count_24h: number;
  open_incident_count: number;
  calculated_at: string;
}

export interface PlatformOverview {
  metrics: {
    active_stores_24h: number;
    critical_incidents: number;
    sync_at_risk: number;
    financial_failures_24h: number;
    subscriptions: { trialing: number; active: number; past_due: number };
    health: Record<PlatformHealthStatus, number>;
  };
  incidents: PlatformIncident[];
  priority_stores: Array<{
    store_id: string;
    store_name: string;
    health_status: PlatformHealthStatus;
    primary_reason: string;
    recommended_action: string;
    last_sync_at: string | null;
    pending_queue_count: number;
  }>;
}

export interface PlatformStore {
  id: string;
  name: string;
  is_demo: boolean;
  created_at: string;
  plan_code: string | null;
  subscription_status: string | null;
  last_active_at: string | null;
  last_sync_at: string | null;
  health_status: PlatformHealthStatus;
  health_reason: string;
  data_coverage_status: "not_activated" | "measured" | "server_data_only";
  open_incidents: number;
  pending_queue_count: number;
}

export interface PlatformStoreDetail {
  store: {
    id: string;
    name: string;
    created_at: string;
    is_demo: boolean;
    country_code: string;
    locale: string;
    timezone: string;
  };
  subscription: {
    plan_code?: string;
    status?: string;
    trial_ends_at?: string | null;
    current_period_ends_at?: string | null;
  };
  activity: {
    last_active_at: string | null;
    last_sync_at: string | null;
    sales_30d: number;
    z_reports_30d: number;
    webshop_orders_30d: number;
    active_members: number;
    data_as_of: string | null;
  };
  health: PlatformHealthSnapshot;
  devices: Array<{
    installation_id: string;
    app_version: string | null;
    platform_family: string | null;
    last_seen_at: string;
  }>;
  recent_health_events: Array<{
    event_type: string;
    severity: "info" | "warning" | "error" | "critical";
    operation: string | null;
    error_code: string | null;
    error_fingerprint: string | null;
    occurred_at: string;
    metadata: Record<string, unknown>;
  }>;
  incidents: PlatformIncident[];
  support_access: boolean;
  active_support_grant: { id?: string; access_scope?: string; expires_at?: string };
}

export interface PlatformSupportSnapshot {
  store_contact: {
    legal_name?: string;
    email?: string;
    phone?: string;
    website?: string;
    city?: string;
  };
  active_members: Array<{ display_name: string; role: string }>;
  recent_audit: Array<{ occurred_at: string; action: string; user_name: string | null; source: string }>;
}

export interface PlatformIncidentDetail extends PlatformIncident {
  operation: string | null;
  first_seen_at: string;
  resolution_note: string | null;
  events: Array<{ event_type: string; note: string | null; occurred_at: string }>;
}

type RpcClient = {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{
    data: unknown;
    error: { message: string; code?: string } | null;
  }>;
};

const rpc = supabase as unknown as RpcClient;

const call = async <T>(fn: string, args?: Record<string, unknown>): Promise<T> => {
  const { data, error } = await rpc.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
};

export const getPlatformSession = () => call<PlatformSession>("get_platform_session");
export const getPlatformOverview = () => call<PlatformOverview>("platform_get_overview");
export const refreshPlatformHealthSnapshots = () =>
  call<number>("platform_refresh_store_health_snapshots");
export const listPlatformStores = (searchTerm: string, healthFilter: string) =>
  call<{ items: PlatformStore[] }>("platform_list_stores", {
    search_term: searchTerm.trim() || null,
    health_filter: healthFilter || null,
    page_limit: 100,
  });
export const getPlatformStoreDetail = (storeId: string) =>
  call<PlatformStoreDetail>("platform_get_store_detail", { target_store_id: storeId });
export const getPlatformSupportSnapshot = (storeId: string) =>
  call<PlatformSupportSnapshot>("platform_get_support_snapshot", { target_store_id: storeId });
export const requestSupportAccess = (
  storeId: string,
  reason: string,
  consentConfirmed: boolean,
) =>
  call<{ id: string; expires_at: string; access_scope: string }>(
    "platform_request_support_access",
    {
      target_store_id: storeId,
      access_reason: reason,
      consent_confirmed: consentConfirmed,
      requested_scope: "read_only",
    },
  );
export const revokeSupportAccess = (grantId: string) =>
  call<void>("platform_revoke_support_access", { grant_id: grantId });
export const listPlatformIncidents = (statusFilter = "", severityFilter = "") =>
  call<{ items: PlatformIncidentDetail[] }>("platform_list_incidents", {
    status_filter: statusFilter || null,
    severity_filter: severityFilter || null,
    page_limit: 100,
  });
export const updatePlatformIncident = (
  incidentId: string,
  status: "acknowledged" | "investigating" | "mitigated" | "resolved" | "false_positive",
  note?: string,
) =>
  call<{ id: string; status: string; updated_at: string }>("platform_update_incident", {
    target_incident_id: incidentId,
    next_status: status,
    operator_note: note?.trim() || null,
  });
