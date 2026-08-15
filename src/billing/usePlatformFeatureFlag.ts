import { useEffect, useState } from "react";
import { useAuth } from "../auth/useAuth";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

type RpcClient = {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{
    data: Record<string, boolean> | null;
    error: { message: string } | null;
  }>;
};

const rpc = supabase as unknown as RpcClient;

/**
 * Applies a live control-plane override after the normal build-time default.
 * An unavailable control plane deliberately leaves the known build default in
 * place; server-side operations must still enforce their own authorization.
 */
export const usePlatformFeatureFlag = (featureKey: string, buildDefault: boolean) => {
  const storeId = useAuth((state) => state.currentStoreId);
  const [override, setOverride] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    setOverride(null);
    if (!storeId || !isSupabaseConfigured) return () => { active = false; };
    void rpc.rpc("get_store_platform_feature_flags", { target_store_id: storeId })
      .then(({ data, error }) => {
        if (!active || error || !data || typeof data[featureKey] !== "boolean") return;
        setOverride(data[featureKey]);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [featureKey, storeId]);

  return override ?? buildDefault;
};
