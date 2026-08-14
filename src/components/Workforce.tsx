import React, { useEffect, useState, type FocusEvent, type PointerEvent } from "react";
import {
  AlertCircle,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Filter,
  KeyRound,
  LockKeyhole,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Send,
  Settings2,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useAuth } from "../auth/useAuth";
import { supabase } from "../lib/supabase";
import { useWorkforce } from "../store/useWorkforce";
import {
  FloatingTooltip,
  tooltipPositionFromElement,
  type ChartTooltipPosition,
} from "./insights/InsightPrimitives";
import {
  activePatternForDate,
  addDays,
  addMonths,
  addYears,
  endOfMonth,
  formatLongDate,
  formatMonth,
  formatShortDay,
  formatTime,
  formatWeekRange,
  localDateForTimestamp,
  localDateTimeToIso,
  localTimeForTimestamp,
  monthDates,
  startOfMonth,
  startOfIsoWeek,
  weekDates,
} from "../workforce/roster";
import { formatMinutes, formatWorkdays, leaveStatusLabel, todayIso } from "../workforce/format";
import type {
  LeaveRequest,
  RosterLeave,
  SaveShiftInput,
  WorkforceEmployee,
  WorkforceShift,
  WorkPattern,
} from "../workforce/types";
import { AnnualLeavePlanner, MonthlyRosterGrid } from "./workforce/WorkforcePlanningViews";
import { Modal } from "./Modal";
import { AppPageShell } from "./ui/Page";
import { FeedbackBanner } from "./ui/FeedbackBanner";
import { SegmentedTabs } from "./ui/SegmentedTabs";
import { fieldClassName } from "./ui/Field";
import {
  leaveForEmployeeDate,
  scheduledMinutesForDates,
  shiftsForEmployeeDate,
} from "../features/workforce/domain/selectors";

type WorkforceTab = "roster" | "leave" | "balances";
type RosterView = "day" | "week" | "month" | "year";

const controlClass = "inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition hover:border-[#8bdce8] hover:bg-[#f3fbfc] hover:text-[#0f6f7e] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#38bdf8] disabled:cursor-not-allowed disabled:opacity-50";
const fieldClass = fieldClassName;
const rosterCellWidth = 164;

