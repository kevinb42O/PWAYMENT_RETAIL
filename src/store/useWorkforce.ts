import { create } from "zustand";
import type { Json } from "../types/database.generated";
import { addDays, isoWeekday, localDateTimeToIso, startOfIsoWeek } from "../workforce/roster";
import { todayIso } from "../workforce/format";

import type {
  CoverageSnapshot,
  LeaveBalance,
  LeaveRequest,
  SaveEmployeeInput,
  SavePatternInput,
  SaveShiftInput,
  WorkforceBootstrap,
  WorkforceEmployee,
  WorkforceRoster,
  WorkforceRosterRange,
  WorkforceShift,
  WorkPattern,
} from "../workforce/types";
import { db } from "../db/db";
import { workforceRepository, type WorkforceRpcError } from "../features/workforce/data/workforceRepository";

const fixtureRuntime = import.meta.env.VITE_E2E_BUILD === "true";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const emptyBootstrap = (): WorkforceBootstrap => ({
  schemaVersion: 2,
  employee: null,
  canManage: false,
  approvalPinConfigured: false,
  leaveTypes: [],
  balances: [],
  requests: [],
  team: [],
  competencies: [],
  coverageRules: [],
});

const emptyRoster = (rangeStart = "", rangeEnd = ""): WorkforceRosterRange => ({
  schemaVersion: 2,
  rangeStart,
  rangeEnd,
  timezone: "Europe/Brussels",
  canManage: false,
  employees: [],
  patterns: [],
  rosters: [],
  shifts: [],
  leave: [],
  calendarDays: [],
  availability: [],
  coverage: [],
});

const fixtureEmployees: WorkforceRosterRange["employees"] = [
  {
    id: "fixture-employee",
    displayName: "Kevin · Demo",
    employeeNumber: "EMP-DEMO",
    email: "kevin@demo.be",
    status: "active",
    weeklyMinutes: 2280,
    scheduledDays: 5,
    competencyIds: ["fixture-keyholder"],
  },
  {
    id: "fixture-colleague",
    displayName: "Robin Janssens",
    employeeNumber: "EMP-ROBIN",
    email: "robin@demo.be",
    status: "active",
    weeklyMinutes: 2280,
    scheduledDays: 5,
    competencyIds: ["fixture-repair"],
  },
  {
    id: "fixture-colleague-2",
    displayName: "Nora Peeters",
    employeeNumber: "EMP-NORA",
    email: "nora@demo.be",
    status: "active",
    weeklyMinutes: 1824,
    scheduledDays: 4,
    competencyIds: ["fixture-keyholder", "fixture-repair"],
  },
];

const fixturePatterns = (): WorkPattern[] => {
  const definitions = [
    { employeeId: "fixture-employee", weekdays: [1, 2, 3, 4, 5], start: "09:00", end: "17:00", role: "Verkoop" },
    { employeeId: "fixture-colleague", weekdays: [2, 3, 4, 5, 6], start: "10:00", end: "18:00", role: "Atelier" },
    { employeeId: "fixture-colleague-2", weekdays: [1, 2, 3, 4], start: "08:30", end: "16:30", role: "Winkelverantwoordelijke" },
  ];
  return definitions.flatMap((definition) =>
    definition.weekdays.map((weekday) => ({
      id: `fixture-pattern-${definition.employeeId}-${weekday}`,
      employeeId: definition.employeeId,
      weekday,
      scheduledMinutes: 456,
      startTime: definition.start,
      endTime: definition.end,
      breakMinutes: 24,
      roleLabel: definition.role,
      locationLabel: "Hoofdvestiging",
      effectiveFrom: "2026-01-01",
      effectiveUntil: null,
    })),
  );
};

