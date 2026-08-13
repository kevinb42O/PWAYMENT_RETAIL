import { create } from "zustand";
import { supabase } from "../lib/supabase";
import type { Json } from "../types/database.generated";
import type {
  CoverageSnapshot,
  LeaveRequest,
  WorkforceBootstrap,
} from "../workforce/types";

type WorkforceRpcName =
  | "get_workforce_bootstrap"
  | "submit_leave_request"
  | "decide_leave_request"
  | "withdraw_leave_request"
  | "adjust_leave_balance";

type WorkforceRpcClient = {
  rpc: (
    fn: WorkforceRpcName,
    args: Record<string, Json | string>,
  ) => Promise<{ data: Json | null; error: { message?: string } | null }>;
};

const workforceRpc = supabase as unknown as WorkforceRpcClient;

const emptyBootstrap = (): WorkforceBootstrap => ({
  employee: null,
  canManage: false,
  leaveTypes: [],
  balances: [],
  requests: [],
  team: [],
  competencies: [],
  coverageRules: [],
});

const fixtureBootstrap = (): WorkforceBootstrap => {
  const year = new Date().getFullYear();
  return {
    employee: {
      id: "fixture-employee",
      displayName: "Kevin · Demo",
      employeeNumber: "EMP-DEMO",
      status: "active",
      weeklyMinutes: 2280,
      scheduledDays: 5,
    },
    canManage: true,
    leaveTypes: [
      {
        id: "fixture-vacation",
        code: "statutory-vacation",
        name: "Wettelijke vakantie",
        color: "#0ea5e9",
        requiresBalance: true,
        paid: true,
        approvalRequired: true,
        minimumNoticeDays: 0,
      },
      {
        id: "fixture-unpaid",
        code: "unpaid",
        name: "Onbetaald verlof",
        color: "#64748b",
        requiresBalance: false,
        paid: false,
        approvalRequired: true,
        minimumNoticeDays: 0,
      },
    ],
    balances: [
      {
        accountId: "fixture-account",
        employeeId: "fixture-employee",
        leaveTypeId: "fixture-vacation",
        leaveTypeName: "Wettelijke vakantie",
        year,
        status: "estimated",
        grantedMinutes: 9120,
        availableMinutes: 7296,
      },
    ],
    requests: [],
    team: [
      {
        id: "fixture-employee",
        displayName: "Kevin · Demo",
        employeeNumber: "EMP-DEMO",
        email: "kevin@demo.be",
        status: "active",
        weeklyMinutes: 2280,
        scheduledDays: 5,
      },
      {
        id: "fixture-colleague",
        displayName: "Robin Janssens",
        employeeNumber: "EMP-ROBIN",
        email: "robin@demo.be",
        status: "active",
        weeklyMinutes: 2280,
        scheduledDays: 5,
      },
    ],
    competencies: [],
    coverageRules: [
      {
        id: "fixture-rule",
        name: "Minimale basisbezetting",
        weekday: null,
        competencyId: null,
        minimumPresent: 1,
        active: true,
      },
    ],
  };
};

const asBootstrap = (value: Json | null): WorkforceBootstrap => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return emptyBootstrap();
  const data = value as unknown as Partial<WorkforceBootstrap>;
  return {
    employee: data.employee ?? null,
    canManage: data.canManage === true,
    leaveTypes: Array.isArray(data.leaveTypes) ? data.leaveTypes : [],
    balances: Array.isArray(data.balances) ? data.balances : [],
    requests: Array.isArray(data.requests) ? data.requests : [],
    team: Array.isArray(data.team) ? data.team : [],
    competencies: Array.isArray(data.competencies) ? data.competencies : [],
    coverageRules: Array.isArray(data.coverageRules) ? data.coverageRules : [],
  };
};

export const workforceErrorMessage = (error: { message?: string } | null): string => {
  const raw = error?.message ?? "";
  const parts = raw.split(":");
  return parts.length >= 3
    ? parts.slice(2).join(":")
    : "De personeelsgegevens konden niet worden verwerkt. Probeer opnieuw.";
};

const fixtureCoverage = (): CoverageSnapshot => ({
  risk: "green",
  summary: "Geen conflict met de huidige bezettingsregels gevonden.",
  details: [],
  calculatedAt: new Date().toISOString(),
  advisoryOnly: true,
});

interface WorkforceState extends WorkforceBootstrap {
  storeId: string | null;
  loading: boolean;
  mutating: boolean;
  hydrated: boolean;
  error: string | null;
  load: (storeId: string, force?: boolean) => Promise<void>;
  submit: (storeId: string, input: {
    leaveTypeId: string;
    startDate: string;
    endDate: string;
    note: string;
  }) => Promise<boolean>;
  decide: (storeId: string, requestId: string, decision: "approved" | "rejected", note: string) => Promise<boolean>;
  withdraw: (storeId: string, requestId: string) => Promise<boolean>;
  adjustBalance: (storeId: string, accountId: string, deltaMinutes: number, reason: string) => Promise<boolean>;
  clearError: () => void;
  reset: () => void;
}