const Dialog = ({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) => (
  <Modal open onClose={onClose} title={title} size="2xl" closeOnBackdrop>
    {children}
  </Modal>
);

const ShiftTooltip = ({
  shift,
  pattern,
  employee,
  date,
  timeZone,
  position,
}: {
  shift?: WorkforceShift;
  pattern?: WorkPattern;
  employee: WorkforceEmployee;
  date: string;
  timeZone: string;
  position: ChartTooltipPosition;
}) => {
  const start = shift ? formatTime(shift.startsAt, timeZone) : pattern?.startTime;
  const end = shift ? formatTime(shift.endsAt, timeZone) : pattern?.endTime;
  const paidMinutes = shift?.paidMinutes ?? pattern?.scheduledMinutes ?? 0;
  const source = shift
    ? shift.source === "manual" ? "Handmatig" : shift.source === "pattern" ? "Werkpatroon" : shift.source === "copied" ? "Gekopieerd" : "Import"
    : "Normaal werkpatroon";
  return (
    <FloatingTooltip position={position} variant="light">
      <div className="min-w-56">
        <p className="text-xs font-bold text-slate-950">{employee.displayName}</p>
        <p className="mt-0.5 text-[11px] text-slate-500">{formatLongDate(date)}</p>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[11px]">
          <dt className="text-slate-500">Uren</dt><dd className="text-right font-bold tabular-nums text-slate-800">{start}–{end}</dd>
          <dt className="text-slate-500">Betaald</dt><dd className="text-right font-semibold text-slate-700">{formatMinutes(paidMinutes)}</dd>
          <dt className="text-slate-500">Pauze</dt><dd className="text-right font-semibold text-slate-700">{shift?.breakMinutes ?? pattern?.breakMinutes ?? 0} min</dd>
          <dt className="text-slate-500">Functie</dt><dd className="text-right font-semibold text-slate-700">{shift?.roleLabel ?? pattern?.roleLabel ?? "Niet ingesteld"}</dd>
          <dt className="text-slate-500">Locatie</dt><dd className="text-right font-semibold text-slate-700">{shift?.locationLabel ?? pattern?.locationLabel ?? "Hoofdvestiging"}</dd>
          <dt className="text-slate-500">Bron</dt><dd className="text-right font-semibold text-slate-700">{source}</dd>
          {shift && <><dt className="text-slate-500">Status</dt><dd className="text-right font-semibold text-slate-700">{shift.rosterStatus === "draft" ? "Concept" : "Gepubliceerd"}</dd></>}
        </dl>
      </div>
    </FloatingTooltip>
  );
};

const RosterShiftBlock = ({
  shift,
  pattern,
  employee,
  date,
  timeZone,
  canEdit,
  onOpen,
}: {
  shift?: WorkforceShift;
  pattern?: WorkPattern;
  employee: WorkforceEmployee;
  date: string;
  timeZone: string;
  canEdit: boolean;
  onOpen: () => void;
}) => {
  const [position, setPosition] = useState<ChartTooltipPosition | null>(null);
  const start = shift ? formatTime(shift.startsAt, timeZone) : pattern?.startTime;
  const end = shift ? formatTime(shift.endsAt, timeZone) : pattern?.endTime;
  const activatePointer = (event: PointerEvent<HTMLButtonElement>) => setPosition({ x: event.clientX, y: event.clientY });
  const activateFocus = (event: FocusEvent<HTMLButtonElement>) => setPosition(tooltipPositionFromElement(event.currentTarget));
  return (
    <button
      type="button"
      onClick={onOpen}
      onPointerEnter={activatePointer}
      onPointerMove={activatePointer}
      onPointerLeave={() => setPosition(null)}
      onFocus={activateFocus}
      onBlur={() => setPosition(null)}
      className={`relative w-full rounded-lg border px-2.5 py-2 text-left outline-none transition focus-visible:ring-2 focus-visible:ring-[#38bdf8] ${
        shift
          ? shift.rosterStatus === "draft"
            ? "border-[#bae6fd] bg-[#f0f9ff] text-[#0e7490] hover:border-[#8bdce8]"
            : "border-slate-300 bg-white text-slate-900 hover:bg-slate-50"
          : "border-dashed border-slate-300 bg-slate-50/60 text-slate-600 hover:border-slate-400 hover:bg-slate-50"
      }`}
      aria-label={`${employee.displayName}, ${formatLongDate(date)}, ${start} tot ${end}${shift ? "" : ", normaal werkpatroon"}${canEdit ? ", openen" : ""}`}
    >
      {position && <ShiftTooltip shift={shift} pattern={pattern} employee={employee} date={date} timeZone={timeZone} position={position} />}
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs font-bold tabular-nums">{start}–{end}</span>
        {shift?.rosterStatus === "draft" && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#0e7490]" aria-label="Concept" />}
      </div>
      <p className="mt-1 truncate text-[10px] font-semibold opacity-75">
        {shift?.roleLabel ?? pattern?.roleLabel ?? (shift ? "Shift" : "Werkpatroon")}
      </p>
    </button>
  );
};

const ShiftEditor = ({
  employee,
  date,
  shift,
  pattern,
  timeZone,
  busy,
  onClose,
  onSave,
  onDelete,
}: {
  employee: WorkforceEmployee;
  date: string;
  shift: WorkforceShift | null;
  pattern: WorkPattern | null;
  timeZone: string;
  busy: boolean;
  onClose: () => void;
  onSave: (input: SaveShiftInput) => Promise<boolean>;
  onDelete: (() => Promise<boolean>) | null;
}) => {
  const [form, setForm] = useState(() => ({
    startTime: shift ? localTimeForTimestamp(shift.startsAt, timeZone) : pattern?.startTime ?? "09:00",
    endTime: shift ? localTimeForTimestamp(shift.endsAt, timeZone) : pattern?.endTime ?? "17:00",
    breakMinutes: String(shift?.breakMinutes ?? pattern?.breakMinutes ?? 30),
    roleLabel: shift?.roleLabel ?? pattern?.roleLabel ?? "",
    locationLabel: shift?.locationLabel ?? pattern?.locationLabel ?? "",
    note: shift?.note ?? "",
  }));
  const [validation, setValidation] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const startsAt = localDateTimeToIso(date, form.startTime, timeZone);
    let endsAt = localDateTimeToIso(date, form.endTime, timeZone);
    if (new Date(endsAt) <= new Date(startsAt)) endsAt = localDateTimeToIso(addDays(date, 1), form.endTime, timeZone);
    const breakMinutes = Number(form.breakMinutes);
    if (!Number.isInteger(breakMinutes) || breakMinutes < 0) {
      setValidation("Geef een geldige pauzeduur in.");
      return;
    }
    const success = await onSave({
      shiftId: shift?.id,
      employeeId: employee.id,
      startsAt,
      endsAt,
      breakMinutes,
      roleLabel: form.roleLabel.trim(),
      locationLabel: form.locationLabel.trim(),
      note: form.note.trim(),
      expectedRosterVersion: shift?.rosterVersion,
      expectedShiftVersion: shift?.version,
    });
    if (success) onClose();
  };

  return (
    <Dialog title={shift ? "Shift bewerken" : "Shift toevoegen"} onClose={onClose}>
      <form onSubmit={submit} className="p-5">
        <div className="mb-5 flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-full border border-slate-200 bg-white text-xs font-bold text-slate-700">{employee.displayName.slice(0, 1)}</span>
          <div><p className="text-sm font-bold text-slate-900">{employee.displayName}</p><p className="text-xs text-slate-500">{formatLongDate(date)}</p></div>
        </div>
        {(validation) && <p className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800" role="alert">{validation}</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-xs font-bold text-slate-600">Start<input type="time" required value={form.startTime} onChange={(event) => setForm({ ...form, startTime: event.target.value })} className={fieldClass} /></label>
          <label className="text-xs font-bold text-slate-600">Einde<input type="time" required value={form.endTime} onChange={(event) => setForm({ ...form, endTime: event.target.value })} className={fieldClass} /></label>
          <label className="text-xs font-bold text-slate-600">Pauze in minuten<input type="number" min="0" max="720" required value={form.breakMinutes} onChange={(event) => setForm({ ...form, breakMinutes: event.target.value })} className={fieldClass} /></label>
          <label className="text-xs font-bold text-slate-600">Functie<input value={form.roleLabel} onChange={(event) => setForm({ ...form, roleLabel: event.target.value })} className={fieldClass} placeholder="bv. Verkoop" /></label>
          <label className="text-xs font-bold text-slate-600 sm:col-span-2">Locatie<input value={form.locationLabel} onChange={(event) => setForm({ ...form, locationLabel: event.target.value })} className={fieldClass} placeholder="bv. Hoofdvestiging" /></label>
          <label className="text-xs font-bold text-slate-600 sm:col-span-2">Notitie<textarea value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} rows={3} maxLength={1000} className={fieldClass} /></label>
        </div>
        <footer className="mt-6 flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <div>{onDelete && <button type="button" disabled={busy} onClick={async () => { if (window.confirm("Deze shift verwijderen?") && await onDelete()) onClose(); }} className="inline-flex h-9 items-center gap-2 rounded-lg border border-rose-200 bg-white px-3 text-xs font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50"><Trash2 size={15} /> Verwijderen</button>}</div>
          <div className="flex gap-2"><button type="button" onClick={onClose} className={controlClass}>Annuleren</button><button type="submit" disabled={busy} className={`${controlClass} border-cyan-200 bg-cyan-50 text-cyan-800 hover:bg-cyan-100`}><Check size={15} /> Bewaren</button></div>
        </footer>
      </form>
    </Dialog>
  );
};

const LeaveRequestDialog = ({
  leaveTypes,
  balances,
  employeeId,
  patterns,
  initialStartDate,
  busy,
  onClose,
  onSubmit,
}: {
  leaveTypes: ReturnType<typeof useWorkforce.getState>["leaveTypes"];
  balances: ReturnType<typeof useWorkforce.getState>["balances"];
  employeeId?: string;
  patterns: WorkPattern[];
  initialStartDate: string;
  busy: boolean;
  onClose: () => void;
  onSubmit: (input: { leaveTypeId: string; startDate: string; endDate: string; note: string }) => Promise<boolean>;
}) => {
  const firstDate = initialStartDate >= todayIso() ? initialStartDate : todayIso();
  const [form, setForm] = useState({ leaveTypeId: leaveTypes[0]?.id ?? "", startDate: firstDate, endDate: firstDate, note: "" });
  const leaveType = leaveTypes.find((type) => type.id === form.leaveTypeId);
  const minimumDate = addDays(todayIso(), leaveType?.minimumNoticeDays ?? 0);
  const years = Array.from(new Set([Number(form.startDate.slice(0, 4)), Number(form.endDate.slice(0, 4))]));
  const relevantBalances = balances.filter((balance) => balance.employeeId === employeeId && balance.leaveTypeId === form.leaveTypeId && years.includes(balance.year));
  const requestedByYear: Record<number, number> = {};
  let estimatedMinutes = 0;
  for (let date = form.startDate; date <= form.endDate; date = addDays(date, 1)) {
    const minutes = activePatternForDate(patterns, employeeId ?? "", date)?.scheduledMinutes ?? 0;
    const year = Number(date.slice(0, 4));
    estimatedMinutes += minutes;
    requestedByYear[year] = (requestedByYear[year] ?? 0) + minutes;
  }
  const missingBalanceYears = leaveType?.requiresBalance
    ? years.filter((year) => !relevantBalances.some((balance) => balance.year === year))
    : [];
  const insufficientYears = leaveType?.requiresBalance
    ? years.filter((year) => {
      const balance = relevantBalances.find((item) => item.year === year);
      return Boolean(balance && balance.availableMinutes < (requestedByYear[year] ?? 0));
    })
    : [];
  const balanceReady = missingBalanceYears.length === 0 && insufficientYears.length === 0;
  return (
    <Dialog title="Verlof aanvragen" onClose={onClose}>
      <form onSubmit={async (event) => { event.preventDefault(); if (await onSubmit(form)) onClose(); }} className="space-y-4 p-5">
        <label className="block text-xs font-bold text-slate-600">Verloftype<select required value={form.leaveTypeId} onChange={(event) => { const type = leaveTypes.find((item) => item.id === event.target.value); const nextMinimum = addDays(todayIso(), type?.minimumNoticeDays ?? 0); const startDate = form.startDate < nextMinimum ? nextMinimum : form.startDate; setForm({ ...form, leaveTypeId: event.target.value, startDate, endDate: form.endDate < startDate ? startDate : form.endDate }); }} className={fieldClass}>{leaveTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</select></label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-xs font-bold text-slate-600">Van<input aria-label="Van" type="date" min={minimumDate} required value={form.startDate} onChange={(event) => setForm({ ...form, startDate: event.target.value, endDate: event.target.value > form.endDate ? event.target.value : form.endDate })} className={fieldClass} /></label>
          <label className="text-xs font-bold text-slate-600">Tot en met<input aria-label="Tot en met" type="date" min={form.startDate} required value={form.endDate} onChange={(event) => setForm({ ...form, endDate: event.target.value })} className={fieldClass} /></label>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
          <p className="text-xs font-bold text-slate-800">{formatLongDate(form.startDate)}{form.endDate !== form.startDate ? ` – ${formatLongDate(form.endDate)}` : ""}</p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
            {estimatedMinutes > 0 && <span>Volgens je werkpatroon: <strong className="text-slate-700">{formatMinutes(estimatedMinutes)}</strong></span>}
            {relevantBalances.map((balance) => <span key={balance.accountId}>{balance.year}: <strong className="text-slate-700">{formatWorkdays(balance.availableMinutes)}</strong> beschikbaar</span>)}
          </div>
          {missingBalanceYears.length > 0 && <p className="mt-2 text-[11px] font-semibold text-amber-700">Voor {missingBalanceYears.join(" en ")} is nog geen verlofsaldo ingesteld.</p>}
          {insufficientYears.length > 0 && <p className="mt-2 text-[11px] font-semibold text-rose-700">Onvoldoende beschikbaar verlofsaldo voor {insufficientYears.join(" en ")}.</p>}
        </div>
        <label className="block text-xs font-bold text-slate-600">Toelichting<textarea aria-label="Toelichting" value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} rows={3} maxLength={2000} className={fieldClass} /></label>
        <footer className="flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={onClose} className={controlClass}>Annuleren</button><button type="submit" disabled={busy || !form.leaveTypeId || !balanceReady} className={`${controlClass} border-cyan-200 bg-cyan-50 text-cyan-800 hover:bg-cyan-100`}><Send size={15} /> Aanvraag indienen</button></footer>
      </form>
    </Dialog>
  );
};

const CoverageBadge = ({ request }: { request: LeaveRequest }) => {
  const tone = request.coverageRisk === "red"
    ? "border-rose-200 bg-rose-50 text-rose-700"
    : request.coverageRisk === "amber"
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : "border-emerald-200 bg-emerald-50 text-emerald-700";
  const label = request.coverageRisk === "red"
    ? "Planning onder minimum"
    : request.coverageRisk === "amber"
      ? "Planning vraagt aandacht"
      : "Geen conflict voorzien";
  return <div><span className={`inline-flex rounded-md border px-2 py-1 text-[11px] font-bold ${tone}`}>{label}</span><p className="mt-1 max-w-64 text-[11px] leading-4 text-slate-500">{request.coverageSnapshot.summary}</p></div>;
};

const LeaveRow = ({ request, ownEmployeeId, canApprove, busy, onDecision, onWithdraw }: {
  request: LeaveRequest;
  ownEmployeeId?: string;
  canApprove: boolean;
  busy: boolean;
  onDecision: (request: LeaveRequest, decision: "approved" | "rejected") => void;
  onWithdraw: (request: LeaveRequest) => void;
}) => {
  const own = request.employeeId === ownEmployeeId;
  return (
    <tr className="border-b border-slate-100 last:border-0">
      <td className="px-4 py-3"><p className="text-sm font-bold text-slate-900">{request.employeeName}</p><p className="text-xs text-slate-500">{request.leaveTypeName}</p></td>
      <td className="px-4 py-3 text-xs text-slate-600">{request.startDate} – {request.endDate}</td>
      <td className="px-4 py-3 text-xs font-semibold text-slate-700">{formatMinutes(request.totalMinutes)}</td>
      <td className="px-4 py-3"><CoverageBadge request={request} /></td>
      <td className="px-4 py-3"><span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-bold text-slate-700">{leaveStatusLabel[request.status]}</span></td>
      <td className="px-4 py-3 text-right">
        <div className="inline-flex gap-2">
          {canApprove && !own && request.status === "pending" && <><button type="button" disabled={busy} onClick={() => onDecision(request, "rejected")} className="rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-50">Afwijzen</button><button type="button" disabled={busy} onClick={() => onDecision(request, "approved")} className="rounded-lg border border-cyan-200 bg-cyan-50 px-2.5 py-1.5 text-xs font-bold text-cyan-800 hover:bg-cyan-100">Beoordelen</button></>}
          {canApprove && own && request.status === "pending" && <span className="max-w-32 text-right text-[11px] font-semibold leading-4 text-slate-400">Een andere eigenaar moet jouw aanvraag behandelen.</span>}
          {own && (request.status === "pending" || request.status === "approved") && <button type="button" disabled={busy} onClick={() => onWithdraw(request)} className={controlClass}>Intrekken</button>}
        </div>
      </td>
    </tr>
  );
};

export const Workforce: React.FC = () => {
  const { currentStoreId, currentRole, verifyCurrentOwnerPin } = useAuth();
  const storeId = currentStoreId ?? (import.meta.env.VITE_E2E_BUILD === "true" ? "fixture-store" : null);
  const workforce = useWorkforce();
  const [tab, setTab] = useState<WorkforceTab>("roster");
  const [view, setView] = useState<RosterView>("week");
  const [selectedDate, setSelectedDate] = useState(todayIso());
  const [employeeFilter, setEmployeeFilter] = useState("all");
  const [editor, setEditor] = useState<{ employee: WorkforceEmployee; date: string; shift: WorkforceShift | null; pattern: WorkPattern | null } | null>(null);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaveStartDate, setLeaveStartDate] = useState(todayIso());
  const [decision, setDecision] = useState<{ request: LeaveRequest; type: "approved" | "rejected" } | null>(null);
  const [decisionNote, setDecisionNote] = useState("");
  const [decisionPin, setDecisionPin] = useState("");
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [approvalPinOpen, setApprovalPinOpen] = useState(false);
  const [approvalPin, setApprovalPin] = useState("");
  const [approvalPinConfirmation, setApprovalPinConfirmation] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [actionsOpen, setActionsOpen] = useState(false);
  const weekStart = startOfIsoWeek(selectedDate);
  const monthStart = startOfMonth(selectedDate);
  const rangeStart = view === "week" ? weekStart : view === "day" ? selectedDate : monthStart;
  const rangeEnd = view === "week" ? addDays(weekStart, 6) : view === "day" ? selectedDate : endOfMonth(monthStart);
  const canManage = workforce.roster.canManage && (currentRole === "owner" || currentRole === "manager");
  // Requests and decisions deliberately live outside this shared employee page.
  // Owners use the PIN-gated approval centre from Settings instead.
  const canApproveLeave = false;

  useEffect(() => {
    if (!storeId) return;
    void workforce.load(storeId);
    void workforce.loadRoster(storeId, rangeStart, rangeEnd);
  }, [storeId, rangeStart, rangeEnd, workforce.load, workforce.loadRoster]);

  useEffect(() => {
    if (!storeId || import.meta.env.VITE_E2E_BUILD === "true") return;
    let timer: number | null = null;
    const refresh = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => void workforce.loadRoster(storeId, rangeStart, rangeEnd, true), 180);
    };
    const channel = supabase.channel(`workforce-roster:${storeId}:${rangeStart}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "workforce_rosters", filter: `store_id=eq.${storeId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "workforce_shifts", filter: `store_id=eq.${storeId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "leave_requests", filter: `store_id=eq.${storeId}` }, refresh)
      .subscribe();
    return () => { if (timer) window.clearTimeout(timer); void supabase.removeChannel(channel); };
  }, [storeId, rangeStart, rangeEnd, workforce.loadRoster]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 3500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const dates = view === "week" ? weekDates(weekStart) : view === "day" ? [selectedDate] : monthDates(monthStart);
  const employees = workforce.roster.employees.filter((employee) => employeeFilter === "all" || employee.id === employeeFilter);
  const roster = workforce.roster.rosters.find((item) => item.weekStart === weekStart);
  const planningYear = Number(selectedDate.slice(0, 4));
  const currentYearBalances = workforce.balances.filter((balance) => balance.year === planningYear);
  const ownRequests = workforce.requests.filter((request) => request.employeeId === workforce.employee?.id);
  const requests = ownRequests;
  const pendingRequests = ownRequests.filter((request) => request.status === "pending");
  const attentionRequests = pendingRequests.filter((request) => request.coverageRisk === "red" || request.coverageRisk === "amber");

  const shiftFor = (employeeId: string, date: string) => shiftsForEmployeeDate(workforce.roster.shifts, employeeId, date, workforce.roster.timezone);
  const leaveFor = (employeeId: string, date: string): RosterLeave | undefined => leaveForEmployeeDate(workforce.roster.leave, employeeId, date);
  const scheduledMinutes = (employeeId: string) => scheduledMinutesForDates(
    dates,
    employeeId,
    workforce.roster.shifts,
    workforce.roster.patterns,
    workforce.roster.leave,
    workforce.roster.timezone,
  );

  const openLeave = (date = selectedDate) => {
    setLeaveStartDate(date >= todayIso() ? date : todayIso());
    setLeaveOpen(true);
  };
  const move = (direction: -1 | 1) => setSelectedDate(view === "year"
    ? addYears(selectedDate, direction)
    : view === "month"
      ? addMonths(selectedDate, direction)
      : addDays(selectedDate, direction * (view === "week" ? 7 : 1)));
  const refresh = () => storeId && Promise.all([
    workforce.load(storeId, true),
    workforce.loadRoster(storeId, rangeStart, rangeEnd, true),
  ]);
  const setMessageAfter = async (operation: Promise<boolean>, message: string) => {
    if (await operation) setNotice(message);
  };

  return (
    <AppPageShell data-testid="workforce-root">
      <header className="border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-bold tracking-tight text-slate-950">{currentRole === "cashier" ? "Mijn werk" : "Rooster"}</h1>
            <SegmentedTabs<WorkforceTab>
              label="Personeelsweergave"
              value={tab}
              onChange={setTab}
              tabs={[{ id: "roster", label: "Rooster" }, { id: "leave", label: "Verlof" }, { id: "balances", label: "Saldi" }]}
            />
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => void refresh()} className={`${controlClass} w-9 px-0`} aria-label="Vernieuwen"><RefreshCw size={16} className={workforce.loading || workforce.rosterLoading ? "animate-spin" : ""} /></button>
            <button type="button" onClick={() => openLeave()} className={controlClass}><CalendarDays size={16} /> Verlof aanvragen</button>
            {canManage && <button type="button" onClick={() => setEditor({ employee: employees[0] ?? workforce.roster.employees[0], date: selectedDate, shift: null, pattern: null })} disabled={!workforce.roster.employees.length || roster?.status === "published" || roster?.status === "locked"} className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-[#0e7490] bg-[#0e7490] px-3 text-xs font-bold text-white shadow-[0_1px_2px_rgba(15,23,42,0.08)] transition hover:bg-[#0f6677] disabled:cursor-not-allowed disabled:opacity-50"><Plus size={16} /> Shift</button>}
          </div>
        </div>
      </header>

      {(workforce.error || workforce.rosterError || notice) && (
        <FeedbackBanner
          tone={workforce.error || workforce.rosterError ? "error" : "success"}
          className="mx-4 mt-3 sm:mx-6"
          onDismiss={() => { workforce.clearError(); setNotice(null); }}
        >
          {workforce.error ?? workforce.rosterError ?? notice}
        </FeedbackBanner>
      )}

      {tab === "roster" && <>
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-4 py-2.5 sm:px-6">
          <div className="inline-flex rounded-lg border border-slate-200 bg-white">
            <button type="button" onClick={() => move(-1)} className="grid h-9 w-9 place-items-center text-slate-600 hover:bg-slate-50" aria-label={`Vorige ${view === "year" ? "jaar" : view === "month" ? "maand" : view === "week" ? "week" : "dag"}`}><ChevronLeft size={17} /></button>
            <button type="button" onClick={() => setSelectedDate(todayIso())} className="border-x border-slate-200 px-3 text-xs font-bold text-slate-700 hover:bg-slate-50">Vandaag</button>
            <button type="button" onClick={() => move(1)} className="grid h-9 w-9 place-items-center text-slate-600 hover:bg-slate-50" aria-label={`Volgende ${view === "year" ? "jaar" : view === "month" ? "maand" : view === "week" ? "week" : "dag"}`}><ChevronRight size={17} /></button>
          </div>
          <label className="relative"><CalendarDays size={15} className="pointer-events-none absolute left-3 top-3 text-slate-400" /><input type="date" aria-label="Roosterdatum" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white pl-9 pr-2 text-xs font-bold text-slate-700 outline-none focus:border-[#38bdf8] focus:ring-2 focus:ring-[#0ea5e3]/10" /></label>
          <div className="min-w-36 text-sm font-bold capitalize text-slate-900">{view === "year" ? planningYear : view === "month" ? formatMonth(selectedDate) : view === "week" ? formatWeekRange(weekStart) : formatLongDate(selectedDate)}</div>
          <div className="ml-auto flex items-center gap-2">
            <label className="relative hidden sm:block"><Filter size={14} className="pointer-events-none absolute left-3 top-3 text-slate-400" /><select aria-label="Medewerker filteren" value={employeeFilter} onChange={(event) => setEmployeeFilter(event.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white pl-8 pr-8 text-xs font-bold text-slate-700 outline-none focus:border-[#38bdf8]"><option value="all">Alle medewerkers</option>{workforce.roster.employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.displayName}</option>)}</select></label>
            <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5" aria-label="Roosterperiode">{([['day', 'Dag'], ['week', 'Week'], ['month', 'Maand'], ['year', 'Jaar']] as [RosterView, string][]).map(([key, label]) => <button key={key} type="button" onClick={() => setView(key)} aria-pressed={view === key} className={`rounded-md px-2.5 py-1.5 text-xs font-bold ${view === key ? "border border-[#bae6fd] bg-[#f0f9ff] text-[#0e7490]" : "text-slate-500 hover:bg-white hover:text-slate-800"}`}>{label}</button>)}</div>
            {canManage && (view === "week" || view === "day") && <div className="relative"><button type="button" className={`${controlClass} w-9 px-0`} onClick={() => setActionsOpen((open) => !open)} aria-label="Roosteracties" aria-expanded={actionsOpen}><MoreHorizontal size={17} /></button>{actionsOpen && <div className="absolute right-0 top-11 z-40 w-64 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg" role="menu">
              <button type="button" role="menuitem" disabled={workforce.mutating || roster?.status === "published" || roster?.status === "locked"} onClick={() => { setActionsOpen(false); if (storeId) void setMessageAfter(workforce.applyPatterns(storeId, weekStart, roster), "Werkpatronen op deze week toegepast."); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"><Settings2 size={15} /> Werkpatronen toepassen</button>
              <button type="button" role="menuitem" disabled={workforce.mutating} onClick={async () => {
                setActionsOpen(false);
                if (storeId) {
                  const res = await workforce.applyPatternsRange(storeId, { startDate: weekStart, endDate: `${planningYear}-12-31` });
                  if (res.success) setNotice(`Planning voor ${res.weeksProcessed} weken doorgetrokken t/m dec ${planningYear}!`);
                }
              }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-bold text-sky-800 hover:bg-sky-50 disabled:opacity-40 cursor-pointer"><CalendarDays size={15} /> Planning doortrekken (heel {planningYear})</button>
              <button type="button" role="menuitem" disabled={workforce.mutating || roster?.status === "published" || roster?.status === "locked"} onClick={() => { setActionsOpen(false); if (storeId) void setMessageAfter(workforce.copyWeek(storeId, addDays(weekStart, -7), weekStart, roster), "Vorige week gekopieerd."); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"><Copy size={15} /> Vorige week kopiëren</button>
              <div className="my-1 border-t border-slate-100" />
              {roster?.status === "published" ? <button type="button" role="menuitem" onClick={() => { setActionsOpen(false); if (storeId) void setMessageAfter(workforce.reopenRoster(storeId, weekStart), "Week heropend als concept."); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"><Settings2 size={15} /> Week heropenen</button> : <button type="button" role="menuitem" disabled={workforce.mutating || !workforce.roster.shifts.some((shift) => shift.weekStart === weekStart)} onClick={() => { setActionsOpen(false); if (storeId) void setMessageAfter(workforce.publishRoster(storeId, weekStart, roster), "Rooster gepubliceerd."); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-bold text-cyan-800 hover:bg-cyan-50 disabled:opacity-40 cursor-pointer"><Send size={15} /> Week publiceren</button>}
            </div>}</div>}
          </div>
        </div>


        {(view === "week" || view === "day") && <section className="min-h-0 flex-1 overflow-auto bg-white" aria-label={`Rooster ${view === "week" ? formatWeekRange(weekStart) : formatLongDate(selectedDate)}`}>
          {workforce.rosterLoading && !workforce.rosterHydrated ? <div className="grid min-h-80 place-items-center text-sm font-semibold text-slate-500">Rooster laden…</div> : <div style={{ minWidth: 226 + dates.length * rosterCellWidth }}>
            <div className="sticky top-0 z-10 grid border-b border-slate-200 bg-white" style={{ gridTemplateColumns: `226px repeat(${dates.length}, minmax(${rosterCellWidth}px, 1fr)) 108px` }}>
              <div className="sticky left-0 z-20 border-r border-slate-200 bg-white px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-slate-400">Medewerker</div>
              {dates.map((date) => { const calendar = workforce.roster.calendarDays.find((day) => day.date === date); const today = date === todayIso(); return <div key={date} className={`border-r border-slate-200 px-3 py-2.5 text-center ${today ? "bg-[#f0f9ff]" : calendar ? "bg-slate-50" : "bg-white"}`}><p className={`text-xs font-bold capitalize ${today ? "text-[#0e7490]" : "text-slate-700"}`}>{formatShortDay(date)}</p>{calendar && <p className="mt-0.5 truncate text-[10px] text-slate-500" title={calendar.name}>{calendar.name}</p>}</div>; })}
              <div className="px-3 py-3 text-right text-[11px] font-bold uppercase tracking-wide text-slate-400">Week</div>
            </div>
            {employees.length === 0 ? <div className="grid min-h-64 place-items-center border-b border-slate-200 text-sm text-slate-500">Geen medewerkers voor deze selectie.</div> : employees.map((employee) => {
              const weekScheduled = scheduledMinutes(employee.id);
              return <div key={employee.id} className="grid min-h-[92px] border-b border-slate-200" style={{ gridTemplateColumns: `226px repeat(${dates.length}, minmax(${rosterCellWidth}px, 1fr)) 108px` }}>
                <div className="sticky left-0 z-10 flex items-center gap-3 border-r border-slate-200 bg-white px-4 py-3">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-slate-200 bg-slate-50 text-xs font-bold text-slate-700">{employee.displayName.slice(0, 1)}</span>
                  <div className="min-w-0"><p className="truncate text-sm font-bold text-slate-900">{employee.displayName}</p><p className="mt-0.5 truncate text-[11px] text-slate-500">{employee.employeeNumber ?? employee.email ?? "Medewerker"}</p></div>
                </div>
                {dates.map((date) => {
                  const shifts = shiftFor(employee.id, date);
                  const leave = leaveFor(employee.id, date);
                  const pattern = activePatternForDate(workforce.roster.patterns, employee.id, date);
                  const unavailable = workforce.roster.availability.some((item) => item.employeeId === employee.id && item.availability === "unavailable" && localDateForTimestamp(item.startsAt, workforce.roster.timezone) <= date && localDateForTimestamp(item.endsAt, workforce.roster.timezone) >= date);
                  const editable = canManage && roster?.status !== "published" && roster?.status !== "locked";
                  return <div key={date} className={`relative border-r border-slate-200 p-2 ${date === todayIso() ? "bg-[#f0f9ff]/60" : date.endsWith("-01") ? "" : ""}`}>
                    <div className="space-y-1.5">
                      {leave ? <button type="button" onClick={() => setTab("leave")} className={`w-full rounded-lg border px-2.5 py-2 text-left text-xs font-bold ${leave.status === "approved" ? "border-slate-300 bg-slate-100 text-slate-700" : "border-amber-200 bg-amber-50 text-amber-800"}`}><span className="block truncate">{leave.leaveTypeName}</span><span className="mt-1 block text-[10px] font-semibold opacity-75">{leave.status === "approved" ? "Goedgekeurd" : "Aangevraagd"}</span></button> : shifts.length ? shifts.map((shift) => <RosterShiftBlock key={shift.id} shift={shift} employee={employee} date={date} timeZone={workforce.roster.timezone} canEdit={editable} onOpen={() => editable ? setEditor({ employee, date, shift, pattern }) : undefined} />) : pattern?.scheduledMinutes ? <RosterShiftBlock pattern={pattern} employee={employee} date={date} timeZone={workforce.roster.timezone} canEdit={editable} onOpen={() => editable && setEditor({ employee, date, shift: null, pattern })} /> : editable && <button type="button" onClick={() => setEditor({ employee, date, shift: null, pattern: null })} className="grid h-16 w-full place-items-center rounded-lg border border-transparent text-slate-300 opacity-0 transition hover:border-slate-200 hover:bg-slate-50 hover:text-slate-500 hover:opacity-100 focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600" aria-label={`Shift toevoegen voor ${employee.displayName} op ${formatLongDate(date)}`}><Plus size={16} /></button>}
                      {unavailable && <p className="flex items-center gap-1 text-[10px] font-semibold text-rose-700"><AlertCircle size={11} /> Niet beschikbaar</p>}
                    </div>
                  </div>;
                })}
                <div className="flex flex-col items-end justify-center px-3 py-2 text-right"><p className="text-xs font-bold tabular-nums text-slate-800">{formatMinutes(weekScheduled)}</p><p className={`mt-1 text-[10px] font-semibold ${weekScheduled > (employee.weeklyMinutes ?? 0) ? "text-amber-700" : "text-slate-400"}`}>van {formatMinutes(employee.weeklyMinutes ?? 0)}</p></div>
              </div>;
            })}
            {canManage && <div className="sticky bottom-0 z-10 grid border-t border-slate-200 bg-slate-50" style={{ gridTemplateColumns: `226px repeat(${dates.length}, minmax(${rosterCellWidth}px, 1fr)) 108px` }}>
              <div className="sticky left-0 z-20 border-r border-slate-200 bg-slate-50 px-4 py-3 text-xs font-bold text-slate-700">Bezetting</div>
              {dates.map((date) => { const coverage = workforce.roster.coverage.find((day) => day.date === date); return <div key={date} className="border-r border-slate-200 px-3 py-2.5 text-center"><p className={`text-xs font-bold ${coverage?.risk === "red" ? "text-rose-700" : coverage?.risk === "amber" ? "text-amber-700" : "text-emerald-700"}`}>{coverage ? `${coverage.scheduled}/${coverage.minimum}` : "—"}</p><p className="mt-0.5 truncate text-[10px] text-slate-500">{coverage?.missingCompetencies.length ? `${coverage.missingCompetencies.length} competentie mist` : coverage?.risk === "red" ? "Onder minimum" : "Dekking ok"}</p></div>; })}
              <div className="px-3 py-3 text-right text-[10px] font-semibold text-slate-500">{roster?.status === "published" ? "Gepubliceerd" : "Concept"}</div>
            </div>}
          </div>}
        </section>}
        {view === "month" && <MonthlyRosterGrid
          dates={dates}
          employees={employees}
          shifts={workforce.roster.shifts}
          patterns={workforce.roster.patterns}
          leave={workforce.roster.leave}
          coverage={workforce.roster.coverage}
          timeZone={workforce.roster.timezone}
          canManage={canManage}
          onOpenCell={(employee, date, shift, pattern) => {
            setSelectedDate(date);
            const dayRoster = workforce.roster.rosters.find((item) => item.weekStart === startOfIsoWeek(date));
            if (canManage && dayRoster?.status !== "published" && dayRoster?.status !== "locked") setEditor({ employee, date, shift, pattern });
            else setView("day");
          }}
          onOpenLeave={() => setTab("leave")}
        />}
        {view === "year" && <AnnualLeavePlanner
          year={planningYear}
          selectedDate={selectedDate}
          employeeFilter={employeeFilter}
          requests={requests}
          onPlanDate={(date) => { setSelectedDate(date); openLeave(date); }}
          onOpenMonth={(date) => { setSelectedDate(date); setView("month"); }}
        />}
      </>}

      {tab === "leave" && <section className="min-h-0 flex-1 overflow-auto bg-slate-50 p-4 sm:p-6">
        <div className="mx-auto max-w-7xl space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-cyan-700">Verlof</p>
              <h2 className="mt-1 text-xl font-bold tracking-tight text-slate-950">{canApproveLeave ? "Beslissingen die jouw aandacht vragen" : "Mijn verlof"}</h2>
              <p className="mt-1 text-sm text-slate-500">{canApproveLeave ? "Beoordeel met de planning in zicht. Elke beslissing vraagt jouw persoonlijke PIN." : "Vraag verlof aan, volg de status en trek een aanvraag in zolang dat kan."}</p>
            </div>
            <div className="flex flex-wrap gap-2"><button type="button" onClick={() => { setTab("roster"); setView("year"); }} className={controlClass}><CalendarDays size={15} /> Jaarplanning</button><button type="button" onClick={() => openLeave()} className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-[#0e7490] bg-[#0e7490] px-3 text-xs font-bold text-white shadow-[0_1px_2px_rgba(15,23,42,0.08)] hover:bg-[#0f6677]"><Plus size={15} /> Verlof aanvragen</button></div>
          </div>

          {canApproveLeave && <div className="grid gap-3 sm:grid-cols-3">
            <article className="rounded-xl border border-cyan-200 bg-white p-4 shadow-sm"><p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Te beoordelen</p><p className="mt-1 text-2xl font-bold tabular-nums text-slate-950">{pendingRequests.length}</p><p className="mt-1 text-xs text-slate-500">aanvragen wachten op jou</p></article>
            <article className="rounded-xl border border-amber-200 bg-amber-50/60 p-4"><p className="text-[11px] font-bold uppercase tracking-wide text-amber-800">Planningimpact</p><p className="mt-1 text-2xl font-bold tabular-nums text-amber-950">{attentionRequests.length}</p><p className="mt-1 text-xs text-amber-800">vraagt aandacht voor bezetting</p></article>
            <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Beveiliging</p><p className="mt-1 flex items-center gap-2 text-sm font-bold text-slate-900"><ShieldCheck size={17} className={workforce.approvalPinConfigured ? "text-emerald-600" : "text-slate-400"} /> {workforce.approvalPinConfigured ? "PIN actief" : "PIN instellen"}</p><button type="button" onClick={() => setApprovalPinOpen(true)} className="mt-1 text-xs font-bold text-cyan-800 hover:underline">{workforce.approvalPinConfigured ? "PIN wijzigen" : "Persoonlijke PIN instellen"}</button></article>
          </div>}

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3"><div><h3 className="text-sm font-bold text-slate-900">{canApproveLeave ? "Verlofinbox" : "Mijn aanvragen"}</h3><p className="mt-0.5 text-xs text-slate-500">{canApproveLeave ? "Je kunt nooit je eigen aanvraag beslissen." : "Je leidinggevende behandelt je aanvraag."}</p></div>{canApproveLeave && <span className="rounded-full bg-cyan-50 px-2.5 py-1 text-[11px] font-bold text-cyan-800">{pendingRequests.length} open</span>}</div>
            {requests.length ? <div className="overflow-x-auto"><table className="w-full min-w-[980px] text-left"><thead className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-2.5">Medewerker</th><th className="px-4 py-2.5">Periode</th><th className="px-4 py-2.5">Duur</th><th className="px-4 py-2.5">Impact op planning</th><th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5 text-right">Actie</th></tr></thead><tbody>{requests.map((request) => <LeaveRow key={request.id} request={request} ownEmployeeId={workforce.employee?.id} canApprove={canApproveLeave} busy={workforce.mutating} onDecision={(item, type) => { setDecision({ request: item, type }); setDecisionNote(""); setDecisionPin(""); setDecisionError(null); }} onWithdraw={(item) => { if (storeId && window.confirm("Deze verlofaanvraag intrekken?")) void setMessageAfter(workforce.withdraw(storeId, item.id), "Aanvraag ingetrokken."); }} />)}</tbody></table></div> : <div className="grid min-h-48 place-items-center text-sm text-slate-500">Nog geen verlofaanvragen.</div>}
          </div>
        </div>
      </section>}

      {tab === "balances" && <section className="min-h-0 flex-1 overflow-auto p-4 sm:p-6"><div className="mx-auto max-w-6xl overflow-hidden rounded-xl border border-slate-200 bg-white"><header className="flex items-center justify-between border-b border-slate-200 px-4 py-3"><h2 className="text-sm font-bold text-slate-900">Verlofsaldi {planningYear}</h2><div className="inline-flex rounded-lg border border-slate-200 bg-white"><button type="button" onClick={() => setSelectedDate(addYears(selectedDate, -1))} className="grid h-8 w-8 place-items-center text-slate-600 hover:bg-slate-50" aria-label="Vorig saldojaar"><ChevronLeft size={15} /></button><button type="button" onClick={() => setSelectedDate(todayIso())} className="border-x border-slate-200 px-3 text-xs font-bold text-slate-700 hover:bg-slate-50">Dit jaar</button><button type="button" onClick={() => setSelectedDate(addYears(selectedDate, 1))} className="grid h-8 w-8 place-items-center text-slate-600 hover:bg-slate-50" aria-label="Volgend saldojaar"><ChevronRight size={15} /></button></div></header><div className="divide-y divide-slate-100">{workforce.roster.employees.map((employee) => { const balances = currentYearBalances.filter((balance) => balance.employeeId === employee.id); return <div key={employee.id} className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_2fr] sm:items-center"><div><p className="text-sm font-bold text-slate-900">{employee.displayName}</p><p className="text-xs text-slate-500">{formatMinutes(employee.weeklyMinutes ?? 0)} contractweek</p></div><div className="flex flex-wrap gap-2">{balances.length ? balances.map((balance) => <span key={balance.accountId} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700">{balance.leaveTypeName}: {formatWorkdays(balance.availableMinutes)} <span className="font-normal text-slate-500">({formatMinutes(balance.availableMinutes)})</span></span>) : <span className="text-xs text-slate-400">Geen saldo ingesteld voor {planningYear}</span>}</div></div>; })}</div></div></section>}

      {editor && storeId && <ShiftEditor {...editor} timeZone={workforce.roster.timezone} busy={workforce.mutating} onClose={() => setEditor(null)} onSave={(input) => workforce.saveShift(storeId, input)} onDelete={editor.shift ? () => workforce.deleteShift(storeId, editor.shift!) : null} />}
      {leaveOpen && storeId && <LeaveRequestDialog leaveTypes={workforce.leaveTypes} balances={workforce.balances} employeeId={workforce.employee?.id} patterns={workforce.roster.patterns} initialStartDate={leaveStartDate} busy={workforce.mutating} onClose={() => setLeaveOpen(false)} onSubmit={async (input) => { const success = await workforce.submit(storeId, input); if (success) { setNotice("Verlofaanvraag ingediend."); setSelectedDate(input.startDate); setTab("roster"); setView("year"); } return success; }} />}
      {approvalPinOpen && storeId && <Dialog title="Persoonlijke PIN voor verlofbeslissingen" onClose={() => { setApprovalPinOpen(false); setApprovalPin(""); setApprovalPinConfirmation(""); }}>
        <div className="p-5"><div className="flex gap-3 rounded-xl border border-cyan-100 bg-cyan-50 p-3 text-xs leading-5 text-cyan-950"><KeyRound size={18} className="mt-0.5 shrink-0 text-cyan-700" /><p>Deze PIN bevestigt alleen gevoelige verlofbeslissingen. Ze is persoonlijk, wordt veilig gehasht opgeslagen en is niet zichtbaar voor medewerkers.</p></div><label className="mt-5 block text-xs font-bold text-slate-700">Nieuwe PIN<input aria-label="Nieuwe goedkeurings-PIN" type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} value={approvalPin} onChange={(event) => setApprovalPin(event.target.value.replace(/\D/g, ""))} className={fieldClass} placeholder="6 cijfers" /></label><label className="mt-4 block text-xs font-bold text-slate-700">Herhaal PIN<input aria-label="Herhaal goedkeurings-PIN" type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} value={approvalPinConfirmation} onChange={(event) => setApprovalPinConfirmation(event.target.value.replace(/\D/g, ""))} className={fieldClass} placeholder="6 cijfers" /></label><footer className="mt-6 flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={() => setApprovalPinOpen(false)} className={controlClass}>Annuleren</button><button type="button" disabled={workforce.mutating || approvalPin.length !== 6 || approvalPin !== approvalPinConfirmation} onClick={async () => { if (await workforce.setApprovalPin(storeId, approvalPin)) { setNotice("Persoonlijke goedkeurings-PIN ingesteld."); setApprovalPinOpen(false); setApprovalPin(""); setApprovalPinConfirmation(""); } }} className="inline-flex h-9 items-center gap-2 rounded-lg border border-cyan-200 bg-cyan-50 px-3 text-xs font-bold text-cyan-800 hover:bg-cyan-100 disabled:opacity-50"><ShieldCheck size={15} /> PIN bewaren</button></footer></div>
      </Dialog>}
      {decision && storeId && <Dialog title={decision.type === "approved" ? "Verlof goedkeuren" : "Verlof afwijzen"} onClose={() => setDecision(null)}><div className="p-5">
        <div className="flex items-start justify-between gap-4"><div><p className="text-base font-bold text-slate-950">{decision.request.employeeName}</p><p className="mt-0.5 text-sm text-slate-500">{decision.request.leaveTypeName} · {decision.request.startDate} tot {decision.request.endDate}</p></div><span className="shrink-0 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-bold text-slate-700">{formatMinutes(decision.request.totalMinutes)}</span></div>
        <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Impact vóór jouw beslissing</p><div className="mt-2"><CoverageBadge request={decision.request} /></div>{decision.request.employeeNote && <p className="mt-3 border-t border-slate-200 pt-3 text-xs leading-5 text-slate-600"><span className="font-bold text-slate-700">Toelichting medewerker: </span>{decision.request.employeeNote}</p>}</div>
        {!workforce.approvalPinConfigured && <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950"><span>Stel eerst je persoonlijke PIN in om een beslissing definitief te maken.</span><button type="button" onClick={() => setApprovalPinOpen(true)} className="shrink-0 font-bold text-amber-900 underline">PIN instellen</button></div>}
        <label className="mt-4 block text-xs font-bold text-slate-600">Motivatie{decision.type === "rejected" ? " (verplicht)" : ""}<textarea value={decisionNote} onChange={(event) => setDecisionNote(event.target.value)} rows={3} maxLength={2000} className={fieldClass} placeholder={decision.type === "approved" ? "Bijvoorbeeld waarom je ondanks een tekort goedkeurt." : "Leg kort uit waarom de aanvraag niet kan."} /></label>
        <label className="mt-4 block text-xs font-bold text-slate-700"><span className="flex items-center gap-1.5"><LockKeyhole size={14} /> Bevestig met jouw persoonlijke PIN</span><input aria-label="Goedkeurings-PIN" type="password" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={decisionPin} onChange={(event) => { setDecisionPin(event.target.value.replace(/\D/g, "")); setDecisionError(null); }} className={fieldClass} placeholder="6 cijfers" /></label>
        {decisionError && <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800">{decisionError}</p>}
        <footer className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={() => setDecision(null)} className={controlClass}>Annuleren</button><button type="button" disabled={workforce.mutating || !workforce.approvalPinConfigured || decisionPin.length !== 6 || (decision.type === "rejected" && !decisionNote.trim())} onClick={async () => { if (import.meta.env.VITE_E2E_BUILD === "true" && !(await verifyCurrentOwnerPin(decisionPin))) { setDecisionError("De ingevoerde PIN is niet die van de ingelogde eigenaar."); return; } if (await workforce.decide(storeId, decision.request.id, decision.type, decisionNote, decisionPin)) { setNotice(decision.type === "approved" ? "Aanvraag goedgekeurd en geregistreerd." : "Aanvraag afgewezen en geregistreerd."); setDecision(null); } }} className={`${controlClass} ${decision.type === "approved" ? "border-cyan-200 bg-cyan-50 text-cyan-800" : "border-rose-200 text-rose-700"}`}><LockKeyhole size={14} /> {decision.type === "approved" ? "Definitief goedkeuren" : "Definitief afwijzen"}</button></footer>
      </div></Dialog>}
    </AppPageShell>
  );
};
