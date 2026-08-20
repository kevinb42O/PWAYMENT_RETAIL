import { db } from "../db/db";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

export type PlatformHealthEventType =
  | "app.started"
  | "app.heartbeat"
  | "sync.completed"
  | "sync.retrying"
  | "sync.failed_permanent"
  | "rpc.failed"
  | "checkout.completed"
  | "z_report.completed"
  | "webshop_order.failed"
  | "device.capability_failed";

export interface PlatformHealthMetadata {
  queue_depth?: number;
  oldest_queue_age_seconds?: number;
  attempts?: number;
  online?: boolean;
  retrying_queue_depth?: number;
  dead_letter_queue_depth?: number;
}

type TelemetryRpc = {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ error: unknown }>;
};

const telemetryClient = supabase as unknown as TelemetryRpc;
const eventCooldowns = new Map<string, number>();
const HEARTBEAT_INTERVAL_MS = 60_000;

const installationKey = (storeId: string) => `pwayment:installation:${storeId}`;

const installationIdFor = (storeId: string) => {
  const key = installationKey(storeId);
  const existing = globalThis.localStorage?.getItem(key);
  if (existing) return existing;
  const created = globalThis.crypto.randomUUID();
  globalThis.localStorage?.setItem(key, created);
  return created;
};

const platformFamily = () => {
  const agent = globalThis.navigator?.userAgent ?? "";
  if (/Edg\//.test(agent)) return "Edge";
  if (/Firefox\//.test(agent)) return "Firefox";
  if (/Chrome\//.test(agent)) return "Chrome";
  if (/Safari\//.test(agent)) return "Safari";
  return "Unknown";
};

/**
 * Sends only allow-listed operational measurements. Raw errors, customer data,
 * payment data and URLs are deliberately not accepted by this API.
 */
export const reportPlatformHealth = async ({
  storeId,
  eventType,
  severity = "info",
  operation,
  errorCode,
  errorFingerprint,
  metadata,
}: {
  storeId: string | null | undefined;
  eventType: PlatformHealthEventType;
  severity?: "info" | "warning" | "error" | "critical";
  operation?: string;
  errorCode?: string;
  errorFingerprint?: string;
  metadata?: PlatformHealthMetadata;
}): Promise<void> => {
  if (!storeId || !isSupabaseConfigured) return;
  try {
    const { error } = await telemetryClient.rpc("record_platform_health_event", {
      payload: {
        store_id: storeId,
        client_event_id: globalThis.crypto.randomUUID(),
        installation_id: installationIdFor(storeId),
        event_type: eventType,
        severity,
        app_version: import.meta.env.VITE_APP_VERSION ?? "unversioned",
        platform_family: platformFamily(),
        operation: operation?.slice(0, 120),
        error_code: errorCode?.slice(0, 80),
        error_fingerprint: errorFingerprint?.slice(0, 128),
        metadata,
        occurred_at: new Date().toISOString(),
      },
    });
    if (error) console.warn("platform telemetry rejected", error);
  } catch (error) {
    // Observability is never allowed to break the retail workflow.
    console.warn("platform telemetry unavailable", error);
  }
};

/**
 * A compact, privacy-safe summary of the local delivery state. It is sent with
 * heartbeats and sync outcomes so the platform can distinguish "offline" from
 * "there is work waiting to be confirmed".
 */
export const getOutboxHealthMetadata = async (): Promise<PlatformHealthMetadata> => {
  const entries = await db.outbox.toArray();
  const oldest = entries.reduce<typeof entries[number] | undefined>(
    (current, entry) => !current || entry.timestamp < current.timestamp ? entry : current,
    undefined,
  );
  const retrying = entries.filter((entry) => entry.deliveryStatus === "retrying").length;
  const deadLetters = entries.filter((entry) => entry.deliveryStatus === "dead_letter").length;
  return {
    queue_depth: entries.length,
    oldest_queue_age_seconds: oldest
      ? Math.max(0, Math.floor((Date.now() - oldest.timestamp) / 1000))
      : 0,
    online: globalThis.navigator?.onLine !== false,
    retrying_queue_depth: retrying,
    dead_letter_queue_depth: deadLetters,
  };
};

const reportHeartbeat = async (storeId: string, force = false) => {
  const key = `${storeId}:app.heartbeat`;
  const now = Date.now();
  const previous = eventCooldowns.get(key) ?? 0;
  if (!force && now - previous < HEARTBEAT_INTERVAL_MS - 2_000) return;
  eventCooldowns.set(key, now);
  await reportPlatformHealth({
    storeId,
    eventType: "app.heartbeat",
    metadata: await getOutboxHealthMetadata(),
  });
};

/**
 * Starts one lifecycle monitor for the unlocked store session. A heartbeat is
 * deliberately generated only while the document is visible; background tabs
 * should not make a closed shop look active.
 */
export const startPlatformHealthMonitoring = (storeId: string): (() => void) => {
  let disposed = false;
  const sendStart = async () => {
    await reportPlatformHealth({
      storeId,
      eventType: "app.started",
      metadata: await getOutboxHealthMetadata(),
    });
  };
  const heartbeat = () => {
    if (disposed || globalThis.document?.visibilityState === "hidden") return;
    void reportHeartbeat(storeId);
  };
  const onVisibilityChange = () => {
    if (globalThis.document?.visibilityState === "visible") {
      void reportHeartbeat(storeId, true);
    }
  };
  const onOnline = () => void reportHeartbeat(storeId, true);

  void sendStart();
  const interval = globalThis.setInterval(heartbeat, HEARTBEAT_INTERVAL_MS);
  globalThis.document?.addEventListener("visibilitychange", onVisibilityChange);
  globalThis.window?.addEventListener("online", onOnline);

  return () => {
    disposed = true;
    globalThis.clearInterval(interval);
    globalThis.document?.removeEventListener("visibilitychange", onVisibilityChange);
    globalThis.window?.removeEventListener("online", onOnline);
  };
};

export const safeErrorFingerprint = (operation: string, error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  // A bounded deterministic hash prevents raw backend text or accidental PII
  // entering operational telemetry while still grouping equivalent failures.
  let hash = 2166136261;
  for (const char of `${operation}:${message}`.slice(0, 600)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `${operation}:${(hash >>> 0).toString(16)}`;
};
