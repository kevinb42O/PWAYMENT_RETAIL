import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadFixtureStore = async () => {
  vi.resetModules();
  vi.stubEnv("VITE_E2E_BUILD", "true");
  return import("./useWorkforce");
};

describe("workforce fixture workflow", () => {
  beforeEach(() => vi.stubEnv("VITE_E2E_BUILD", "true"));
  afterEach(() => vi.unstubAllEnvs());

  it("runs the complete pattern, shift, copy and publication lifecycle", async () => {
    const { useWorkforce } = await loadFixtureStore();
    const store = useWorkforce.getState();
    await store.load("fixture-store");
    await store.loadRoster("fixture-store", "2026-08-10", "2026-08-23");

    expect(useWorkforce.getState().team).toHaveLength(3);
    expect(useWorkforce.getState().roster.patterns).toHaveLength(14);

    expect(await useWorkforce.getState().applyPatterns("fixture-store", "2026-08-10")).toBe(true);
    expect(useWorkforce.getState().roster.shifts).toHaveLength(14);

    const first = useWorkforce.getState().roster.shifts[0];
    expect(await useWorkforce.getState().saveShift("fixture-store", {
      shiftId: first.id,
      employeeId: first.employeeId,
      startsAt: first.startsAt,
      endsAt: first.endsAt,
      breakMinutes: 30,
      roleLabel: "Kassa",
      locationLabel: "Winkel",
      note: "Gewijzigd",
      expectedRosterVersion: first.rosterVersion,
      expectedShiftVersion: first.version,
    })).toBe(true);
    expect(useWorkforce.getState().roster.shifts.find((shift) => shift.id === first.id)?.roleLabel).toBe("Kassa");

    expect(await useWorkforce.getState().saveShift("fixture-store", {
      employeeId: "fixture-employee",
      startsAt: "2026-08-15T07:00:00.000Z",
      endsAt: "2026-08-15T12:00:00.000Z",
      breakMinutes: 15,
      roleLabel: "Extra",
      locationLabel: "Winkel",
      note: "",
    })).toBe(true);
    const extra = useWorkforce.getState().roster.shifts.find((shift) => shift.roleLabel === "Extra");
    expect(extra).toBeDefined();
    expect(await useWorkforce.getState().deleteShift("fixture-store", extra!)).toBe(true);

    expect(await useWorkforce.getState().copyWeek("fixture-store", "2026-08-10", "2026-08-17")).toBe(true);
    expect(useWorkforce.getState().roster.shifts.some((shift) => shift.weekStart === "2026-08-17")).toBe(true);
    expect(await useWorkforce.getState().publishRoster("fixture-store", "2026-08-10")).toBe(true);
    expect(useWorkforce.getState().roster.rosters.find((roster) => roster.weekStart === "2026-08-10")?.status).toBe("published");
    expect(await useWorkforce.getState().reopenRoster("fixture-store", "2026-08-10")).toBe(true);
    expect(useWorkforce.getState().roster.rosters.find((roster) => roster.weekStart === "2026-08-10")?.status).toBe("draft");
  });

  it("updates work patterns, leave requests and balances", async () => {
    const { useWorkforce } = await loadFixtureStore();
    await useWorkforce.getState().load("fixture-store");
    await useWorkforce.getState().loadRoster("fixture-store", "2026-08-10", "2026-08-16");

    expect(await useWorkforce.getState().savePattern("fixture-store", {
      employeeId: "fixture-employee",
      weekdays: [1, 3, 5],
      startTime: "08:00",
      endTime: "16:00",
      breakMinutes: 30,
      roleLabel: "Planning",
      locationLabel: "Vestiging",
      effectiveFrom: "2026-08-10",
    })).toBe(true);
    expect(useWorkforce.getState().roster.patterns.filter((pattern) => pattern.employeeId === "fixture-employee")).toHaveLength(3);

    expect(await useWorkforce.getState().submit("fixture-store", {
      leaveTypeId: "fixture-vacation",
      startDate: "2026-08-10",
      endDate: "2026-08-11",
      note: "Vakantie",
    })).toBe(true);
    const request = useWorkforce.getState().requests[0];
    expect(request.totalMinutes).toBe(912);
    expect(await useWorkforce.getState().decide("fixture-store", request.id, "approved", "Ok")).toBe(true);
    expect(useWorkforce.getState().requests[0].status).toBe("approved");
    expect(await useWorkforce.getState().withdraw("fixture-store", request.id)).toBe(true);
    expect(useWorkforce.getState().requests[0].status).toBe("cancelled");

    const account = useWorkforce.getState().balances[0];
    expect(await useWorkforce.getState().adjustBalance("fixture-store", account.accountId, 60, "Correctie")).toBe(true);
    expect(useWorkforce.getState().balances[0].availableMinutes).toBe(account.availableMinutes + 60);
  });

  it("reports empty source and publication errors without corrupting the range", async () => {
    const { useWorkforce } = await loadFixtureStore();
    await useWorkforce.getState().load("fixture-store");
    await useWorkforce.getState().loadRoster("fixture-store", "2026-08-10", "2026-08-23");

    expect(await useWorkforce.getState().copyWeek("fixture-store", "2026-08-03", "2026-08-10")).toBe(false);
    expect(useWorkforce.getState().error).toContain("vorige week");
    useWorkforce.getState().clearError();
    expect(useWorkforce.getState().error).toBeNull();
    expect(await useWorkforce.getState().publishRoster("fixture-store", "2026-08-10")).toBe(false);
    expect(useWorkforce.getState().error).toContain("minstens één");

    useWorkforce.getState().reset();
    expect(useWorkforce.getState().hydrated).toBe(false);
    expect(useWorkforce.getState().roster.employees).toEqual([]);
  });
});

describe("workforce error messages", () => {
  it("keeps structured backend detail and recognizes schema mismatch", async () => {
    const { workforceErrorMessage } = await loadFixtureStore();
    expect(workforceErrorMessage({ message: "roster:overlap:Deze medewerker heeft al een shift." })).toBe("Deze medewerker heeft al een shift.");
    expect(workforceErrorMessage({ code: "42501" })).toContain("geen toegang");
    expect(workforceErrorMessage({ code: "PGRST202", message: "schema cache" })).toContain("Supabase-migratie");
    expect(workforceErrorMessage({ details: "Technische fout" })).toBe("Technische fout");
  });
});
