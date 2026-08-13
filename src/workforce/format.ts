import type { LeaveRequestStatus } from "./types";

export const formatMinutes = (minutes: number): string => {
  const sign = minutes < 0 ? "−" : "";
  const absolute = Math.abs(minutes);
  const hours = Math.floor(absolute / 60);
  const remainder = absolute % 60;
  return remainder === 0 ? `${sign}${hours} u` : `${sign}${hours} u ${remainder} min`;
};

export const formatWorkdays = (minutes: number, dailyMinutes = 456): string => {
  if (dailyMinutes <= 0) return formatMinutes(minutes);
  const days = minutes / dailyMinutes;
  return `${new Intl.NumberFormat("nl-BE", { maximumFractionDigits: 1 }).format(days)} dagen`;
};

export const leaveStatusLabel: Record<LeaveRequestStatus, string> = {
  pending: "Te beoordelen",
  approved: "Goedgekeurd",
  rejected: "Afgewezen",
  withdrawn: "Ingetrokken",
  cancelled: "Geannuleerd",
};

export const todayIso = (): string => {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
};

