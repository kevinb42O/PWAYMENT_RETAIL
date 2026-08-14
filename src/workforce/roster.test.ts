import { describe, expect, it } from "vitest";
import {
  activePatternForDate,
  addDays,
  addMonths,
  addYears,
  endOfMonth,
  localDateForTimestamp,
  localDateTimeToIso,
  monthCalendarDates,
  monthDates,
  startOfMonth,
  startOfIsoWeek,
  weekDates,
} from "./roster";

describe("workforce roster dates", () => {
  it("keeps Monday-first weeks stable across the Belgian DST boundary", () => {
    expect(startOfIsoWeek("2026-03-29")).toBe("2026-03-23");
    expect(addDays("2026-03-29", 1)).toBe("2026-03-30");
    expect(weekDates("2026-03-23")).toHaveLength(7);
  });

  it("converts Belgian local shift times correctly in winter and summer", () => {
    expect(localDateTimeToIso("2026-01-12", "09:00")).toBe("2026-01-12T08:00:00.000Z");
    expect(localDateTimeToIso("2026-08-10", "09:00")).toBe("2026-08-10T07:00:00.000Z");
    expect(localDateForTimestamp("2026-08-09T23:00:00.000Z")).toBe("2026-08-10");
  });

  it("navigates months and years without overflowing short months", () => {
    expect(startOfMonth("2027-07-19")).toBe("2027-07-01");
    expect(endOfMonth("2028-02-10")).toBe("2028-02-29");
    expect(addMonths("2027-01-31", 1)).toBe("2027-02-28");
    expect(addMonths("2027-12-15", 1)).toBe("2028-01-15");
    expect(addYears("2028-02-29", 1)).toBe("2029-02-28");
    expect(monthDates("2028-02-10")).toHaveLength(29);
  });

  it("builds Monday-first mini calendars for annual planning", () => {
    const july = monthCalendarDates(2027, 6);
    expect(july).toHaveLength(35);
    expect(july.slice(0, 3)).toEqual([null, null, null]);
    expect(july[3]).toBe("2027-07-01");
    expect(july.filter(Boolean).at(-1)).toBe("2027-07-31");
  });

  it("selects the newest effective work pattern for a concrete day", () => {
    const pattern = activePatternForDate([
      {
        id: "old",
        employeeId: "employee",
        weekday: 1,
        scheduledMinutes: 420,
        startTime: "09:00",
        endTime: "16:00",
        breakMinutes: 0,
        roleLabel: null,
        locationLabel: null,
        effectiveFrom: "2026-01-01",
        effectiveUntil: null,
      },
      {
        id: "new",
        employeeId: "employee",
        weekday: 1,
        scheduledMinutes: 456,
        startTime: "09:00",
        endTime: "17:00",
        breakMinutes: 24,
        roleLabel: "Verkoop",
        locationLabel: "Winkel",
        effectiveFrom: "2026-08-01",
        effectiveUntil: null,
      },
    ], "employee", "2026-08-10");

    expect(pattern?.id).toBe("new");
  });
});
