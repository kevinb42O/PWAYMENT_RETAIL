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
  employee: WorkforceEmployee | null;
  canManage: boolean;
  leaveTypes: LeaveType[];
  balances: LeaveBalance[];
  requests: LeaveRequest[];
  team: WorkforceEmployee[];
  competencies: WorkforceCompetency[];
  coverageRules: CoverageRule[];
}
