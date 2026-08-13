import React, { useEffect, useMemo, useState } from "react";
import { Check, Clock3, Minus, Plus } from "lucide-react";
import { useAuth } from "../auth/useAuth";
import { useWorkforce } from "../store/useWorkforce";
import { formatMinutes, formatWorkdays, todayIso } from "../workforce/format";
import { addDays, startOfIsoWeek } from "../workforce/roster";

const fieldClass = "mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100";
const buttonClass = "inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 disabled:opacity-50";
const weekdays = [[1, "Ma"], [2, "Di"], [3, "Wo"], [4, "Do"], [5, "Vr"], [6, "Za"], [7, "Zo"]] as const;

export const WorkforceSettings: React.FC = () => {
  const { currentStoreId, currentRole } = useAuth();
  const storeId = currentStoreId ?? (import.meta.env.VITE_E2E_BUILD === "true" ? "fixture-store" : null);
  const workforce = useWorkforce();
  const [accountId, setAccountId] = useState("");
  const [hours, setHours] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pattern, setPattern] = useState({
    employeeId: "",
    weekdays: [1, 2, 3, 4, 5] as number[],
    startTime: "09:00",
    endTime: "17:00",
    breakMinutes: "30",
    roleLabel: "",
    locationLabel: "",
    effectiveFrom: todayIso(),
  });
  const weekStart = startOfIsoWeek(todayIso());

  useEffect(() => {
    if (!storeId) return;
    void workforce.load(storeId);
    void workforce.loadRoster(storeId, weekStart, addDays(weekStart, 6));
  }, [storeId, weekStart, workforce.load, workforce.loadRoster]);

  useEffect(() => {
    if (!pattern.employeeId && workforce.team[0]) setPattern((value) => ({ ...value, employeeId: workforce.team[0].id }));
  }, [pattern.employeeId, workforce.team]);

  const currentYearBalances = useMemo(
    () => workforce.balances.filter((balance) => balance.year === new Date().getFullYear()),
    [workforce.balances],
  );

  const selectedPatterns = workforce.roster.patterns.filter((item) => item.employeeId === pattern.employeeId && item.scheduledMinutes > 0);
  const selectedEmployee = workforce.team.find((employee) => employee.id === pattern.employeeId);

  const loadExistingPattern = (employeeId: string) => {
    const existing = workforce.roster.patterns
      .filter((item) => item.employeeId === employeeId && item.scheduledMinutes > 0)
      .sort((left, right) => right.effectiveFrom.localeCompare(left.effectiveFrom));
    const first = existing[0];
    setPattern({
      employeeId,
      weekdays: [...new Set(existing.filter((item) => item.effectiveFrom === first?.effectiveFrom).map((item) => item.weekday))],
      startTime: first?.startTime ?? "09:00",
      endTime: first?.endTime ?? "17:00",
      breakMinutes: String(first?.breakMinutes ?? 30),
      roleLabel: first?.roleLabel ?? "",
      locationLabel: first?.locationLabel ?? "",
      effectiveFrom: first?.effectiveFrom ?? todayIso(),
    });
  };

  const savePattern = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!storeId || !pattern.employeeId) return;
    const success = await workforce.savePattern(storeId, {
      ...pattern,
      breakMinutes: Number(pattern.breakMinutes),
    });
    if (success) setMessage("Werkpatroon bewaard. Gepubliceerde weken blijven ongewijzigd.");
  };

  const submitAdjustment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!storeId || !accountId || !hours || !reason.trim()) return;
    const deltaMinutes = Math.round(Number(hours.replace(",", ".")) * 60);
    if (!Number.isFinite(deltaMinutes) || deltaMinutes === 0) return;
    if (await workforce.adjustBalance(storeId, accountId, deltaMinutes, reason.trim())) {
      setHours("");
      setReason("");
      setMessage("Saldocorrectie bewaard.");
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      {(workforce.error || message) && <div className={`rounded-lg border px-3 py-2 text-xs ${workforce.error ? "border-rose-200 bg-rose-50 text-rose-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`} role={workforce.error ? "alert" : "status"}>{workforce.error ?? message}</div>}

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <header className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-bold text-slate-900">Contracten en werkpatronen</h2>
          <p className="mt-0.5 text-xs text-slate-500">Het patroon is de normale week. Concrete en gepubliceerde roosters blijven afzonderlijk bewaard.</p>
        </header>
        <div className="grid lg:grid-cols-[280px_minmax(0,1fr)]">
          <div className="border-b border-slate-200 p-2 lg:border-b-0 lg:border-r">
            {workforce.team.map((employee) => <button key={employee.id} type="button" onClick={() => loadExistingPattern(employee.id)} className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left ${pattern.employeeId === employee.id ? "border border-cyan-200 bg-cyan-50" : "border border-transparent hover:bg-slate-50"}`}><span><span className="block text-sm font-bold text-slate-900">{employee.displayName}</span><span className="mt-0.5 block text-[11px] text-slate-500">{formatMinutes(employee.weeklyMinutes ?? 0)} per week</span></span><Clock3 size={15} className="text-slate-400" /></button>)}
          </div>
          <form onSubmit={savePattern} className="p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-bold text-slate-900">{selectedEmployee?.displayName ?? "Medewerker"}</h3><p className="mt-0.5 text-xs text-slate-500">{selectedPatterns.length ? `${selectedPatterns.length} actieve werkdagen` : "Nog geen werkpatroon"}</p></div></div>
            <fieldset className="mt-5"><legend className="text-xs font-bold text-slate-600">Werkdagen</legend><div className="mt-2 flex flex-wrap gap-2">{weekdays.map(([day, label]) => { const active = pattern.weekdays.includes(day); return <button key={day} type="button" aria-pressed={active} onClick={() => setPattern((value) => ({ ...value, weekdays: active ? value.weekdays.filter((item) => item !== day) : [...value.weekdays, day].sort() }))} className={`h-9 min-w-10 rounded-lg border px-2 text-xs font-bold ${active ? "border-cyan-200 bg-cyan-50 text-cyan-800" : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"}`}>{label}</button>; })}</div></fieldset>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <label className="text-xs font-bold text-slate-600">Start<input type="time" required value={pattern.startTime} onChange={(event) => setPattern({ ...pattern, startTime: event.target.value })} className={fieldClass} /></label>
              <label className="text-xs font-bold text-slate-600">Einde<input type="time" required value={pattern.endTime} onChange={(event) => setPattern({ ...pattern, endTime: event.target.value })} className={fieldClass} /></label>
              <label className="text-xs font-bold text-slate-600">Pauze (min)<input type="number" min="0" max="720" required value={pattern.breakMinutes} onChange={(event) => setPattern({ ...pattern, breakMinutes: event.target.value })} className={fieldClass} /></label>
              <label className="text-xs font-bold text-slate-600">Functie<input value={pattern.roleLabel} onChange={(event) => setPattern({ ...pattern, roleLabel: event.target.value })} className={fieldClass} placeholder="bv. Verkoop" /></label>
              <label className="text-xs font-bold text-slate-600">Locatie<input value={pattern.locationLabel} onChange={(event) => setPattern({ ...pattern, locationLabel: event.target.value })} className={fieldClass} placeholder="bv. Hoofdvestiging" /></label>
              <label className="text-xs font-bold text-slate-600">Geldig vanaf<input type="date" required value={pattern.effectiveFrom} onChange={(event) => setPattern({ ...pattern, effectiveFrom: event.target.value })} className={fieldClass} /></label>
            </div>
            <div className="mt-5 flex justify-end border-t border-slate-100 pt-4"><button type="submit" disabled={workforce.mutating || !pattern.employeeId || !pattern.weekdays.length} className={`${buttonClass} border-cyan-200 bg-cyan-50 text-cyan-800 hover:bg-cyan-100`}><Check size={15} /> Werkpatroon bewaren</button></div>
          </form>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <header className="border-b border-slate-200 px-4 py-3"><h2 className="text-sm font-bold text-slate-900">Verlofsaldi {new Date().getFullYear()}</h2><p className="mt-0.5 text-xs text-slate-500">Saldi worden in minuten bewaard; correcties blijven in het auditlog.</p></header>
        <div className="divide-y divide-slate-100">{workforce.team.map((member) => { const balances = currentYearBalances.filter((balance) => balance.employeeId === member.id); return <div key={member.id} className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_2fr] sm:items-center"><div><p className="text-sm font-bold text-slate-900">{member.displayName}</p><p className="text-xs text-slate-500">{member.employeeNumber ?? member.email ?? "Medewerker"}</p></div><div className="flex flex-wrap gap-2">{balances.length ? balances.map((balance) => <span key={balance.accountId} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700">{balance.leaveTypeName}: {formatWorkdays(balance.availableMinutes)} <span className="font-normal text-slate-500">({formatMinutes(balance.availableMinutes)})</span></span>) : <span className="text-xs text-slate-400">Geen saldoaccount</span>}</div></div>; })}</div>
      </section>

      {currentRole === "owner" && <form onSubmit={submitAdjustment} className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
        <h2 className="text-sm font-bold text-slate-900">Gemotiveerde saldocorrectie</h2>
        <div className="mt-4 grid gap-4 lg:grid-cols-[2fr_1fr_2fr_auto] lg:items-end">
          <label className="text-xs font-bold text-slate-600">Saldoaccount<select required value={accountId} onChange={(event) => setAccountId(event.target.value)} className={fieldClass}><option value="">Selecteer medewerker…</option>{currentYearBalances.map((balance) => { const employee = workforce.team.find((member) => member.id === balance.employeeId); return <option key={balance.accountId} value={balance.accountId}>{employee?.displayName} · {balance.leaveTypeName}</option>; })}</select></label>
          <label className="text-xs font-bold text-slate-600">Uren<input required inputMode="decimal" value={hours} onChange={(event) => setHours(event.target.value)} className={fieldClass} placeholder="bv. 7,6" /></label>
          <label className="text-xs font-bold text-slate-600">Reden<input required maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} className={fieldClass} placeholder="Officieel attest of correctie" /></label>
          <button type="submit" disabled={workforce.mutating || !accountId || !hours || !reason.trim()} className={`${buttonClass} border-cyan-200 bg-cyan-50 text-cyan-800`}>{Number(hours.replace(",", ".")) < 0 ? <Minus size={15} /> : <Plus size={15} />} Bewaren</button>
        </div>
      </form>}
    </div>
  );
};
