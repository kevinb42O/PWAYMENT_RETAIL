import React, { useState, type FocusEvent, type PointerEvent } from "react";
import { CalendarDays } from "lucide-react";
import {
  FloatingTooltip,
  tooltipPositionFromElement,
  type ChartTooltipPosition,
} from "../insights/InsightPrimitives";
import {
  activePatternForDate,
  formatLongDate,
  formatMonthName,
  formatTime,
  isoWeekday,
  localDateForTimestamp,
  monthCalendarDates,
} from "../../workforce/roster";
import { formatMinutes, leaveStatusLabel, todayIso } from "../../workforce/format";
import type {
  LeaveRequest,
  RosterCoverageDay,
  RosterLeave,
  WorkforceEmployee,
  WorkforceShift,
  WorkPattern,
} from "../../workforce/types";

const weekLetters = ["M", "D", "W", "D", "V", "Z", "Z"];

const requestOccursOn = (request: LeaveRequest, date: string): boolean =>
  (request.status === "pending" || request.status === "approved")
  && request.startDate <= date
  && request.endDate >= date;

const requestMatchesEmployee = (request: LeaveRequest, employeeFilter: string): boolean =>
  employeeFilter === "all" || request.employeeId === employeeFilter;

const MiniCalendarDay = ({
  date,
  selected,
  requests,
  onPlan,
  onInspect,
}: {
  date: string;
  selected: boolean;
  requests: LeaveRequest[];
  onPlan: (date: string) => void;
  onInspect: (date: string) => void;
}) => {
  const [position, setPosition] = useState<ChartTooltipPosition | null>(null);
  const activatePointer = (event: PointerEvent<HTMLButtonElement>) => setPosition({ x: event.clientX, y: event.clientY });
  const activateFocus = (event: FocusEvent<HTMLButtonElement>) => setPosition(tooltipPositionFromElement(event.currentTarget));
  const today = date === todayIso();
  const future = date >= todayIso();
  const approved = requests.some((request) => request.status === "approved");
  const pending = requests.some((request) => request.status === "pending");
  const label = `${formatLongDate(date)}${requests.length ? `, ${requests.length} verlof${requests.length === 1 ? "melding" : "meldingen"}` : ""}, ${future ? "verlof plannen" : "maand bekijken"}`;

  return (
    <button
      type="button"
      onClick={() => future ? onPlan(date) : onInspect(date)}
      onPointerEnter={activatePointer}
      onPointerMove={activatePointer}
      onPointerLeave={() => setPosition(null)}
      onFocus={activateFocus}
      onBlur={() => setPosition(null)}
      aria-label={label}
      data-date={date}
      className={`relative grid aspect-square min-h-7 place-items-center rounded-md border text-[10px] font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-cyan-600 ${
        selected
          ? "border-cyan-300 bg-cyan-50 text-cyan-900"
          : approved
            ? "border-slate-300 bg-slate-100 text-slate-800"
            : pending
              ? "border-amber-200 bg-amber-50 text-amber-800"
              : today
                ? "border-cyan-200 bg-white text-cyan-800"
                : "border-transparent bg-white text-slate-600 hover:border-slate-200 hover:bg-slate-50"
      }`}
    >
      {position && (
        <FloatingTooltip position={position} variant="light">
          <div className="min-w-48 max-w-64">
            <p className="text-xs font-bold capitalize text-slate-950">{formatLongDate(date)}</p>
            {requests.length ? (
              <div className="mt-2 space-y-1.5">
                {requests.slice(0, 5).map((request) => (
                  <div key={request.id} className="flex items-start justify-between gap-3 text-[11px]">
                    <span className="truncate font-semibold text-slate-700">{request.employeeName}</span>
                    <span className={request.status === "approved" ? "text-slate-500" : "text-amber-700"}>{leaveStatusLabel[request.status]}</span>
                  </div>
                ))}
                {requests.length > 5 && <p className="text-[10px] text-slate-400">+ {requests.length - 5} meer</p>}
              </div>
            ) : <p className="mt-2 text-[11px] text-slate-500">Geen afwezigheden.</p>}
            <p className="mt-2 border-t border-slate-100 pt-2 text-[10px] font-semibold text-slate-500">{future ? "Klik om verlof vanaf deze datum te plannen." : "Klik om deze maand te bekijken."}</p>
          </div>
        </FloatingTooltip>
      )}
      {Number(date.slice(-2))}
      {requests.length > 0 && <span className={`absolute bottom-0.5 h-1 w-1 rounded-full ${approved ? "bg-slate-500" : "bg-amber-500"}`} />}
    </button>
  );
};