const fixtureBootstrap = (): WorkforceBootstrap => {
  const year = new Date().getFullYear();
  return {
    schemaVersion: 2,
    employee: fixtureEmployees[0],
    canManage: true,
    leaveTypes: [
      {
        id: "fixture-vacation",
        code: "statutory-vacation",
        name: "Wettelijke vakantie",
        color: "#0891b2",
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
    balances: [year, year + 1].flatMap((balanceYear) => fixtureEmployees.map((employee, index) => ({
      accountId: `fixture-account-${employee.id}-${balanceYear}`,
      employeeId: employee.id,
      leaveTypeId: "fixture-vacation",
      leaveTypeName: "Wettelijke vakantie",
      year: balanceYear,
      status: balanceYear === year || index > 0 ? "confirmed" : "estimated",
      grantedMinutes: 9120,
      availableMinutes: 7296 - index * 456,
    }))),
    requests: [],
    team: fixtureEmployees,
    competencies: [
      { id: "fixture-keyholder", code: "keyholder", name: "Openen & sluiten", description: null, active: true },
      { id: "fixture-repair", code: "repair", name: "Herstellingen", description: null, active: true },
    ],
    coverageRules: [
      { id: "fixture-rule", name: "Minimale basisbezetting", weekday: null, competencyId: null, minimumPresent: 2, active: true },
      { id: "fixture-key-rule", name: "Sleutelhouder", weekday: null, competencyId: "fixture-keyholder", minimumPresent: 1, active: true },
    ],
  };
};

const fixtureRoster = (rangeStart: string, rangeEnd: string): WorkforceRosterRange => {
  const patterns = fixturePatterns();
  const coverage = [] as WorkforceRosterRange["coverage"];
  for (let date = rangeStart; date <= rangeEnd; date = addDays(date, 1)) {
    const scheduled = fixtureEmployees.filter((employee) =>
      patterns.some((pattern) => pattern.employeeId === employee.id && pattern.weekday === isoWeekday(date)),
    ).length;
    coverage.push({
      date,
      scheduled,
      minimum: 2,
      risk: scheduled < 2 ? "red" : scheduled === 2 ? "amber" : "green",
      missingCompetencies: [],
    });
  }
  return {
    ...emptyRoster(rangeStart, rangeEnd),
    canManage: true,
    employees: fixtureEmployees,
    patterns,
    coverage,
  };
};

const asBootstrap = (value: Json | null): WorkforceBootstrap => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return emptyBootstrap();
  const data = value as unknown as Partial<WorkforceBootstrap>;
  return {
    schemaVersion: typeof data.schemaVersion === "number" ? data.schemaVersion : 1,
    employee: data.employee ?? null,
    canManage: data.canManage === true,
    approvalPinConfigured: data.approvalPinConfigured === true,
    leaveTypes: Array.isArray(data.leaveTypes) ? data.leaveTypes : [],
    balances: Array.isArray(data.balances) ? data.balances : [],
    requests: Array.isArray(data.requests) ? data.requests : [],
    team: Array.isArray(data.team) ? data.team : [],
    competencies: Array.isArray(data.competencies) ? data.competencies : [],
    coverageRules: Array.isArray(data.coverageRules) ? data.coverageRules : [],
  };
};

const asRoster = (value: Json | null, rangeStart: string, rangeEnd: string): WorkforceRosterRange => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return emptyRoster(rangeStart, rangeEnd);
  const data = value as unknown as Partial<WorkforceRosterRange>;
  return {
    schemaVersion: typeof data.schemaVersion === "number" ? data.schemaVersion : 1,
    rangeStart: typeof data.rangeStart === "string" ? data.rangeStart.slice(0, 10) : rangeStart,
    rangeEnd: typeof data.rangeEnd === "string" ? data.rangeEnd.slice(0, 10) : rangeEnd,
    timezone: typeof data.timezone === "string" ? data.timezone : "Europe/Brussels",
    canManage: data.canManage === true,
    employees: Array.isArray(data.employees) ? data.employees : [],
    patterns: Array.isArray(data.patterns) ? data.patterns : [],
    rosters: Array.isArray(data.rosters) ? data.rosters : [],
    shifts: Array.isArray(data.shifts) ? data.shifts : [],
    leave: Array.isArray(data.leave) ? data.leave : [],
    calendarDays: Array.isArray(data.calendarDays) ? data.calendarDays : [],
    availability: Array.isArray(data.availability) ? data.availability : [],
    coverage: Array.isArray(data.coverage)
      ? data.coverage.map((day) => ({ ...day, date: day.date.slice(0, 10) }))
      : [],
  };
};

export const workforceErrorMessage = (error: WorkforceRpcError | null): string => {
  if (!error) return "Onbekende fout.";
  if (error.code === "PGRST202" || error.message?.includes("schema cache")) {
    return "De personeelsbackend is nog niet bijgewerkt. Voer de nieuwste Supabase-migratie uit.";
  }
  const raw = error.message?.trim() ?? "";
  if (raw.includes("entitlement:plan-required:workforce.core") || raw.includes("workforce.core")) {
    return "Personeels- en verlofbeheer is niet inbegrepen in uw huidige abonnement. Upgrade naar Enterprise & Ketens om deze module te gebruiken.";
  }
  const structured = raw.match(/(?:workforce|roster|leave|modules|entitlement):[^:]+:(.+)$/);
  if (structured?.[1]) return structured[1].trim();
  if (error.code === "42501") return "Je hebt geen toegang tot deze personeelsgegevens.";
  return raw || error.details || "De personeelsgegevens konden niet worden geladen.";
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
  roster: WorkforceRosterRange;
  loading: boolean;
  rosterLoading: boolean;
  mutating: boolean;
  hydrated: boolean;
  rosterHydrated: boolean;
  error: string | null;
  rosterError: string | null;
  errorCode: string | null;
  load: (storeId: string, force?: boolean) => Promise<void>;
  loadRoster: (storeId: string, rangeStart: string, rangeEnd: string, force?: boolean) => Promise<void>;
  saveShift: (storeId: string, input: SaveShiftInput) => Promise<boolean>;
  deleteShift: (storeId: string, shift: WorkforceShift) => Promise<boolean>;
  applyPatterns: (storeId: string, weekStart: string, roster?: WorkforceRoster) => Promise<boolean>;
  copyWeek: (storeId: string, sourceWeekStart: string, targetWeekStart: string, roster?: WorkforceRoster) => Promise<boolean>;
  publishRoster: (storeId: string, weekStart: string, roster?: WorkforceRoster) => Promise<boolean>;
  reopenRoster: (storeId: string, weekStart: string) => Promise<boolean>;
  savePattern: (storeId: string, input: SavePatternInput) => Promise<boolean>;
  applyPatternsRange: (storeId: string, input: import("../workforce/types").BatchApplyPatternsInput) => Promise<{ weeksProcessed: number; success: boolean }>;
  saveEmployee: (storeId: string, input: SaveEmployeeInput) => Promise<boolean>;
  submit: (storeId: string, input: {

    leaveTypeId: string;
    startDate: string;
    endDate: string;
    note: string;
  }) => Promise<boolean>;
  setApprovalPin: (storeId: string, pin: string) => Promise<boolean>;
  verifyApprovalPin: (storeId: string, pin: string) => Promise<boolean>;
  decide: (storeId: string, requestId: string, decision: "approved" | "rejected", note: string, approvalPin: string) => Promise<boolean>;
  withdraw: (storeId: string, requestId: string) => Promise<boolean>;
  adjustBalance: (storeId: string, accountId: string, deltaMinutes: number, reason: string) => Promise<boolean>;
  clearError: () => void;
  reset: () => void;
}