const fixtureRuntime = import.meta.env.VITE_E2E_BUILD === "true";

export const useWorkforce = create<WorkforceState>((set, get) => ({
  ...emptyBootstrap(),
  storeId: null,
  loading: false,
  mutating: false,
  hydrated: false,
  error: null,
  async load(storeId, force = false) {
    if (!force && get().hydrated && get().storeId === storeId) return;
    set({
      ...(get().storeId !== storeId ? emptyBootstrap() : {}),
      loading: true,
      hydrated: get().storeId === storeId ? get().hydrated : false,
      storeId,
      error: null,
    });
    if (fixtureRuntime) {
      set({ ...fixtureBootstrap(), loading: false, hydrated: true, storeId });
      return;
    }
    const { data, error } = await workforceRpc.rpc("get_workforce_bootstrap", {
      target_store_id: storeId,
    });
    if (error) {
      set({ loading: false, hydrated: true, error: workforceErrorMessage(error) });
      return;
    }
    set({ ...asBootstrap(data), loading: false, hydrated: true, storeId, error: null });
  },
  async submit(storeId, input) {
    set({ mutating: true, error: null });
    if (fixtureRuntime) {
      const leaveType = get().leaveTypes.find((item) => item.id === input.leaveTypeId)!;
      const start = new Date(`${input.startDate}T12:00:00`);
      const end = new Date(`${input.endDate}T12:00:00`);
      let weekdays = 0;
      for (const cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
        if (cursor.getDay() !== 0 && cursor.getDay() !== 6) weekdays += 1;
      }
      const request: LeaveRequest = {
        id: crypto.randomUUID(),
        employeeId: get().employee!.id,
        employeeName: get().employee!.displayName,
        leaveTypeId: leaveType.id,
        leaveTypeName: leaveType.name,
        leaveTypeColor: leaveType.color,
        startDate: input.startDate,
        endDate: input.endDate,
        totalMinutes: weekdays * 456,
        status: "pending",
        employeeNote: input.note || null,
        decisionNote: null,
        coverageRisk: "green",
        coverageSnapshot: fixtureCoverage(),
        submittedAt: new Date().toISOString(),
        decidedAt: null,
      };
      set((state) => ({ requests: [request, ...state.requests], mutating: false }));
      return true;
    }
    const { error } = await workforceRpc.rpc("submit_leave_request", {
      target_store_id: storeId,
      payload: {
        clientRequestId: crypto.randomUUID(),
        leaveTypeId: input.leaveTypeId,
        startDate: input.startDate,
        endDate: input.endDate,
        note: input.note,
      },
    });
    if (error) {
      set({ mutating: false, error: workforceErrorMessage(error) });
      return false;
    }
    await get().load(storeId, true);
    set({ mutating: false });
    return true;
  },
  async decide(storeId, requestId, decision, note) {
    set({ mutating: true, error: null });
    if (fixtureRuntime) {
      set((state) => ({
        requests: state.requests.map((request) => request.id === requestId
          ? { ...request, status: decision, decisionNote: note || null, decidedAt: new Date().toISOString() }
          : request),
        mutating: false,
      }));
      return true;
    }
    const { error } = await workforceRpc.rpc("decide_leave_request", {
      target_store_id: storeId,
      payload: { requestId, decision, note },
    });
    if (error) {
      set({ mutating: false, error: workforceErrorMessage(error) });
      return false;
    }
    await get().load(storeId, true);
    set({ mutating: false });
    return true;
  },
  async withdraw(storeId, requestId) {
    set({ mutating: true, error: null });
    if (fixtureRuntime) {
      set((state) => ({
        requests: state.requests.map((request) => request.id === requestId
          ? { ...request, status: request.status === "approved" ? "cancelled" : "withdrawn" }
          : request),
        mutating: false,
      }));
      return true;
    }
    const { error } = await workforceRpc.rpc("withdraw_leave_request", {
      target_store_id: storeId,
      target_request_id: requestId,
    });
    if (error) {
      set({ mutating: false, error: workforceErrorMessage(error) });
      return false;
    }
    await get().load(storeId, true);
    set({ mutating: false });
    return true;
  },
  async adjustBalance(storeId, accountId, deltaMinutes, reason) {
    set({ mutating: true, error: null });
    if (fixtureRuntime) {
      set((state) => ({
        balances: state.balances.map((balance) => balance.accountId === accountId
          ? { ...balance, availableMinutes: balance.availableMinutes + deltaMinutes, status: "confirmed" }
          : balance),
        mutating: false,
      }));
      return true;
    }
    const { error } = await workforceRpc.rpc("adjust_leave_balance", {
      target_store_id: storeId,
      payload: { accountId, deltaMinutes, reason },
    });
    if (error) {
      set({ mutating: false, error: workforceErrorMessage(error) });
      return false;
    }
    await get().load(storeId, true);
    set({ mutating: false });
    return true;
  },
  clearError: () => set({ error: null }),
  reset: () => set({ ...emptyBootstrap(), storeId: null, loading: false, mutating: false, hydrated: false, error: null }),
}));