export const AnnualLeavePlanner = ({
  year,
  selectedDate,
  employeeFilter,
  requests,
  onPlanDate,
  onOpenMonth,
}: {
  year: number;
  selectedDate: string;
  employeeFilter: string;
  requests: LeaveRequest[];
  onPlanDate: (date: string) => void;
  onOpenMonth: (date: string) => void;
}) => (
  <section className="min-h-0 flex-1 overflow-auto bg-slate-50 p-4 sm:p-6" aria-label={`Jaarplanning ${year}`}>
    <div className="mx-auto max-w-[1500px]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-slate-900">Verlof- en aanwezigheidsplanning {year}</h2>
          <p className="mt-0.5 text-xs text-slate-500">Klik op een toekomstige dag om onmiddellijk een verlofperiode te starten. Hover voor wie al afwezig is.</p>
        </div>
        <div className="flex items-center gap-4 text-[11px] font-semibold text-slate-500">
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-slate-500" /> Goedgekeurd</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-500" /> Aangevraagd</span>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {Array.from({ length: 12 }, (_, monthIndex) => {
          const cells = monthCalendarDates(year, monthIndex);
          const monthDate = `${year}-${String(monthIndex + 1).padStart(2, "0")}-01`;
          const monthRequests = requests.filter((request) => requestMatchesEmployee(request, employeeFilter)
            && request.status !== "rejected" && request.status !== "withdrawn" && request.status !== "cancelled"
            && request.startDate.slice(0, 7) <= monthDate.slice(0, 7)
            && request.endDate.slice(0, 7) >= monthDate.slice(0, 7));
          return (
            <article key={monthIndex} className="rounded-xl border border-slate-200 bg-white p-3 shadow-xs">
              <button type="button" onClick={() => onOpenMonth(monthDate)} className="mb-2 flex w-full items-center justify-between rounded-lg px-1 py-1 text-left hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600" aria-label={`${formatMonthName(year, monthIndex)} ${year} als maand openen`}>
                <span className="text-xs font-bold capitalize text-slate-900">{formatMonthName(year, monthIndex)}</span>
                {monthRequests.length > 0 && <span className="text-[10px] font-semibold text-slate-400">{monthRequests.length} {monthRequests.length === 1 ? "periode" : "periodes"}</span>}
              </button>
              <div className="grid grid-cols-7 gap-1">
                {weekLetters.map((letter, index) => <span key={`${letter}-${index}`} className="pb-1 text-center text-[9px] font-bold text-slate-400">{letter}</span>)}
                {cells.map((date, index) => date ? (
                  <MiniCalendarDay
                    key={date}
                    date={date}
                    selected={selectedDate === date}
                    requests={monthRequests.filter((request) => requestOccursOn(request, date))}
                    onPlan={onPlanDate}
                    onInspect={onOpenMonth}
                  />
                ) : <span key={`empty-${index}`} aria-hidden="true" />)}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  </section>
);

const MonthRosterCell = ({
  employee,
  date,
  shifts,
  pattern,
  leave,
  timeZone,
  editable,
  onOpen,
  onLeave,
}: {
  employee: WorkforceEmployee;
  date: string;
  shifts: WorkforceShift[];
  pattern: WorkPattern | null;
  leave?: RosterLeave;
  timeZone: string;
  editable: boolean;
  onOpen: () => void;
  onLeave: () => void;
}) => {
  const [position, setPosition] = useState<ChartTooltipPosition | null>(null);
  const activatePointer = (event: PointerEvent<HTMLButtonElement>) => setPosition({ x: event.clientX, y: event.clientY });
  const activateFocus = (event: FocusEvent<HTMLButtonElement>) => setPosition(tooltipPositionFromElement(event.currentTarget));
  const working = shifts.length > 0 || Boolean(pattern?.scheduledMinutes);
  const firstShift = shifts[0];
  const time = firstShift ? formatTime(firstShift.startsAt, timeZone) : pattern?.startTime;
  const action = leave ? onLeave : onOpen;
  const aria = leave
    ? `${employee.displayName}, ${formatLongDate(date)}, ${leave.leaveTypeName}, ${leave.status === "approved" ? "goedgekeurd" : "aangevraagd"}`
    : working
      ? `${employee.displayName}, ${formatLongDate(date)}, werkt vanaf ${time}`
      : `${employee.displayName}, ${formatLongDate(date)}${editable ? ", shift toevoegen" : ", niet ingepland"}`;
  return (
    <button
      type="button"
      onClick={action}
      onPointerEnter={activatePointer}
      onPointerMove={activatePointer}
      onPointerLeave={() => setPosition(null)}
      onFocus={activateFocus}
      onBlur={() => setPosition(null)}
      aria-label={aria}
      className={`relative grid min-h-14 place-items-center border-r border-slate-100 px-0.5 outline-none transition focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-600 ${
        leave?.status === "approved"
          ? "bg-slate-100 text-slate-700"
          : leave
            ? "bg-amber-50 text-amber-700"
            : working
              ? "bg-cyan-50/70 text-cyan-900 hover:bg-cyan-50"
              : isoWeekday(date) >= 6
                ? "bg-slate-50/80 text-slate-300"
                : "bg-white text-slate-300 hover:bg-slate-50"
      }`}
    >
      {position && (
        <FloatingTooltip position={position} variant="light">
          <div className="min-w-52">
            <p className="text-xs font-bold text-slate-950">{employee.displayName}</p>
            <p className="mt-0.5 text-[11px] capitalize text-slate-500">{formatLongDate(date)}</p>
            {leave ? (
              <div className="mt-2 border-t border-slate-100 pt-2 text-[11px]">
                <p className="font-bold text-slate-700">{leave.leaveTypeName}</p>
                <p className="mt-0.5 text-slate-500">{leave.status === "approved" ? "Goedgekeurd" : "Nog te beoordelen"}</p>
              </div>
            ) : working ? (
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[11px]">
                <dt className="text-slate-500">Uren</dt><dd className="text-right font-bold text-slate-800">{firstShift ? `${formatTime(firstShift.startsAt, timeZone)}–${formatTime(firstShift.endsAt, timeZone)}` : `${pattern?.startTime}–${pattern?.endTime}`}</dd>
                <dt className="text-slate-500">Functie</dt><dd className="text-right font-semibold text-slate-700">{firstShift?.roleLabel ?? pattern?.roleLabel ?? "Niet ingesteld"}</dd>
                <dt className="text-slate-500">Bron</dt><dd className="text-right font-semibold text-slate-700">{firstShift ? "Rooster" : "Werkpatroon"}</dd>
              </dl>
            ) : <p className="mt-2 text-[11px] text-slate-500">Niet ingepland.</p>}
          </div>
        </FloatingTooltip>
      )}
      {leave ? <CalendarDays size={13} /> : working ? <span className="font-mono text-[9px] font-bold tabular-nums">{time}</span> : editable ? <span className="text-base font-light opacity-0 transition group-hover:opacity-100">+</span> : null}
    </button>
  );
};

export const MonthlyRosterGrid = ({
  dates,
  employees,
  shifts,
  patterns,
  leave,
  coverage,
  timeZone,
  canManage,
  onOpenCell,
  onOpenLeave,
}: {
  dates: string[];
  employees: WorkforceEmployee[];
  shifts: WorkforceShift[];
  patterns: WorkPattern[];
  leave: RosterLeave[];
  coverage: RosterCoverageDay[];
  timeZone: string;
  canManage: boolean;
  onOpenCell: (employee: WorkforceEmployee, date: string, shift: WorkforceShift | null, pattern: WorkPattern | null) => void;
  onOpenLeave: () => void;
}) => {
  const dayWidth = 46;
  const shiftFor = (employeeId: string, date: string) => shifts.filter((shift) => employeeId === shift.employeeId && localDateForTimestamp(shift.startsAt, timeZone) === date);
  const leaveFor = (employeeId: string, date: string) => leave.find((item) => item.employeeId === employeeId && item.startDate <= date && item.endDate >= date);
  const minutesFor = (employee: WorkforceEmployee) => dates.reduce((total, date) => {
    const dayLeave = leaveFor(employee.id, date);
    if (dayLeave) return total;
    const dayShifts = shiftFor(employee.id, date);
    if (dayShifts.length) return total + dayShifts.reduce((minutes, shift) => minutes + shift.paidMinutes, 0);
    return total + (activePatternForDate(patterns, employee.id, date)?.scheduledMinutes ?? 0);
  }, 0);

  return (
    <section className="min-h-0 flex-1 overflow-auto bg-white" aria-label="Maandrooster">
      <div style={{ minWidth: 226 + dates.length * dayWidth + 96 }}>
        <div className="sticky top-0 z-30 grid border-b border-slate-200 bg-white" style={{ gridTemplateColumns: `226px repeat(${dates.length}, ${dayWidth}px) 96px` }}>
          <div className="sticky left-0 z-40 border-r border-slate-200 bg-white px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-slate-400">Medewerker</div>
          {dates.map((date) => <div key={date} className={`border-r border-slate-100 py-2 text-center ${date === todayIso() ? "bg-cyan-50" : isoWeekday(date) >= 6 ? "bg-slate-50" : "bg-white"}`}><p className="text-[9px] font-bold uppercase text-slate-400">{weekLetters[isoWeekday(date) - 1]}</p><p className={`mt-0.5 text-[11px] font-bold ${date === todayIso() ? "text-cyan-800" : "text-slate-700"}`}>{Number(date.slice(-2))}</p></div>)}
          <div className="px-3 py-3 text-right text-[11px] font-bold uppercase tracking-wide text-slate-400">Maand</div>
        </div>
        {employees.map((employee) => <div key={employee.id} className="grid border-b border-slate-100" style={{ gridTemplateColumns: `226px repeat(${dates.length}, ${dayWidth}px) 96px` }}>
          <div className="sticky left-0 z-20 flex min-w-0 items-center gap-3 border-r border-slate-200 bg-white px-4 py-2.5">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-slate-200 bg-slate-50 text-xs font-bold text-slate-700">{employee.displayName.slice(0, 1)}</span>
            <div className="min-w-0"><p className="truncate text-sm font-bold text-slate-900">{employee.displayName}</p><p className="truncate text-[10px] text-slate-500">{employee.employeeNumber ?? employee.email ?? "Medewerker"}</p></div>
          </div>
          {dates.map((date) => {
            const dayShifts = shiftFor(employee.id, date);
            const pattern = activePatternForDate(patterns, employee.id, date);
            const dayLeave = leaveFor(employee.id, date);
            const rosterStatus = dayShifts[0]?.rosterStatus;
            const editable = canManage && rosterStatus !== "published" && rosterStatus !== "locked";
            return <MonthRosterCell key={date} employee={employee} date={date} shifts={dayShifts} pattern={pattern} leave={dayLeave} timeZone={timeZone} editable={editable} onOpen={() => onOpenCell(employee, date, dayShifts[0] ?? null, pattern)} onLeave={onOpenLeave} />;
          })}
          <div className="flex items-center justify-end px-3 text-xs font-bold tabular-nums text-slate-700">{formatMinutes(minutesFor(employee))}</div>
        </div>)}
        {canManage && <div className="sticky bottom-0 z-20 grid border-t border-slate-200 bg-slate-50" style={{ gridTemplateColumns: `226px repeat(${dates.length}, ${dayWidth}px) 96px` }}>
          <div className="sticky left-0 z-30 border-r border-slate-200 bg-slate-50 px-4 py-3 text-xs font-bold text-slate-700">Bezetting</div>
          {dates.map((date) => {
            const day = coverage.find((item) => item.date === date);
            return <div key={date} title={day?.missingCompetencies.length ? `Ontbreekt: ${day.missingCompetencies.join(", ")}` : day ? `${day.scheduled} van minimaal ${day.minimum}` : "Geen regel"} className="grid place-items-center border-r border-slate-100 py-2"><span className={`h-2 w-2 rounded-full ${day?.risk === "red" ? "bg-rose-500" : day?.risk === "amber" ? "bg-amber-500" : "bg-emerald-500"}`} /><span className="mt-1 text-[9px] font-semibold tabular-nums text-slate-500">{day ? `${day.scheduled}/${day.minimum}` : "—"}</span></div>;
          })}
          <div />
        </div>}
      </div>
    </section>
  );
};
