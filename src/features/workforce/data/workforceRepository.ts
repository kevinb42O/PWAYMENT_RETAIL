import { supabase } from "../../../lib/supabase";
import { canUseFeature, FEATURE_KEYS } from "../../../billing/entitlements";
import type { Json } from "../../../types/database.generated";

export type WorkforceRpcName =
  | "get_workforce_bootstrap"
  | "get_workforce_roster"
  | "save_workforce_employee"
  | "save_workforce_shift"
  | "delete_workforce_shift"
  | "apply_workforce_patterns"
  | "copy_workforce_week"
  | "publish_workforce_roster"
  | "reopen_workforce_roster"
  | "save_workforce_pattern"
  | "submit_leave_request"
  | "set_leave_approval_pin"
  | "verify_leave_approval_pin"
  | "decide_leave_request"
  | "withdraw_leave_request"
  | "adjust_leave_balance";

export interface WorkforceRpcError {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
}

interface WorkforceRpcClient {
  rpc: (
    fn: WorkforceRpcName,
    args: Record<string, Json | string>,
  ) => Promise<{ data: Json | null; error: WorkforceRpcError | null }>;
}

const client = supabase as unknown as WorkforceRpcClient;

/**
 * The only browser boundary for workforce RPC calls. Feature entitlement remains
 * an early UX guard; every database function still enforces it server-side.
 */
export const workforceRepository = {
  rpc: async (fn: WorkforceRpcName, args: Record<string, Json | string>) => {
    if (!canUseFeature(FEATURE_KEYS.workforce)) {
      return {
        data: null,
        error: {
          code: "P0001",
          message: "entitlement:plan-required:workforce.core",
        } satisfies WorkforceRpcError,
      };
    }
    return client.rpc(fn, args);
  },
};
