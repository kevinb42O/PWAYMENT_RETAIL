export type LeaveRequestStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "withdrawn"
  | "cancelled";
export type CoverageRisk = "green" | "amber" | "red" | "unknown";

export interface WorkforceEmployee {
  id: string;
  displayName: string;
  employeeNumber: string | null;
  email?: string | null;
  status: "active" | "inactive" | "leave";
  weeklyMinutes?: number;
  scheduledDays?: number;
  competencyIds?: string[];
}

export interface LeaveType {
  id: string;
  code: string;
  name: string;
  color: string;
  requiresBalance: boolean;
  paid: boolean;
  approvalRequired: boolean;
  minimumNoticeDays: number;
}

export interface LeaveBalance {
  accountId: string;
  employeeId: string;
  leaveTypeId: string;
  leaveTypeName: string;
  year: number;
  status: "estimated" | "confirmed" | "imported";
  grantedMinutes: number;
  availableMinutes: number;
}

export interface CoverageDetail {
  date: string;
  ruleId: string;
  rule: string;
  remaining: number;
  minimum: number;
  risk: CoverageRisk;
}

export interface CoverageSnapshot {
  risk: CoverageRisk;
  summary: string;
  details: CoverageDetail[];
  calculatedAt: string;
  advisoryOnly: boolean;
}

export interface LeaveRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  leaveTypeId: string;
  leaveTypeName: string;
  leaveTypeColor: string;
  startDate: string;
  endDate: string;
  totalMinutes: number;
  status: LeaveRequestStatus;
  employeeNote: string | null;
  decisionNote: string | null;
  coverageRisk: CoverageRisk;
  coverageSnapshot: CoverageSnapshot;
  submittedAt: string;
  decidedAt: string | null;
}

export interface WorkforceCompetency {
  id: string;
  code: string;
  name: string;
  description: string | null;
  active: boolean;
}

export interface CoverageRule {
  id: string;
  name: string;
  weekday: number | null;
  competencyId: string | null;
  minimumPresent: number;
  active: boolean;
}

export interface WorkforceBootstrap {
  schemaVersion?: number;
  employee: WorkforceEmployee | null;
  canManage: boolean;
  /** Only the signed-in owner receives this flag; the PIN itself never leaves the server. */
  approvalPinConfigured?: boolean;
  leaveTypes: LeaveType[];
  balances: LeaveBalance[];
  requests: LeaveRequest[];
  team: WorkforceEmployee[];
  competencies: WorkforceCompetency[];
  coverageRules: CoverageRule[];
}

export type RosterStatus = "draft" | "published" | "locked";
export type RosterShiftSource = "manual" | "pattern" | "copied" | "imported";

export interface WorkPattern {
  id: string;
  employeeId: string;
  weekday: number;
  scheduledMinutes: number;
  startTime: string | null;
  endTime: string | null;
  breakMinutes: number;
  roleLabel: string | null;
  locationLabel: string | null;
  effectiveFrom: string;
  effectiveUntil: string | null;
}

export interface WorkforceRoster {
  id: string;
  weekStart: string;
  status: RosterStatus;
  version: number;
  publishedAt: string | null;
}

export interface WorkforceShift {
  id: string;
  rosterId: string;
  employeeId: string;
  startsAt: string;
  endsAt: string;
  breakMinutes: number;
  paidMinutes: number;
  roleLabel: string | null;
  locationLabel: string | null;
  note: string | null;
  source: RosterShiftSource;
  version: number;
  rosterStatus: RosterStatus;
  rosterVersion: number;
  weekStart: string;
}

export interface RosterLeave {
  requestId: string;
  employeeId: string;
  startDate: string;
  endDate: string;
  status: "pending" | "approved";
  leaveTypeName: string;
  leaveTypeColor: string;
  coverageRisk: CoverageRisk;
}

export interface WorkforceCalendarDay {
  date: string;
  name: string;
  type: "public_holiday" | "closure" | "special_opening";
  consumesLeave: boolean;
}

export interface WorkforceAvailability {
  id: string;
  employeeId: string;
  startsAt: string;
  endsAt: string;
  availability: "available" | "unavailable" | "preferred";
  note: string | null;
}

export interface RosterCoverageDay {
  date: string;
  scheduled: number;
  minimum: number;
  risk: Exclude<CoverageRisk, "unknown">;
  missingCompetencies: string[];
}

export interface WorkforceRosterRange {
  schemaVersion: number;
  rangeStart: string;
  rangeEnd: string;
  timezone: string;
  canManage: boolean;
  employees: WorkforceEmployee[];
  patterns: WorkPattern[];
  rosters: WorkforceRoster[];
  shifts: WorkforceShift[];
  leave: RosterLeave[];
  calendarDays: WorkforceCalendarDay[];
  availability: WorkforceAvailability[];
  coverage: RosterCoverageDay[];
}

export interface DaySchedule {
  weekday: number;
  startTime: string;
  endTime: string;
  breakMinutes: number;
}

export interface SaveShiftInput {
  shiftId?: string;
  employeeId: string;
  startsAt: string;
  endsAt: string;
  breakMinutes: number;
  roleLabel: string;
  locationLabel: string;
  note: string;
  expectedRosterVersion?: number;
  expectedShiftVersion?: number;
}

export interface SavePatternInput {
  employeeId: string;
  weekdays: number[];
  startTime: string;
  endTime: string;
  breakMinutes: number;
  roleLabel: string;
  locationLabel: string;
  effectiveFrom: string;
  daySchedules?: DaySchedule[];
}

export interface SaveEmployeeInput {
  id?: string;
  displayName: string;
  employeeNumber?: string;
  email?: string;
  status?: "active" | "inactive" | "leave";
  startDate?: string;
  weeklyMinutes?: number;
  competencyIds?: string[];
  initialSchedule?: {
    weekdays: number[];
    startTime: string;
    endTime: string;
    breakMinutes: number;
    roleLabel?: string;
    locationLabel?: string;
  };
  /**
   * Optional local register access. It is deliberately separate from employment
   * data: a workforce employee does not automatically receive a POS login.
   */
  posAccess?: {
    role: import("../types").Role;
    pinHash: string;
    jobTitle?: string;
    /** Retains the historic local POS identity when it predates workforce. */
    localUserId?: string;
  };
}

export interface BatchApplyPatternsInput {
  startDate: string;
  endDate: string;
  employeeIds?: string[];
  overwriteManualShifts?: boolean;
}
