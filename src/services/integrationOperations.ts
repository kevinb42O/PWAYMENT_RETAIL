import { supabase } from "../lib/supabase";
import type { Json } from "../types/database.generated";

type IntegrationRpcClient = {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
};
const integrationRpc = supabase as unknown as IntegrationRpcClient;

export interface IntegrationRunTelemetry {
  storeId: string | null;
  runId: string;
  operation: "import" | "connection_test" | "sync" | "webhook";
  sourceName: string;
  sourceFormat?: string;
  status: "queued" | "running" | "completed" | "completed_with_errors" | "failed" | "cancelled";
  rowCount?: number;
  createdCount?: number;
  updatedCount?: number;
  skippedCount?: number;
  errorCount?: number;
  errorCode?: string;
  errorFingerprint?: string;
  mappingSummary?: Record<string, unknown>;
  /** A small, allow-listed lifecycle marker — never a raw import payload. */
  eventType?: "run.started" | "delivery.queued" | "delivery.confirmed" | "delivery.failed" | "run.cancelled";
  eventMessage?: string;
}

/** Best-effort operational telemetry: import success must never depend on it. */
export const recordIntegrationRun = async (run: IntegrationRunTelemetry): Promise<void> => {
  if (!run.storeId) return;
  const { error } = await integrationRpc.rpc("record_integration_run", {
    target_store_id: run.storeId,
    run_id: run.runId,
    run_operation: run.operation,
    run_source_name: run.sourceName,
    run_source_format: run.sourceFormat ?? null,
    run_status: run.status,
    run_row_count: run.rowCount ?? 0,
    run_created_count: run.createdCount ?? 0,
    run_updated_count: run.updatedCount ?? 0,
    run_skipped_count: run.skippedCount ?? 0,
    run_error_count: run.errorCount ?? 0,
    run_error_code: run.errorCode ?? null,
    run_error_fingerprint: run.errorFingerprint ?? null,
    run_mapping_summary: (run.mappingSummary ?? {}) as Json,
    run_event_type: run.eventType ?? null,
    run_event_message: run.eventMessage ?? null,
  });
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("integration operation telemetry failed", error.message);
  }
};
