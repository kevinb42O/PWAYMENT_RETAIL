export const STORE_TIME_ZONE = 'Europe/Brussels';

const formatterCache = new Map<string, Intl.DateTimeFormat>();

const formatter = (timeZone: string) => {
  let value = formatterCache.get(timeZone);
  if (!value) {
    value = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    formatterCache.set(timeZone, value);
  }
  return value;
};

export interface ZonedDateParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export const getZonedDateParts = (timestamp: number, timeZone = STORE_TIME_ZONE): ZonedDateParts => {
  const parts = Object.fromEntries(
    formatter(timeZone).formatToParts(new Date(timestamp))
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  );
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
};

const timeZoneOffsetMs = (timestamp: number, timeZone: string): number => {
  const parts = getZonedDateParts(timestamp, timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - Math.floor(timestamp / 1000) * 1000;
};

export const zonedDateTimeToTimestamp = (
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  millisecond = 0,
  timeZone = STORE_TIME_ZONE,
): number => {
  const wallClockUtc = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
  let candidate = wallClockUtc - timeZoneOffsetMs(wallClockUtc, timeZone);
  candidate = wallClockUtc - timeZoneOffsetMs(candidate, timeZone);
  return candidate;
};

export const endOfStoreDate = (dateOnly: string, timeZone = STORE_TIME_ZONE): number | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOnly);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return zonedDateTimeToTimestamp(
    next.getUTCFullYear(),
    next.getUTCMonth() + 1,
    next.getUTCDate(),
    0,
    0,
    0,
    0,
    timeZone,
  ) - 1;
};

export const storeCalendarDayNumber = (timestamp: number, timeZone = STORE_TIME_ZONE): number => {
  const parts = getZonedDateParts(timestamp, timeZone);
  return Math.floor(Date.UTC(parts.year, parts.month - 1, parts.day) / 86_400_000);
};

export const calendarDayDifference = (later: number, earlier: number, timeZone = STORE_TIME_ZONE): number =>
  storeCalendarDayNumber(later, timeZone) - storeCalendarDayNumber(earlier, timeZone);

