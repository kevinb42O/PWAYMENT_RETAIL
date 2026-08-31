import type { Role } from "../types";

export type PosAccessStatus =
  | "idle"
  | "loading"
  | "setup-required"
  | "locked"
  | "verifying"
  | "pin-change-required"
  | "active"
  | "device-revoked"
  | "error";

export interface PosOperator {
  id: string;
  displayName: string;
  role: Role;
  jobTitle?: string | null;
  status?: "active" | "suspended" | "inactive";
  employeeNumber?: string | null;
  workforceEmployeeId?: string | null;
  offlineAccessEnabled?: boolean;
  mustChangePin?: boolean;
  pinConfigured?: boolean;
  lockedUntil?: string | null;
  lastLoginAt?: string | null;
  lastLoginDeviceId?: string | null;
}
export interface PosDevice {
  id: string;
  name: string;
  status: "active" | "revoked" | "retired";
  registerId?: string | null;
  offlineGraceHours: number;
  lastSeenAt?: string;
  pairedAt?: string;
}

export interface PosAccessEvent {
  id: number;
  eventType: string;
  success: boolean;
  operatorId?: string | null;
  actorOperatorId?: string | null;
  deviceId?: string | null;
  detail: Record<string, unknown>;
  occurredAt: string;
}

export interface PosAccessAdminSnapshot {
  operators: PosOperator[];
  devices: PosDevice[];
  events: PosAccessEvent[];
}
