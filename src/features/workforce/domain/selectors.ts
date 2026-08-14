import { activePatternForDate, localDateForTimestamp } from "../../../workforce/roster";
import type { RosterLeave, WorkforceShift, WorkPattern } from "../../../workforce/types";

export const shiftsForEmployeeDate = (
  shifts: WorkforceShift[],
  employeeId: string,
  date: string,
  timezone: string,
) => shifts.filter((shift) => shift.employeeId === employeeId && localDateForTimestamp(shift.startsAt, timezone) === date);

export const leaveForEmployeeDate = (
  leave: RosterLeave[],
  employeeId: string,
  date: string,
) => leave.find((entry) => entry.employeeId === employeeId && entry.startDate <= date && entry.endDate >= date);

export const scheduledMinutesForDates = (
  dates: string[],
  employeeId: string,
  shifts: WorkforceShift[],
  patterns: WorkPattern[],
  leave: RosterLeave[],
  timezone: string,
) => dates.reduce((total, date) => {
  const absence = leaveForEmployeeDate(leave, employeeId, date);
  if (absence?.status === "approved") return total;
  const dayShifts = shiftsForEmployeeDate(shifts, employeeId, date, timezone);
  if (dayShifts.length) return total + dayShifts.reduce((minutes, shift) => minutes + shift.paidMinutes, 0);
  return total + (activePatternForDate(patterns, employeeId, date)?.scheduledMinutes ?? 0);
}, 0);