const rpcPayload = (value: object): Json => JSON.parse(JSON.stringify(value)) as Json;

export const useWorkforce = create<WorkforceState>((set, get) => {
  const refreshLoadedRange = async (storeId: string) => {
    const { rangeStart, rangeEnd } = get().roster;
    await Promise.all([
      get().load(storeId, true),
      rangeStart && rangeEnd ? get().loadRoster(storeId, rangeStart, rangeEnd, true) : Promise.resolve(),
    ]);
  };

  const mutationError = (error: WorkforceRpcError | null) => {
    set({
      mutating: false,
      error: workforceErrorMessage(error),
      errorCode: error?.code ?? null,
    });
  };

  return {
    ...emptyBootstrap(),
    storeId: null,
    roster: emptyRoster(),
    loading: false,
    rosterLoading: false,
    mutating: false,
    hydrated: false,
    rosterHydrated: false,
    error: null,
    rosterError: null,
    errorCode: null,

    async load(storeId, force = false) {
      if (!force && get().hydrated && get().storeId === storeId) return;
      set({
        ...(get().storeId !== storeId ? emptyBootstrap() : {}),
        loading: true,
        hydrated: get().storeId === storeId ? get().hydrated : false,
        storeId,
        error: null,
        errorCode: null,
      });
      if (fixtureRuntime) {
        set({ ...fixtureBootstrap(), loading: false, hydrated: true, storeId });
        return;
      }
      let bootstrapData: WorkforceBootstrap = emptyBootstrap();
      const { data, error } = await workforceRepository.rpc("get_workforce_bootstrap", {
        target_store_id: storeId,
      });
      if (data) {
        bootstrapData = asBootstrap(data);
      } else if (error) {
        console.warn("Workforce bootstrap warning:", error);
      }

      set({ ...bootstrapData, loading: false, hydrated: true, storeId, error: null, errorCode: null });
    },

    async loadRoster(storeId, rangeStart, rangeEnd, force = false) {
      const current = get().roster;
      if (!force && get().rosterHydrated && get().storeId === storeId
          && current.rangeStart === rangeStart && current.rangeEnd === rangeEnd) return;
      set({ rosterLoading: true, rosterError: null, storeId });
      if (fixtureRuntime) {
        const existing = get().roster;
        const next = existing.rangeStart && existing.shifts.length > 0
          ? { ...fixtureRoster(rangeStart, rangeEnd), shifts: existing.shifts, rosters: existing.rosters }
          : fixtureRoster(rangeStart, rangeEnd);
        set({ roster: next, rosterLoading: false, rosterHydrated: true });
        return;
      }
      const { data, error } = await workforceRepository.rpc("get_workforce_roster", {
        target_store_id: storeId,
        range_start: rangeStart,
        range_end: rangeEnd,
      });
      if (error) {
        set({ rosterLoading: false, rosterHydrated: true, rosterError: workforceErrorMessage(error), errorCode: error.code ?? null });
        return;
      }
      const roster = asRoster(data, rangeStart, rangeEnd);
      if (roster.schemaVersion < 2) {
        set({
          roster,
          rosterLoading: false,
          rosterHydrated: true,
          rosterError: "De personeelsbackend gebruikt een verouderde versie. Voer de nieuwste Supabase-migratie uit.",
          errorCode: "SCHEMA_VERSION",
        });
        return;
      }
      set({ roster, rosterLoading: false, rosterHydrated: true, rosterError: null, errorCode: null });
    },

    async saveShift(storeId, input) {
      set({ mutating: true, error: null, errorCode: null });
      if (fixtureRuntime) {
        const weekStart = startOfIsoWeek(input.startsAt.slice(0, 10));
        const existingRoster = get().roster.rosters.find((item) => item.weekStart === weekStart);
        const roster: WorkforceRoster = existingRoster ?? {
          id: `fixture-roster-${weekStart}`,
          weekStart,
          status: "draft",
          version: 1,
          publishedAt: null,
        };
        const existing = input.shiftId ? get().roster.shifts.find((item) => item.id === input.shiftId) : null;
        const shift: WorkforceShift = {
          id: existing?.id ?? crypto.randomUUID(),
          rosterId: roster.id,
          employeeId: input.employeeId,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          breakMinutes: input.breakMinutes,
          paidMinutes: Math.max(0, Math.round((new Date(input.endsAt).getTime() - new Date(input.startsAt).getTime()) / 60_000) - input.breakMinutes),
          roleLabel: input.roleLabel || null,
          locationLabel: input.locationLabel || null,
          note: input.note || null,
          source: "manual",
          version: (existing?.version ?? 0) + 1,
          rosterStatus: "draft",
          rosterVersion: roster.version + 1,
          weekStart,
        };
        set((state) => ({
          roster: {
            ...state.roster,
            shifts: [...state.roster.shifts.filter((item) => item.id !== shift.id), shift],
            rosters: [...state.roster.rosters.filter((item) => item.weekStart !== weekStart), { ...roster, version: roster.version + 1 }],
          },
          mutating: false,
        }));
        return true;
      }
      const { error } = await workforceRepository.rpc("save_workforce_shift", {
        target_store_id: storeId,
        payload: rpcPayload(input),
      });
      if (error) {
        mutationError(error);
        return false;
      }
      await refreshLoadedRange(storeId);
      set({ mutating: false });
      return true;
    },

    async deleteShift(storeId, shift) {
      set({ mutating: true, error: null, errorCode: null });
      if (fixtureRuntime) {
        set((state) => ({
          roster: { ...state.roster, shifts: state.roster.shifts.filter((item) => item.id !== shift.id) },
          mutating: false,
        }));
        return true;
      }
      const { error } = await workforceRepository.rpc("delete_workforce_shift", {
        target_store_id: storeId,
        payload: rpcPayload({
          shiftId: shift.id,
          expectedRosterVersion: shift.rosterVersion,
          expectedShiftVersion: shift.version,
        }),
      });
      if (error) {
        mutationError(error);
        return false;
      }
      await refreshLoadedRange(storeId);
      set({ mutating: false });
      return true;
    },

    async applyPatterns(storeId, weekStart, roster) {
      set({ mutating: true, error: null, errorCode: null });
      if (fixtureRuntime) {
        const range = get().roster;
        const rosterValue = roster ?? { id: `fixture-roster-${weekStart}`, weekStart, status: "draft" as const, version: 1, publishedAt: null };
        const shifts = range.patterns.flatMap((pattern) => {
          const date = addDays(weekStart, pattern.weekday - 1);
          if (!pattern.startTime || !pattern.endTime || pattern.scheduledMinutes <= 0) return [];
          return [{
            id: `fixture-shift-${pattern.employeeId}-${date}`,
            rosterId: rosterValue.id,
            employeeId: pattern.employeeId,
            startsAt: localDateTimeToIso(date, pattern.startTime),
            endsAt: localDateTimeToIso(date, pattern.endTime),
            breakMinutes: pattern.breakMinutes,
            paidMinutes: pattern.scheduledMinutes,
            roleLabel: pattern.roleLabel,
            locationLabel: pattern.locationLabel,
            note: null,
            source: "pattern" as const,
            version: 1,
            rosterStatus: "draft" as const,
            rosterVersion: rosterValue.version + 1,
            weekStart,
          }];
        });
        set((state) => ({
          roster: {
            ...state.roster,
            shifts: [...state.roster.shifts.filter((item) => item.weekStart !== weekStart), ...shifts],
            rosters: [...state.roster.rosters.filter((item) => item.weekStart !== weekStart), { ...rosterValue, version: rosterValue.version + 1 }],
          },
          mutating: false,
        }));
        return true;
      }
      const { error } = await workforceRepository.rpc("apply_workforce_patterns", {
        target_store_id: storeId,
        payload: rpcPayload({ weekStart, employeeIds: [], expectedRosterVersion: roster?.version }),
      });
      if (error) {
        mutationError(error);
        return false;
      }
      await refreshLoadedRange(storeId);
      set({ mutating: false });
      return true;
    },

    async copyWeek(storeId, sourceWeekStart, targetWeekStart, roster) {
      set({ mutating: true, error: null, errorCode: null });
      if (fixtureRuntime) {
        const source = get().roster.shifts.filter((shift) => shift.weekStart === sourceWeekStart);
        if (!source.length) {
          mutationError({ message: "roster:source-empty:De vorige week bevat nog geen concrete shifts." });
          return false;
        }
        const dayDelta = Math.round((new Date(`${targetWeekStart}T12:00:00`).getTime() - new Date(`${sourceWeekStart}T12:00:00`).getTime()) / 86_400_000);
        const targetRoster: WorkforceRoster = roster ?? { id: `fixture-roster-${targetWeekStart}`, weekStart: targetWeekStart, status: "draft", version: 1, publishedAt: null };
        const copied = source.map((shift) => ({
          ...shift,
          id: crypto.randomUUID(),
          rosterId: targetRoster.id,
          startsAt: new Date(new Date(shift.startsAt).getTime() + dayDelta * 86_400_000).toISOString(),
          endsAt: new Date(new Date(shift.endsAt).getTime() + dayDelta * 86_400_000).toISOString(),
          source: "copied" as const,
          rosterVersion: targetRoster.version + 1,
          weekStart: targetWeekStart,
        }));
        set((state) => ({
          roster: {
            ...state.roster,
            shifts: [...state.roster.shifts.filter((shift) => shift.weekStart !== targetWeekStart), ...copied],
            rosters: [...state.roster.rosters.filter((item) => item.weekStart !== targetWeekStart), { ...targetRoster, version: targetRoster.version + 1 }],
          },
          mutating: false,
        }));
        return true;
      }
      const { error } = await workforceRepository.rpc("copy_workforce_week", {
        target_store_id: storeId,
        payload: rpcPayload({ sourceWeekStart, targetWeekStart, expectedRosterVersion: roster?.version }),
      });
      if (error) {
        mutationError(error);
        return false;
      }
      await refreshLoadedRange(storeId);
      set({ mutating: false });
      return true;
    },

    async publishRoster(storeId, weekStart, roster) {
      set({ mutating: true, error: null, errorCode: null });
      if (fixtureRuntime) {
        if (!get().roster.shifts.some((shift) => shift.weekStart === weekStart)) {
          mutationError({ message: "roster:empty:Voeg eerst minstens één concrete shift toe." });
          return false;
        }
        set((state) => ({
          roster: {
            ...state.roster,
            rosters: state.roster.rosters.map((item) => item.weekStart === weekStart
              ? { ...item, status: "published", version: item.version + 1, publishedAt: new Date().toISOString() }
              : item),
            shifts: state.roster.shifts.map((shift) => shift.weekStart === weekStart
              ? { ...shift, rosterStatus: "published", rosterVersion: shift.rosterVersion + 1 }
              : shift),
          },
          mutating: false,
        }));
        return true;
      }
      const { error } = await workforceRepository.rpc("publish_workforce_roster", {
        target_store_id: storeId,
        payload: rpcPayload({ weekStart, expectedRosterVersion: roster?.version }),
      });
      if (error) {
        mutationError(error);
        return false;
      }
      await refreshLoadedRange(storeId);
      set({ mutating: false });
      return true;
    },

    async reopenRoster(storeId, weekStart) {
      set({ mutating: true, error: null, errorCode: null });
      if (fixtureRuntime) {
        set((state) => ({
          roster: {
            ...state.roster,
            rosters: state.roster.rosters.map((item) => item.weekStart === weekStart ? { ...item, status: "draft", version: item.version + 1 } : item),
            shifts: state.roster.shifts.map((shift) => shift.weekStart === weekStart ? { ...shift, rosterStatus: "draft", rosterVersion: shift.rosterVersion + 1 } : shift),
          },
          mutating: false,
        }));
        return true;
      }
      const { error } = await workforceRepository.rpc("reopen_workforce_roster", {
        target_store_id: storeId,
        payload: rpcPayload({ weekStart }),
      });
      if (error) {
        mutationError(error);
        return false;
      }
      await refreshLoadedRange(storeId);
      set({ mutating: false });
      return true;
    },

    async savePattern(storeId, input) {
      set({ mutating: true, error: null, errorCode: null });
      if (fixtureRuntime) {
        const nextPatterns: WorkPattern[] = input.daySchedules && input.daySchedules.length > 0
          ? input.daySchedules.map((ds) => {
              const scheduledMinutes = Math.max(0, Math.round((new Date(`2020-01-01T${ds.endTime}:00`).getTime() - new Date(`2020-01-01T${ds.startTime}:00`).getTime()) / 60_000) - ds.breakMinutes);
              return {
                id: crypto.randomUUID(),
                employeeId: input.employeeId,
                weekday: ds.weekday,
                scheduledMinutes,
                startTime: ds.startTime,
                endTime: ds.endTime,
                breakMinutes: ds.breakMinutes,
                roleLabel: input.roleLabel || null,
                locationLabel: input.locationLabel || null,
                effectiveFrom: input.effectiveFrom,
                effectiveUntil: null,
              };
            })
          : input.weekdays.map((weekday) => {
              const scheduledMinutes = Math.max(0, Math.round((new Date(`2020-01-01T${input.endTime}:00`).getTime() - new Date(`2020-01-01T${input.startTime}:00`).getTime()) / 60_000) - input.breakMinutes);
              return {
                id: crypto.randomUUID(),
                employeeId: input.employeeId,
                weekday,
                scheduledMinutes,
                startTime: input.startTime,
                endTime: input.endTime,
                breakMinutes: input.breakMinutes,
                roleLabel: input.roleLabel || null,
                locationLabel: input.locationLabel || null,
                effectiveFrom: input.effectiveFrom,
                effectiveUntil: null,
              };
            });

        const totalWeeklyMinutes = nextPatterns.reduce((acc, p) => acc + p.scheduledMinutes, 0);

        set((state) => ({
          team: state.team.map((e) => e.id === input.employeeId ? { ...e, weeklyMinutes: totalWeeklyMinutes, scheduledDays: nextPatterns.length } : e),
          roster: {
            ...state.roster,
            employees: state.roster.employees.map((e) => e.id === input.employeeId ? { ...e, weeklyMinutes: totalWeeklyMinutes, scheduledDays: nextPatterns.length } : e),
            patterns: [...state.roster.patterns.filter((pattern) => pattern.employeeId !== input.employeeId), ...nextPatterns],
          },
          mutating: false,
        }));
        return true;
      }
      const { error } = await workforceRepository.rpc("save_workforce_pattern", {
        target_store_id: storeId,
        payload: rpcPayload(input),
      });
      if (error) {
        mutationError(error);
        return false;
      }
      await refreshLoadedRange(storeId);
      set({ mutating: false });
      return true;
    },

    async applyPatternsRange(storeId, input) {
      set({ mutating: true, error: null, errorCode: null });
      try {
        const startMonday = startOfIsoWeek(input.startDate);
        const endMonday = startOfIsoWeek(input.endDate);
        let currentWeek = startMonday;
        let weeksProcessed = 0;

        while (currentWeek <= endMonday) {
          const targetWeek = currentWeek;
          if (fixtureRuntime) {
            const range = get().roster;
            const existingRoster = range.rosters.find((r) => r.weekStart === targetWeek);
            const rosterValue: WorkforceRoster = existingRoster ?? {
              id: `fixture-roster-${targetWeek}`,
              weekStart: targetWeek,
              status: "draft" as const,
              version: 1,
              publishedAt: null,
            };
            const patternsToApply = input.employeeIds && input.employeeIds.length > 0
              ? range.patterns.filter((p) => input.employeeIds!.includes(p.employeeId))
              : range.patterns;

            const shifts: WorkforceShift[] = patternsToApply.flatMap((pattern) => {
              const date = addDays(targetWeek, pattern.weekday - 1);
              if (!pattern.startTime || !pattern.endTime || pattern.scheduledMinutes <= 0) return [];
              const hasLeave = range.leave.some((l) => l.employeeId === pattern.employeeId && l.startDate <= date && l.endDate >= date && l.status === "approved");
              if (hasLeave) return [];
              return [{
                id: `fixture-shift-${pattern.employeeId}-${date}`,
                rosterId: rosterValue.id,
                employeeId: pattern.employeeId,
                startsAt: localDateTimeToIso(date, pattern.startTime),
                endsAt: localDateTimeToIso(date, pattern.endTime),
                breakMinutes: pattern.breakMinutes,
                paidMinutes: pattern.scheduledMinutes,
                roleLabel: pattern.roleLabel,
                locationLabel: pattern.locationLabel,
                note: null,
                source: "pattern" as const,
                version: 1,
                rosterStatus: "draft" as const,
                rosterVersion: rosterValue.version + 1,
                weekStart: targetWeek,
              }];
            });

            set((state) => ({
              roster: {
                ...state.roster,
                shifts: [
                  ...state.roster.shifts.filter((s) => s.weekStart !== targetWeek || (input.employeeIds && input.employeeIds.length > 0 && !input.employeeIds.includes(s.employeeId))),
                  ...shifts,
                ],
                rosters: [
                  ...state.roster.rosters.filter((r) => r.weekStart !== targetWeek),
                  { ...rosterValue, version: rosterValue.version + 1 },
                ],
              },
            }));
          } else {
            const roster = get().roster.rosters.find((r) => r.weekStart === targetWeek);
            await workforceRepository.rpc("apply_workforce_patterns", {
              target_store_id: storeId,
              payload: rpcPayload({
                weekStart: targetWeek,
                employeeIds: input.employeeIds ?? [],
                expectedRosterVersion: roster?.version,
              }),
            });
          }
          weeksProcessed += 1;
          currentWeek = addDays(currentWeek, 7);
        }

        await refreshLoadedRange(storeId);
        set({ mutating: false });
        return { weeksProcessed, success: true };
      } catch (err: any) {
        console.error("Batch apply patterns failed:", err);
        set({ mutating: false, error: err?.message || "Fout bij doortrekken van werkpatronen." });
        return { weeksProcessed: 0, success: false };
      }
    },


    async submit(storeId, input) {
      set({ mutating: true, error: null, errorCode: null });
      if (fixtureRuntime) {
        const leaveType = get().leaveTypes.find((item) => item.id === input.leaveTypeId)!;
        let weekdays = 0;
        for (let date = input.startDate; date <= input.endDate; date = addDays(date, 1)) {
          if (isoWeekday(date) <= 5) weekdays += 1;
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
      const { error } = await workforceRepository.rpc("submit_leave_request", {
        target_store_id: storeId,
        payload: rpcPayload({ clientRequestId: crypto.randomUUID(), ...input }),
      });
      if (error) {
        mutationError(error);
        return false;
      }
      await refreshLoadedRange(storeId);
      set({ mutating: false });
      return true;
    },

    async setApprovalPin(storeId, pin) {
      set({ mutating: true, error: null, errorCode: null });
      if (!/^\d{6}$/.test(pin)) {
        set({ mutating: false, error: "De goedkeurings-PIN bestaat uit exact 6 cijfers.", errorCode: "INVALID_PIN" });
        return false;
      }
      if (fixtureRuntime) {
        set({ approvalPinConfigured: true, mutating: false });
        return true;
      }
      const { data, error } = await workforceRepository.rpc("set_leave_approval_pin", {
        target_store_id: storeId,
        payload: rpcPayload({ pin }),
      });
      if (error || (data && typeof data === "object" && !Array.isArray(data) && data.ok === false)) {
        mutationError(error ?? { code: "P0001", message: "leave:pin:De PIN kon niet worden ingesteld." });
        return false;
      }
      set({ approvalPinConfigured: true, mutating: false });
      return true;
    },

    async verifyApprovalPin(storeId, pin) {
      set({ mutating: true, error: null, errorCode: null });
      if (!/^\d{6}$/.test(pin)) {
        set({ mutating: false, error: "Voer je persoonlijke PIN van 6 cijfers in.", errorCode: "INVALID_PIN" });
        return false;
      }
      if (fixtureRuntime) {
        set({ mutating: false });
        return true;
      }
      const { data, error } = await workforceRepository.rpc("verify_leave_approval_pin", {
        target_store_id: storeId,
        payload: rpcPayload({ approvalPin: pin }),
      });
      if (error || (data && typeof data === "object" && !Array.isArray(data) && data.ok === false)) {
        const code = data && typeof data === "object" && !Array.isArray(data) ? data.errorCode : null;
        const message = code === "pin-locked"
          ? "Je goedkeurings-PIN is tijdelijk geblokkeerd. Probeer later opnieuw."
          : code === "pin-not-configured"
            ? "Stel eerst je persoonlijke goedkeurings-PIN in via Instellingen → Personeel & verlof."
            : "De ingevoerde PIN is onjuist. Probeer opnieuw.";
        mutationError(error ?? { code: "P0001", message });
        return false;
      }
      set({ mutating: false });
      return true;
    },

    async decide(storeId, requestId, decision, note, approvalPin) {
      set({ mutating: true, error: null, errorCode: null });
      if (!/^\d{6}$/.test(approvalPin)) {
        set({ mutating: false, error: "Voer je persoonlijke PIN van 6 cijfers in.", errorCode: "INVALID_PIN" });
        return false;
      }
      if (fixtureRuntime) {
        set((state) => ({
          requests: state.requests.map((request) => request.id === requestId
            ? { ...request, status: decision, decisionNote: note || null, decidedAt: new Date().toISOString() }
            : request),
          mutating: false,
        }));
        return true;
      }
      const { data, error } = await workforceRepository.rpc("decide_leave_request", {
        target_store_id: storeId,
        payload: rpcPayload({ requestId, decision, note, approvalPin }),
      });
      if (error || (data && typeof data === "object" && !Array.isArray(data) && data.ok === false)) {
        const code = data && typeof data === "object" && !Array.isArray(data) ? data.errorCode : null;
        const message = code === "invalid-pin"
          ? "De ingevoerde PIN is onjuist. Probeer opnieuw."
          : code === "pin-locked"
            ? "Je goedkeurings-PIN is tijdelijk geblokkeerd. Probeer later opnieuw."
            : code === "pin-not-configured"
              ? "Stel eerst je persoonlijke goedkeurings-PIN in."
              : "De verlofbeslissing kon niet worden bevestigd.";
        mutationError(error ?? { code: "P0001", message });
        return false;
      }
      await refreshLoadedRange(storeId);
      set({ mutating: false });
      return true;
    },

    async withdraw(storeId, requestId) {
      set({ mutating: true, error: null, errorCode: null });
      if (fixtureRuntime) {
        set((state) => ({
          requests: state.requests.map((request) => request.id === requestId
            ? { ...request, status: request.status === "approved" ? "cancelled" : "withdrawn" }
            : request),
          mutating: false,
        }));
        return true;
      }
      const { error } = await workforceRepository.rpc("withdraw_leave_request", {
        target_store_id: storeId,
        target_request_id: requestId,
      });
      if (error) {
        mutationError(error);
        return false;
      }
      await refreshLoadedRange(storeId);
      set({ mutating: false });
      return true;
    },

    async saveEmployee(storeId, input) {
      set({ mutating: true, error: null, errorCode: null });
      let newEmployee: WorkforceEmployee;
      if (fixtureRuntime) {
        const id = input.id || crypto.randomUUID();
        newEmployee = {
          id,
          displayName: input.displayName.trim(),
          employeeNumber: input.employeeNumber || `EMP-${Math.floor(1000 + Math.random() * 9000)}`,
          email: input.email || null,
          status: input.status || "active",
          weeklyMinutes: input.weeklyMinutes ?? 2280,
          scheduledDays: 5,
          competencyIds: input.competencyIds ?? [],
        };
      } else {
        const serverInput = {
          ...input,
          // Only an employee returned by this store can be used as an update
          // identity. A local POS ID, including a UUID-shaped legacy ID, is not
          // evidence of a workforce record.
          id: input.id && get().team.some((employee) => employee.id === input.id) && uuidPattern.test(input.id)
            ? input.id
            : undefined,
          posAccess: undefined,
        };
        let result: { data: Json | null; error: WorkforceRpcError | null };
        try {
          result = await workforceRepository.rpc("save_workforce_employee", {
            target_store_id: storeId,
            payload: rpcPayload(serverInput),
          });
        } catch {
          mutationError({ message: "workforce:connection:De medewerker kon niet veilig worden bewaard. Controleer uw verbinding en probeer opnieuw." });
          return false;
        }
        if (result.error) {
          mutationError(result.error);
          return false;
        }
        const saved = result.data && typeof result.data === "object" && !Array.isArray(result.data)
          ? result.data as unknown as Partial<WorkforceEmployee>
          : null;
        if (!saved || typeof saved.id !== "string" || !uuidPattern.test(saved.id)) {
          mutationError({ message: "workforce:invalid-response:De personeelsbackend gaf geen geldige medewerker-ID terug." });
          return false;
        }
        newEmployee = {
          id: saved.id,
          displayName: typeof saved.displayName === "string" ? saved.displayName : input.displayName.trim(),
          employeeNumber: typeof saved.employeeNumber === "string" ? saved.employeeNumber : input.employeeNumber ?? null,
          email: typeof saved.email === "string" ? saved.email : input.email ?? null,
          status: saved.status === "inactive" || saved.status === "leave" ? saved.status : "active",
          weeklyMinutes: input.weeklyMinutes ?? 2280,
          scheduledDays: input.initialSchedule?.weekdays.length ?? 0,
          competencyIds: input.competencyIds ?? [],
        };
      }

      // A POS login is opt-in. Its ID deliberately equals the canonical workforce
      // ID for newly created records, avoiding a client-generated identity split.
      if (input.posAccess) {
        try {
          const localUserId = input.posAccess.localUserId ?? newEmployee.id;
          const existingUser = await db.users.get(localUserId);
          await db.users.put({
            ...existingUser,
            id: localUserId,
            name: newEmployee.displayName,
            email: newEmployee.email || undefined,
            role: input.posAccess.role,
            jobTitle: input.posAccess.jobTitle?.trim() || undefined,
            pinHash: input.posAccess.pinHash,
            createdAt: existingUser?.createdAt ?? new Date().toISOString(),
            workforceEmployeeId: newEmployee.id,
          });
        } catch {
          set({ mutating: false, error: "De medewerker is bewaard, maar POS-toegang kon niet lokaal worden ingesteld." });
          return false;
        }
      }

      set((state) => {
        const exists = state.team.some((employee) => employee.id === newEmployee.id);
        const year = new Date().getFullYear();
        const fixtureBalances: LeaveBalance[] = fixtureRuntime && !exists
          ? [year, year + 1].map((balanceYear) => ({
              accountId: `account-${newEmployee.id}-${balanceYear}`,
              employeeId: newEmployee.id,
              leaveTypeId: "statutory-vacation",
              leaveTypeName: "Wettelijke vakantie",
              year: balanceYear,
              status: "confirmed" as const,
              grantedMinutes: (input.weeklyMinutes ?? 2280) * 4,
              availableMinutes: (input.weeklyMinutes ?? 2280) * 4,
            }))
          : [];
        return {
          team: exists ? state.team.map((employee) => employee.id === newEmployee.id ? newEmployee : employee) : [...state.team, newEmployee],
          balances: fixtureBalances.length ? [...state.balances, ...fixtureBalances] : state.balances,
          roster: {
            ...state.roster,
            employees: exists
              ? state.roster.employees.map((employee) => employee.id === newEmployee.id ? newEmployee : employee)
              : [...state.roster.employees, newEmployee],
          },
        };
      });

      // Create an initial work pattern exactly once, after the employee has a
      // canonical server identity. A failure is surfaced rather than hidden.
      if (input.initialSchedule && input.initialSchedule.weekdays.length > 0) {
        const patternSaved = await get().savePattern(storeId, {
          employeeId: newEmployee.id,
          weekdays: input.initialSchedule.weekdays,
          startTime: input.initialSchedule.startTime,
          endTime: input.initialSchedule.endTime,
          breakMinutes: input.initialSchedule.breakMinutes,
          roleLabel: input.initialSchedule.roleLabel || "Medewerker",
          locationLabel: input.initialSchedule.locationLabel || "Winkelvloer",
          effectiveFrom: input.startDate || todayIso(),
        });
        if (!patternSaved) return false;
      }

      if (!fixtureRuntime) await get().load(storeId, true);

      set({ mutating: false });
      return true;
    },


    async adjustBalance(storeId, accountId, deltaMinutes, reason) {
      set({ mutating: true, error: null, errorCode: null });
      if (fixtureRuntime) {
        set((state) => ({
          balances: state.balances.map((balance) => balance.accountId === accountId
            ? { ...balance, availableMinutes: balance.availableMinutes + deltaMinutes, status: "confirmed" }
            : balance),
          mutating: false,
        }));
        return true;
      }
      const { error } = await workforceRepository.rpc("adjust_leave_balance", {
        target_store_id: storeId,
        payload: rpcPayload({ accountId, deltaMinutes, reason }),
      });
      if (error) {
        mutationError(error);
        return false;
      }
      await get().load(storeId, true);
      set({ mutating: false });
      return true;
    },

    clearError: () => set({ error: null, rosterError: null, errorCode: null }),
    reset: () => set({
      ...emptyBootstrap(),
      storeId: null,
      roster: emptyRoster(),
      loading: false,
      rosterLoading: false,
      mutating: false,
      hydrated: false,
      rosterHydrated: false,
      error: null,
      rosterError: null,
      errorCode: null,
    }),
  };
});
