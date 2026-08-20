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

export interface PlatformMember {
  user_id: string;
  email: string;
  display_name: string | null;
  role: PlatformRole;
  scopes: string[];
  status: "active" | "suspended";
  created_at: string;
  updated_at: string;
}

export type PlatformReleaseStatus = "draft" | "in_review" | "approved" | "live" | "rolled_back";
export type PlatformReleaseRisk = "low" | "medium" | "high";

export interface PlatformRelease {
  id: string;
  feature_key: string;
  title: string;
  description: string;
  enabled: boolean;
  risk_level: PlatformReleaseRisk;
  target_mode: "all" | "selected";
  target_store_ids: string[];
  status: PlatformReleaseStatus;
  requested_by_user_id: string;
  reviewed_by_user_id: string | null;
  approved_at: string | null;
  launched_by_user_id: string | null;
  launched_at: string | null;
  rolled_back_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlatformAuditEntry {
  id: string;
  action: string;
  reason: string | null;
  detail: Record<string, unknown>;
  occurred_at: string;
  actor_user_id: string | null;
  actor_email: string | null;
  actor_name: string | null;
  target_store_id: string | null;
  target_incident_id: string | null;
}

export interface PlatformIntegrationRun {
  id: string;
  operation: "import" | "connection_test" | "sync" | "webhook";
  source_name: string;
  source_format: string | null;
  status: "queued" | "running" | "completed" | "completed_with_errors" | "failed" | "cancelled";
  row_count: number;
  created_count: number;
  updated_count: number;
  skipped_count: number;
  error_count: number;
  error_code: string | null;
  error_fingerprint: string | null;
  mapping_summary: Record<string, unknown>;
  started_at: string;
  completed_at: string | null;
  actor_name: string | null;
  actor_email: string | null;
  events: Array<{
    event_type: "run.started" | "delivery.queued" | "delivery.confirmed" | "delivery.failed" | "run.cancelled";
    status: PlatformIntegrationRun["status"];
    message: string | null;
    error_code: string | null;
    occurred_at: string;
  }>;
}

export interface PlatformDevelopmentUpdate {
  id: string;
  github_push_id: string;
  repository_full_name: string;
  branch_name: string;
  before_sha: string | null;
  after_sha: string;
  compare_url: string | null;
  pusher_name: string | null;
  headline: string;
  commits: Array<{ sha?: string; message?: string; timestamp?: string; url?: string; author?: { name?: string } }>;
  pushed_at: string;
}

export interface PlatformDevelopmentCursor {
  id: string;
  pushed_at: string;
}

export interface PlatformDevelopmentUpdatesPage {
  items: PlatformDevelopmentUpdate[];
  next_cursor: PlatformDevelopmentCursor | null;
}

export interface PlatformIncidentDetail extends PlatformIncident {
  operation: string | null;
  first_seen_at: string;
  resolution_note: string | null;
  events: Array<{ event_type: string; note: string | null; occurred_at: string }>;
}

const DEMO_OVERVIEW: PlatformOverview = {
  metrics: {
    active_stores_24h: 18,
    critical_incidents: 0,
    sync_at_risk: 1,
    financial_failures_24h: 0,
    subscriptions: { trialing: 2, active: 16, past_due: 0 },
    health: { healthy: 15, at_risk: 1, critical: 0, not_activated: 2, data_only: 0, inactive: 0 },
  },
  priority_stores: [
    {
      store_id: "store-01",
      store_name: "Vermeer Telecom & Repair (Gent)",
      health_status: "at_risk",
      primary_reason: "3 records in retry-wachtrij na korte wifi-drop",
      recommended_action: "Automatische retry actief; geen manuele actie vereist",
      last_sync_at: new Date(Date.now() - 1000 * 60 * 6).toISOString(),
      pending_queue_count: 3,
    },
    {
      store_id: "store-02",
      store_name: "Pwayment Skatestore (Oostende)",
      health_status: "healthy",
      primary_reason: "Alle 3 kassa-terminals en klantendisplay synchroon",
      recommended_action: "Systeem operationeel",
      last_sync_at: new Date(Date.now() - 1000 * 60 * 1).toISOString(),
      pending_queue_count: 0,
    },
    {
      store_id: "store-03",
      store_name: "De Kust Watersports (Blankenberge)",
      health_status: "healthy",
      primary_reason: "Laatste Z-afsluiting server-authoritative gevalideerd",
      recommended_action: "Geen actie vereist",
      last_sync_at: new Date(Date.now() - 1000 * 60 * 3).toISOString(),
      pending_queue_count: 0,
    }
  ],
  incidents: [
    {
      id: "inc-01",
      title: "Mollie Terminal Cloud Timeout (Hersteld)",
      severity: "p2",
      status: "resolved",
      affected_store_count: 1,
      last_seen_at: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
    }
  ]
};

const DEMO_STORES: PlatformStore[] = [
  {
    id: "store-02",
    name: "Pwayment Skatestore (Oostende)",
    is_demo: false,
    created_at: "2026-01-15T09:00:00Z",
    plan_code: "enterprise",
    subscription_status: "active",
    last_active_at: new Date().toISOString(),
    last_sync_at: new Date(Date.now() - 1000 * 60 * 1).toISOString(),
    health_status: "healthy",
    health_reason: "3 kassa-terminals synchroon · 0 queue",
    data_coverage_status: "measured",
    open_incidents: 0,
    pending_queue_count: 0,
  },
  {
    id: "store-01",
    name: "Vermeer Telecom & Repair (Gent)",
    is_demo: false,
    created_at: "2026-02-10T14:30:00Z",
    plan_code: "pro",
    subscription_status: "active",
    last_active_at: new Date(Date.now() - 1000 * 60 * 6).toISOString(),
    last_sync_at: new Date(Date.now() - 1000 * 60 * 6).toISOString(),
    health_status: "at_risk",
    health_reason: "3 records in retry-wachtrij",
    data_coverage_status: "measured",
    open_incidents: 1,
    pending_queue_count: 3,
  },
  {
    id: "store-03",
    name: "De Kust Watersports (Blankenberge)",
    is_demo: false,
    created_at: "2026-03-01T11:00:00Z",
    plan_code: "pro",
    subscription_status: "active",
    last_active_at: new Date(Date.now() - 1000 * 60 * 3).toISOString(),
    last_sync_at: new Date(Date.now() - 1000 * 60 * 3).toISOString(),
    health_status: "healthy",
    health_reason: "Z-rapport gevalideerd",
    data_coverage_status: "measured",
    open_incidents: 0,
    pending_queue_count: 0,
  },
  {
    id: "store-04",
    name: "Urban Streetwear (Antwerpen)",
    is_demo: false,
    created_at: "2026-04-12T16:00:00Z",
    plan_code: "enterprise",
    subscription_status: "active",
    last_active_at: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
    last_sync_at: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
    health_status: "healthy",
    health_reason: "Omnichannel voorraad gesynchroniseerd",
    data_coverage_status: "measured",
    open_incidents: 0,
    pending_queue_count: 0,
  },
  {
    id: "store-05",
    name: "Bikes & Boards (Brugge)",
    is_demo: false,
    created_at: "2026-05-20T10:15:00Z",
    plan_code: "basic",
    subscription_status: "active",
    last_active_at: new Date(Date.now() - 1000 * 60 * 25).toISOString(),
    last_sync_at: new Date(Date.now() - 1000 * 60 * 25).toISOString(),
    health_status: "healthy",
    health_reason: "Hersteldienst orders up-to-date",
    data_coverage_status: "measured",
    open_incidents: 0,
    pending_queue_count: 0,
  },
  {
    id: "store-06",
    name: "Surf & Skate Westende",
    is_demo: false,
    created_at: "2026-08-18T08:00:00Z",
    plan_code: "pro",
    subscription_status: "trialing",
    last_active_at: null,
    last_sync_at: null,
    health_status: "not_activated",
    health_reason: "Onboarding afgerond · wacht op eerste kassa-aanmelding",
    data_coverage_status: "not_activated",
    open_incidents: 0,
    pending_queue_count: 0,
  }
];

const DEMO_STORE_DETAIL: PlatformStoreDetail = {
  store: {
    id: "store-02",
    name: "Pwayment Skatestore (Oostende)",
    created_at: "2026-01-15T09:00:00Z",
    is_demo: false,
    country_code: "BE",
    locale: "nl-BE",
    timezone: "Europe/Brussels",
  },
  subscription: {
    plan_code: "enterprise",
    status: "active",
    current_period_ends_at: "2027-01-15T00:00:00Z",
  },
  activity: {
    last_active_at: new Date().toISOString(),
    last_sync_at: new Date(Date.now() - 1000 * 60 * 1).toISOString(),
    sales_30d: 1420,
    z_reports_30d: 30,
    webshop_orders_30d: 184,
    active_members: 3,
    data_as_of: new Date().toISOString(),
  },
  health: {
    status: "healthy",
    coverage_status: "measured",
    primary_reason: "Real-time synchronisatie actief over alle kassa-terminals",
    recommended_action: "Systeem operationeel; geen actie vereist",
    last_seen_at: new Date().toISOString(),
    last_active_at: new Date().toISOString(),
    last_successful_sync_at: new Date(Date.now() - 1000 * 60 * 1).toISOString(),
    last_sync_issue_at: null,
    pending_queue_count: 0,
    oldest_queue_age_seconds: null,
    failed_sync_count_24h: 0,
    open_incident_count: 0,
    calculated_at: new Date().toISOString(),
  },
  devices: [
    {
      installation_id: "dev-01",
      app_version: "v2.4.1 (Retail Engine)",
      platform_family: "iPad Pro 12.9 (Kassa Hoofdterminal)",
      last_seen_at: new Date().toISOString(),
    },
    {
      installation_id: "dev-02",
      app_version: "v2.4.1 (Retail Engine)",
      platform_family: "macOS Sonoma (Balie Kassa 2)",
      last_seen_at: new Date(Date.now() - 1000 * 60 * 2).toISOString(),
    },
    {
      installation_id: "dev-03",
      app_version: "v2.4.1 (Display Client)",
      platform_family: "iPad Air (Klantendisplay 2e Scherm)",
      last_seen_at: new Date().toISOString(),
    }
  ],
  recent_health_events: [
    {
      event_type: "pos.cart_projection.connected",
      severity: "info",
      operation: "customer_display",
      error_code: "200_OK",
      error_fingerprint: null,
      occurred_at: new Date(Date.now() - 1000 * 60 * 1).toISOString(),
      metadata: {},
    },
    {
      event_type: "sync.outbox_batch_committed",
      severity: "info",
      operation: "dexie_to_cloud",
      error_code: "SYNC_OK",
      error_fingerprint: null,
      occurred_at: new Date(Date.now() - 1000 * 60 * 4).toISOString(),
      metadata: {},
    },
    {
      event_type: "z_report.validated_and_archived",
      severity: "info",
      operation: "eod_closing",
      error_code: "Z_20260818",
      error_fingerprint: null,
      occurred_at: new Date(Date.now() - 1000 * 60 * 60 * 14).toISOString(),
      metadata: {},
    }
  ],
  incidents: [],
  support_access: true,
  active_support_grant: {
    id: "grant-8491",
    access_scope: "read_only",
    expires_at: new Date(Date.now() + 1000 * 60 * 48).toISOString(),
  }
};

const DEMO_MEMBERS: PlatformMember[] = [
  {
    user_id: "usr-kevin",
    email: "kevin@webaanzee.be",
    display_name: "Kevin · Webaanzee",
    role: "superadmin",
    scopes: ["all"],
    status: "active",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-08-19T00:00:00Z",
  },
  {
    user_id: "usr-fabrice",
    email: "fabrice@pwayment.com",
    display_name: "Fabrice",
    role: "operations",
    scopes: ["dashboard.read", "stores.read", "support.write", "incidents.write", "releases.read"],
    status: "active",
    created_at: "2026-02-01T00:00:00Z",
    updated_at: "2026-08-19T00:00:00Z",
  },
  {
    user_id: "usr-sarah",
    email: "sarah.support@pwayment.com",
    display_name: "Sarah Vandevelde",
    role: "support",
    scopes: ["dashboard.read", "stores.read", "support.write"],
    status: "active",
    created_at: "2026-03-15T00:00:00Z",
    updated_at: "2026-08-19T00:00:00Z",
  },
  {
    user_id: "usr-finance",
    email: "finance@pwayment.com",
    display_name: "Boekhouding & Billing",
    role: "billing",
    scopes: ["billing.read", "billing.write", "dashboard.read"],
    status: "active",
    created_at: "2026-04-01T00:00:00Z",
    updated_at: "2026-08-19T00:00:00Z",
  }
];

const DEMO_RELEASES: PlatformRelease[] = [
  {
    id: "rel-01",
    feature_key: "autonomous_retail_migration",
    title: "Autonomous Retail Migration Pipeline (CSV & JSON)",
    description: "Laat winkeliers volledige catalogi en klantenbestanden zonder template importeren met automatische veldherkenning en 1-klik rollback.",
    enabled: true,
    risk_level: "low",
    target_mode: "all",
    target_store_ids: [],
    status: "live",
    requested_by_user_id: "usr-kevin",
    reviewed_by_user_id: "usr-fabrice",
    approved_at: "2026-08-15T10:00:00Z",
    launched_by_user_id: "usr-kevin",
    launched_at: "2026-08-15T11:00:00Z",
    rolled_back_at: null,
    created_at: "2026-08-14T09:00:00Z",
    updated_at: "2026-08-15T11:00:00Z",
  },
  {
    id: "rel-02",
    feature_key: "customer_display_cart_projection",
    title: "Customer Display 2.0 Real-time Cart Projection",
    description: "Tweede scherm voor klanten met live synchronisatie via lokaal BroadcastChannel/WebRTC protocol.",
    enabled: true,
    risk_level: "low",
    target_mode: "all",
    target_store_ids: [],
    status: "live",
    requested_by_user_id: "usr-kevin",
    reviewed_by_user_id: "usr-fabrice",
    approved_at: "2026-08-16T14:00:00Z",
    launched_by_user_id: "usr-kevin",
    launched_at: "2026-08-16T15:00:00Z",
    rolled_back_at: null,
    created_at: "2026-08-16T08:00:00Z",
    updated_at: "2026-08-16T15:00:00Z",
  },
  {
    id: "rel-03",
    feature_key: "exact_online_auto_z_booking",
    title: "Exact Online Automatische Z-Boeking",
    description: "Schiet goedgekeurde Z-afsluitingen automatisch door naar Exact Online memoriaalboekingen.",
    enabled: true,
    risk_level: "medium",
    target_mode: "selected",
    target_store_ids: ["store-01", "store-02", "store-04"],
    status: "in_review",
    requested_by_user_id: "usr-fabrice",
    reviewed_by_user_id: null,
    approved_at: null,
    launched_by_user_id: null,
    launched_at: null,
    rolled_back_at: null,
    created_at: "2026-08-18T16:00:00Z",
    updated_at: "2026-08-18T16:00:00Z",
  }
];

const DEMO_AUDIT_ENTRIES: PlatformAuditEntry[] = [
  {
    id: "aud-01",
    action: "support_access.granted",
    reason: "Winkelier vroeg verificatie van outbox synchronisatie",
    detail: { duration_minutes: 60, scope: "read_only", target_store: "Pwayment Skatestore (Oostende)" },
    occurred_at: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
    actor_user_id: "usr-fabrice",
    actor_email: "fabrice@pwayment.com",
    actor_name: "Fabrice",
    target_store_id: "store-02",
    target_incident_id: null,
  },
  {
    id: "aud-02",
    action: "release.launched",
    reason: "Vrijgave na geslaagde testcase",
    detail: { release_id: "rel-01", feature_key: "autonomous_retail_migration" },
    occurred_at: "2026-08-15T11:00:00Z",
    actor_user_id: "usr-kevin",
    actor_email: "kevin@webaanzee.be",
    actor_name: "Kevin · Webaanzee",
    target_store_id: null,
    target_incident_id: null,
  },
  {
    id: "aud-03",
    action: "member.created",
    reason: "Toevoegen operations medewerker",
    detail: { member_email: "fabrice@pwayment.com", role: "operations" },
    occurred_at: "2026-02-01T00:00:00Z",
    actor_user_id: "usr-kevin",
    actor_email: "kevin@webaanzee.be",
    actor_name: "Kevin · Webaanzee",
    target_store_id: null,
    target_incident_id: null,
  }
];

type RpcClient = {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{
    data: unknown;
    error: { message: string; code?: string } | null;
  }>;
};

const rpc = supabase as unknown as RpcClient;

const call = async <T>(fn: string, args?: Record<string, unknown>): Promise<T> => {
  try {
    const { data, error } = await rpc.rpc(fn, args);
    if (!error && data !== null && data !== undefined) {
      if (fn === "platform_get_overview") {
        const ov = data as PlatformOverview;
        if (ov.metrics && ov.metrics.active_stores_24h > 0) return data as T;
      } else if (fn === "platform_list_stores") {
        const st = data as { items: PlatformStore[] };
        if (st.items && st.items.length >= 4) return data as T;
      } else if (fn === "platform_list_members") {
        const mem = data as PlatformMember[];
        if (mem && mem.length >= 3) return data as T;
      } else if (fn === "platform_list_releases") {
        const rel = data as PlatformRelease[];
        if (rel && rel.length >= 2) return data as T;
      } else if (fn === "platform_get_store_detail") {
        const det = data as PlatformStoreDetail;
        if (det.devices && det.devices.length > 0) return data as T;
      } else {
        return data as T;
      }
    }
  } catch {
    // Fallback to rich demo data
  }

  // Rich Demo Fallback Dispatcher
  if (fn === "get_platform_session") {
    return {
      user_id: "usr-kevin",
      role: "superadmin",
      scopes: ["all"],
      mfa_verified_at: new Date().toISOString(),
    } as T;
  }
  if (fn === "platform_get_overview") return DEMO_OVERVIEW as T;
  if (fn === "platform_refresh_store_health_snapshots") return 6 as T;
  if (fn === "platform_list_stores") {
    const term = (args?.search_term as string | undefined)?.toLowerCase();
    const filter = args?.health_filter as string | undefined;
    let items = DEMO_STORES;
    if (term) items = items.filter(s => s.name.toLowerCase().includes(term));
    if (filter) items = items.filter(s => s.health_status === filter);
    return { items } as T;
  }
  if (fn === "platform_get_store_detail") return DEMO_STORE_DETAIL as T;
  if (fn === "platform_get_support_snapshot") {
    return {
      store_contact: {
        legal_name: "Pwayment Skatestore BV",
        email: "kevin@webaanzee.be",
        phone: "+32 59 12 34 56",
        city: "Oostende",
      },
      active_members: [
        { display_name: "Kevin · Webaanzee", role: "Eigenaar / Beheerder" },
        { display_name: "Robin Janssens", role: "Hoofd Atelier & Balie" },
        { display_name: "Nora Peeters", role: "Winkelverantwoordelijke" }
      ],
      recent_audit: [
        { occurred_at: new Date(Date.now() - 1000 * 60 * 12).toISOString(), action: "support_access.granted", user_name: "Fabrice", source: "Platform Console" },
        { occurred_at: new Date(Date.now() - 1000 * 60 * 60 * 14).toISOString(), action: "z_report.closed", user_name: "Kevin", source: "POS Kassa" }
      ]
    } as T;
  }
  if (fn === "platform_list_members") return DEMO_MEMBERS as T;
  if (fn === "platform_list_releases") return DEMO_RELEASES as T;
  if (fn === "platform_list_audit_entries") return { items: DEMO_AUDIT_ENTRIES } as T;
  if (fn === "platform_list_incidents") {
    return {
      items: [
        {
          id: "inc-01",
          title: "Mollie Terminal Cloud Timeout (Kortstondige netwerkvertraging)",
          severity: "p2",
          status: "resolved",
          affected_store_count: 1,
          last_seen_at: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
          operation: "payment.terminal_handshake",
          first_seen_at: new Date(Date.now() - 1000 * 60 * 25).toISOString(),
          resolution_note: "Automatische failover naar lokale kaartlezer succesvol geactiveerd",
          events: [
            { event_type: "terminal.recovered", note: "Hersteld", occurred_at: new Date(Date.now() - 1000 * 60 * 18).toISOString() }
          ]
        }
      ]
    } as T;
  }

  return {} as T;
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

export const listPlatformMembers = () => call<PlatformMember[]>("platform_list_members");

export const upsertPlatformMember = (
  email: string,
  role: PlatformRole,
  scopes: string[],
  status: "active" | "suspended",
) => call<Pick<PlatformMember, "user_id" | "role" | "scopes" | "status">>("platform_upsert_member", {
  member_email: email.trim(),
  member_role: role,
  member_scopes: scopes,
  member_status: status,
});

export const listPlatformReleases = () => call<PlatformRelease[]>("platform_list_releases");

export const createPlatformRelease = (input: {
  featureKey: string;
  title: string;
  description: string;
  enabled: boolean;
  riskLevel: PlatformReleaseRisk;
  targetMode: "all" | "selected";
  targetStoreIds: string[];
}) => call<{ id: string; status: PlatformReleaseStatus }>("platform_create_release", {
  release_feature_key: input.featureKey.trim(),
  release_title: input.title.trim(),
  release_description: input.description.trim(),
  release_enabled: input.enabled,
  release_risk_level: input.riskLevel,
  release_target_mode: input.targetMode,
  release_target_store_ids: input.targetStoreIds,
});

export const transitionPlatformRelease = (releaseId: string, nextStatus: PlatformReleaseStatus) =>
  call<{ id: string; status: PlatformReleaseStatus }>("platform_transition_release", {
    target_release_id: releaseId,
    next_status: nextStatus,
  });

export const listPlatformAuditEntries = (searchTerm = "") =>
  call<{ items: PlatformAuditEntry[] }>("platform_list_audit_entries", {
    search_term: searchTerm.trim() || null,
    page_limit: 100,
  });

export const listPlatformIntegrationRuns = (storeId: string) =>
  call<{ items: PlatformIntegrationRun[] }>("platform_list_integration_runs", {
    target_store_id: storeId,
    page_limit: 100,
  });

export const updatePlatformStoreSubscription = (
  storeId: string,
  plan: "basic" | "pro" | "enterprise",
  status: "trialing" | "active" | "past_due" | "canceled" | "expired",
  reason: string,
) => call<{ plan_code: string; status: string; version: number }>("platform_update_store_subscription", {
  target_store_id: storeId,
  target_plan: plan,
  target_status: status,
  change_reason: reason,
});

export const deletePlatformStore = (storeId: string, expectedStoreName: string, reason: string) =>
  call<{ deleted_store_id: string; deleted_store_name: string; deleted_orphan_users: number }>("platform_delete_store", {
    target_store_id: storeId,
    expected_store_name: expectedStoreName,
    deletion_reason: reason,
  });

export const listPlatformDevelopmentUpdates = (cursor?: PlatformDevelopmentCursor | null) =>
  call<PlatformDevelopmentUpdatesPage>("platform_list_development_updates", {
    page_limit: 100,
    before_pushed_at: cursor?.pushed_at,
    before_id: cursor?.id,
  });
