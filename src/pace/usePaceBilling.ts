import { create } from "zustand";
import { supabase } from "../lib/supabase";

export type PaceTier = "basic" | "pro" | "enterprise";
export interface PaceQuotaSnapshot {
  tier: PaceTier;
  quota: number;
  remaining: number;
  remaining_credits: number;
  daily_count: number;
  monthly_count: number;
  rollover_balance: number;
  reset_at?: string;
  reset_in_seconds?: number;
  source?: "subscription" | "rollover" | "credit";
}

export interface PaceBillingOverview {
  tier: PaceTier;
  rollover_enabled: boolean;
  credit_balance: number;
  usage: { daily_count: number; monthly_count: number; rollover_balance: number; period_end?: string };
  role_policies: Array<{ role: "owner" | "manager" | "cashier"; enabled: boolean; monthly_limit: number | null }>;
}

interface PaceBillingState {
  storeId: string | null;
  loading: boolean;
  overview: PaceBillingOverview | null;
  quota: PaceQuotaSnapshot | null;
  hardLimited: boolean;
  error: string | null;
  load: (storeId: string | null) => Promise<void>;
  recordQuota: (quota: PaceQuotaSnapshot) => void;
  markExceeded: (quota: Partial<PaceQuotaSnapshot>) => void;
  clearHardLimit: () => void;
  saveRolePolicy: (storeId: string, role: "owner" | "manager" | "cashier", enabled: boolean, monthlyLimit: number | null) => Promise<void>;
  setRollover: (storeId: string, enabled: boolean) => Promise<void>;
}

const quotaFromOverview = (overview: PaceBillingOverview): PaceQuotaSnapshot => {
  const quota = overview.tier === "basic" ? 5 : overview.tier === "pro" ? 250 : 2500;
  const used = overview.tier === "basic" ? overview.usage.daily_count : overview.usage.monthly_count;
  return {
    tier: overview.tier,
    quota,
    remaining: Math.max(0, quota - used + (overview.tier === "pro" ? overview.usage.rollover_balance : 0)),
    remaining_credits: overview.credit_balance,
    daily_count: overview.usage.daily_count,
    monthly_count: overview.usage.monthly_count,
    rollover_balance: overview.usage.rollover_balance,
    reset_at: overview.tier === "basic" ? undefined : overview.usage.period_end,
  };
};

export const usePaceBilling = create<PaceBillingState>((set, get) => ({
  storeId: null,
  loading: false,
  overview: null,
  quota: null,
  hardLimited: false,
  error: null,
  load: async (storeId) => {
    if (!storeId) { set({ storeId: null, overview: null, quota: null, hardLimited: false }); return; }
    set({ storeId, loading: true, error: null });
    const { data, error } = await (supabase.rpc as unknown as (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>)
      ("get_pace_billing_overview", { target_store_id: storeId });
    if (get().storeId !== storeId) return;
    if (error || !data) { set({ loading: false, error: error?.message ?? "PACE-verbruik kon niet worden geladen." }); return; }
    const overview = data as PaceBillingOverview;
    const quota = quotaFromOverview(overview);
    set({ overview, quota, loading: false, hardLimited: quota.remaining <= 0 && quota.remaining_credits <= 0 });
  },
  recordQuota: (quota) => set((state) => ({
    quota,
    hardLimited: quota.remaining <= 0 && quota.remaining_credits <= 0,
    overview: state.overview ? {
      ...state.overview,
      credit_balance: quota.remaining_credits,
      usage: { ...state.overview.usage, daily_count: quota.daily_count, monthly_count: quota.monthly_count, rollover_balance: quota.rollover_balance },
    } : null,
  })),
  markExceeded: (quota) => set((state) => ({
    hardLimited: true,
    quota: { tier: quota.tier ?? state.quota?.tier ?? "basic", quota: quota.quota ?? state.quota?.quota ?? 5, remaining: 0,
      remaining_credits: quota.remaining_credits ?? 0, daily_count: quota.daily_count ?? state.quota?.daily_count ?? 0,
      monthly_count: quota.monthly_count ?? state.quota?.monthly_count ?? 0, rollover_balance: quota.rollover_balance ?? state.quota?.rollover_balance ?? 0,
      reset_at: quota.reset_at, reset_in_seconds: quota.reset_in_seconds },
  })),
  clearHardLimit: () => set({ hardLimited: false }),
  saveRolePolicy: async (storeId, role, enabled, monthlyLimit) => {
    const { error } = await (supabase.rpc as unknown as (name: string, args: Record<string, unknown>) => Promise<{ error: { message: string } | null }>)
      ("set_pace_role_policy", { target_store_id: storeId, target_role: role, pace_enabled: enabled, role_monthly_limit: monthlyLimit });
    if (error) { set({ error: error.message }); return; }
    await get().load(storeId);
  },
  setRollover: async (storeId, enabled) => {
    const { error } = await (supabase.rpc as unknown as (name: string, args: Record<string, unknown>) => Promise<{ error: { message: string } | null }>)
      ("set_pace_rollover", { target_store_id: storeId, rollover_enabled: enabled });
    if (error) { set({ error: error.message }); return; }
    await get().load(storeId);
  },
}));

export const paceQuotaLabel = (quota: PaceQuotaSnapshot | null) => {
  if (!quota) return "Verbruik laden…";
  if (quota.tier === "basic") return `${quota.remaining}/${quota.quota} vragen resterend vandaag`;
  const percent = Math.min(100, Math.round((quota.monthly_count / quota.quota) * 100));
  return `${percent}% van maandbundel gebruikt`;
};
