import type { WorkPattern } from "./types";

const isoDateFormatter = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const shortDayFormatter = new Intl.DateTimeFormat("nl-BE", {
  weekday: "short",
  day: "numeric",
  month: "short",
});

const longDateFormatter = new Intl.DateTimeFormat("nl-BE", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

const monthDayFormatter = new Intl.DateTimeFormat("nl-BE", {
  day: "numeric",
  month: "short",
});

const monthFormatter = new Intl.DateTimeFormat("nl-BE", {
  month: "long",
  year: "numeric",
});

const monthNameFormatter = new Intl.DateTimeFormat("nl-BE", {
  month: "long",
});

export const parseIsoDate = (value: string): Date => new Date(`${value}T12:00:00`);

export const toIsoDate = (value: Date): string => isoDateFormatter.format(value);

export const addDays = (value: string, amount: number): string => {
  const date = parseIsoDate(value);
  date.setDate(date.getDate() + amount);
  return toIsoDate(date);
};

export const startOfMonth = (value: string): string => `${value.slice(0, 7)}-01`;

export const endOfMonth = (value: string): string => {
  const date = parseIsoDate(startOfMonth(value));
  date.setMonth(date.getMonth() + 1);
  date.setDate(0);
  return toIsoDate(date);
};

export const addMonths = (value: string, amount: number): string => {
  const source = parseIsoDate(value);
  const desiredDay = source.getDate();
  source.setDate(1);
  source.setMonth(source.getMonth() + amount);
  const lastDay = Number(endOfMonth(toIsoDate(source)).slice(-2));
  source.setDate(Math.min(desiredDay, lastDay));
  return toIsoDate(source);
};

export const addYears = (value: string, amount: number): string => {
  const source = parseIsoDate(value);
  const month = source.getMonth();
  source.setFullYear(source.getFullYear() + amount);
  if (source.getMonth() !== month) source.setDate(0);
  return toIsoDate(source);
};

export const monthDates = (value: string): string[] => {
  const start = startOfMonth(value);
  const end = endOfMonth(value);
  const dates: string[] = [];
  for (let date = start; date <= end; date = addDays(date, 1)) dates.push(date);
  return dates;
};

export const monthCalendarDates = (year: number, monthIndex: number): Array<string | null> => {
  const start = `${year}-${String(monthIndex + 1).padStart(2, "0")}-01`;
  const leading = isoWeekday(start) - 1;
  const cells: Array<string | null> = Array.from({ length: leading }, () => null);
  cells.push(...monthDates(start));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
};

export const startOfIsoWeek = (value: string): string => {
  const date = parseIsoDate(value);
  const weekday = date.getDay() || 7;
  date.setDate(date.getDate() - weekday + 1);
  return toIsoDate(date);
};

export const isoWeekday = (value: string): number => {
  const day = parseIsoDate(value).getDay();
  return day === 0 ? 7 : day;
};

export const weekDates = (weekStart: string): string[] =>
  Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));

export const formatShortDay = (value: string): string =>
  shortDayFormatter.format(parseIsoDate(value)).replace(".", "");

export const formatLongDate = (value: string): string =>
  longDateFormatter.format(parseIsoDate(value));

export const formatWeekRange = (weekStart: string): string => {
  const weekEnd = addDays(weekStart, 6);
  const start = parseIsoDate(weekStart);
  const end = parseIsoDate(weekEnd);
  if (start.getMonth() === end.getMonth()) {
    return `${start.getDate()}–${monthDayFormatter.format(end)}`;
  }
  return `${monthDayFormatter.format(start)} – ${monthDayFormatter.format(end)}`;
};

export const formatMonth = (value: string): string => monthFormatter.format(parseIsoDate(value));

export const formatMonthName = (year: number, monthIndex: number): string =>
  monthNameFormatter.format(new Date(year, monthIndex, 1));

export const formatTime = (value: string, timeZone = "Europe/Brussels"): string =>
  new Intl.DateTimeFormat("nl-BE", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  }).format(new Date(value));

export const localDateForTimestamp = (value: string, timeZone = "Europe/Brussels"): string =>
  new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  }).format(new Date(value));

export const localTimeForTimestamp = (value: string, timeZone = "Europe/Brussels"): string =>
  new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  }).format(new Date(value));

const timeZoneOffset = (instant: Date, timeZone: string): number => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).formatToParts(instant);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const represented = Date.UTC(
    Number(value.year),
    Number(value.month) - 1,
    Number(value.day),
    Number(value.hour),
    Number(value.minute),
    Number(value.second),
  );
  return represented - instant.getTime();
};

export const localDateTimeToIso = (
  date: string,
  time: string,
  timeZone = "Europe/Brussels",
): string => {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const wallClock = Date.UTC(year, month - 1, day, hour, minute, 0);
  let instant = new Date(wallClock);
  instant = new Date(wallClock - timeZoneOffset(instant, timeZone));
  instant = new Date(wallClock - timeZoneOffset(instant, timeZone));
  return instant.toISOString();
};

export const activePatternForDate = (
  patterns: WorkPattern[],
  employeeId: string,
  date: string,
): WorkPattern | null =>
  patterns
    .filter(
      (pattern) =>
        pattern.employeeId === employeeId &&
        pattern.weekday === isoWeekday(date) &&
        pattern.effectiveFrom <= date &&
        (!pattern.effectiveUntil || pattern.effectiveUntil >= date),
    )
    .sort((left, right) => right.effectiveFrom.localeCompare(left.effectiveFrom))[0] ?? null;

export const durationMinutes = (startsAt: string, endsAt: string, breakMinutes = 0): number =>
  Math.max(0, Math.round((new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 60_000) - breakMinutes);
