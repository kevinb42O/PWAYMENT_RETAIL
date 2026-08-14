import React, { useEffect, useMemo, useState } from "react";
import { Check, Clock3, Minus, Plus, UserPlus, Users } from "lucide-react";
import { useAuth } from "../auth/useAuth";
import { useWorkforce } from "../store/useWorkforce";
import { formatMinutes, formatWorkdays, todayIso } from "../workforce/format";
import { addDays, startOfIsoWeek } from "../workforce/roster";
import { Modal } from "./Modal";
import { db } from "../db/db";
import { hashCredential } from "../utils/credentials";

const fieldClass = "mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs text-slate-800 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 font-medium";
const buttonClass = "inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 disabled:opacity-50";
const weekdays = [[1, "Ma"], [2, "Di"], [3, "Wo"], [4, "Do"], [5, "Vr"], [6, "Za"], [7, "Zo"]] as const;

export const WorkforceSettings: React.FC = () => {
  const { currentStoreId, currentRole } = useAuth();
  const storeId = currentStoreId ?? (import.meta.env.VITE_E2E_BUILD === "true" ? "fixture-store" : null);

  const team = useWorkforce((s) => s.team);
  const balances = useWorkforce((s) => s.balances);
  const rosterPatterns = useWorkforce((s) => s.roster.patterns);
  const competencies = useWorkforce((s) => s.competencies);
  const mutating = useWorkforce((s) => s.mutating);
  const error = useWorkforce((s) => s.error);
  const load = useWorkforce((s) => s.load);
  const loadRoster = useWorkforce((s) => s.loadRoster);
  const savePatternAction = useWorkforce((s) => s.savePattern);
  const saveEmployeeAction = useWorkforce((s) => s.saveEmployee);
  const adjustBalanceAction = useWorkforce((s) => s.adjustBalance);

  const [accountId, setAccountId] = useState("");
  const [hours, setHours] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [showAddEmployeeModal, setShowAddEmployeeModal] = useState(false);
  const [applyingRange, setApplyingRange] = useState(false);
  const [newEmployee, setNewEmployee] = useState({
    displayName: "",
    employeeNumber: "",
    email: "",
    weeklyHours: "38",
    startDate: todayIso(),
    weekdays: [1, 2, 3, 4, 5] as number[],
    startTime: "08:30",
    endTime: "17:00",
    breakMinutes: 54,
    competencyIds: [] as string[],
  });
  const [pattern, setPattern] = useState({
    employeeId: "",
    weekdays: [1, 2, 3, 4, 5] as number[],
    startTime: "08:30",
    endTime: "17:00",
    breakMinutes: 54,
    roleLabel: "Verkoop",
    locationLabel: "Winkelvloer",
    effectiveFrom: todayIso(),
  });

  const applyPatternsRangeAction = useWorkforce((s) => s.applyPatternsRange);

  useEffect(() => {
    if (storeId) {
      void load(storeId);
      const start = startOfIsoWeek(todayIso());
      void loadRoster(storeId, start, addDays(start, 27));
    }
  }, [storeId]);

  useEffect(() => {
    if (!pattern.employeeId && team.length > 0) {
      const firstId = team[0].id;
      const existing = rosterPatterns.filter((item) => item.employeeId === firstId);
      if (existing.length > 0) {
        const first = existing[0];
        setPattern({
          employeeId: firstId,
          weekdays: existing.map((item) => item.weekday),
          startTime: first.startTime || "08:30",
          endTime: first.endTime || "17:00",
          breakMinutes: first.breakMinutes ?? 54,
          roleLabel: first.roleLabel ?? "Verkoop",
          locationLabel: first.locationLabel ?? "Winkelvloer",
          effectiveFrom: first.effectiveFrom || todayIso(),
        });
      } else {
        setPattern((p) => ({ ...p, employeeId: firstId }));
      }
    }
  }, [team.length, pattern.employeeId]);

  const currentYearBalances = useMemo(
    () => balances.filter((balance) => balance.year === new Date().getFullYear()),
    [balances],
  );

  const selectedPatterns = rosterPatterns.filter((item) => item.employeeId === pattern.employeeId && item.scheduledMinutes > 0);
  const selectedEmployee = team.find((employee) => employee.id === pattern.employeeId);

  const loadExistingPattern = (employeeId: string) => {
    const existing = rosterPatterns.filter((item) => item.employeeId === employeeId);
    if (existing.length > 0) {
      const first = existing[0];
      setPattern({
        employeeId,
        weekdays: existing.map((item) => item.weekday),
        startTime: first.startTime || "08:30",
        endTime: first.endTime || "17:00",
        breakMinutes: first.breakMinutes ?? 54,
        roleLabel: first.roleLabel ?? "Verkoop",
        locationLabel: first.locationLabel ?? "Winkelvloer",
        effectiveFrom: first.effectiveFrom || todayIso(),
      });
    } else {
      setPattern({
        employeeId,
        weekdays: [1, 2, 3, 4, 5],
        startTime: "08:30",
        endTime: "17:00",
        breakMinutes: 54,
        roleLabel: "Verkoop",
        locationLabel: "Winkelvloer",
        effectiveFrom: todayIso(),
      });
    }
  };

  const savePattern = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!storeId || !pattern.employeeId) return;
    const success = await savePatternAction(storeId, {
      ...pattern,
      breakMinutes: Number(pattern.breakMinutes),
    });
    if (success) setMessage("Werkpatroon bewaard. Uren worden automatisch doorgetrokken in het rooster.");
  };

  const handleApplyYearBatch = async (allEmployees = false) => {
    if (!storeId) return;
    const currentYear = new Date().getFullYear();
    const startDate = todayIso();
    const endDate = `${currentYear}-12-31`;
    setApplyingRange(true);
    const result = await applyPatternsRangeAction(storeId, {
      startDate,
      endDate,
      employeeIds: allEmployees ? [] : [pattern.employeeId],
    });
    setApplyingRange(false);
    if (result.success) {
      setMessage(`Rooster succesvol voor ${result.weeksProcessed} weken doorgetrokken t/m eind ${currentYear}!`);
    }
  };

  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeId || !newEmployee.displayName.trim()) return;
    const weeklyMinutes = Math.round(Number(newEmployee.weeklyHours.replace(",", ".")) * 60);
    const newId = `usr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const defaultPinHash = await hashCredential("123456", "pin");
    
    // 1. Keep local POS users database in sync
    await db.users.put({
      id: newId,
      name: newEmployee.displayName.trim(),
      email: newEmployee.email.trim() || undefined,
      role: "cashier",
      pinHash: defaultPinHash,
      createdAt: new Date().toISOString(),
    });

    // 2. Save in workforce planning and leave accounts
    const success = await saveEmployeeAction(storeId, {
      id: newId,
      displayName: newEmployee.displayName.trim(),
      employeeNumber: newEmployee.employeeNumber.trim() || undefined,
      email: newEmployee.email.trim() || undefined,
      weeklyMinutes: Number.isFinite(weeklyMinutes) && weeklyMinutes > 0 ? weeklyMinutes : 2280,
      startDate: newEmployee.startDate,
      competencyIds: newEmployee.competencyIds,
      initialSchedule: {
        weekdays: newEmployee.weekdays,
        startTime: newEmployee.startTime,
        endTime: newEmployee.endTime,
        breakMinutes: Number(newEmployee.breakMinutes) || 0,
        roleLabel: "Verkoop",
        locationLabel: "Winkelvloer",
      },
    });

    if (success) {
      // 3. Save pattern explicitly
      await savePatternAction(storeId, {
        employeeId: newId,
        weekdays: newEmployee.weekdays,
        startTime: newEmployee.startTime,
        endTime: newEmployee.endTime,
        breakMinutes: Number(newEmployee.breakMinutes) || 0,
        roleLabel: "Verkoop",
        locationLabel: "Winkelvloer",
        effectiveFrom: newEmployee.startDate || todayIso(),
      });

      setShowAddEmployeeModal(false);
      setMessage(`Medewerker ${newEmployee.displayName} succesvol toegevoegd met ${newEmployee.weeklyHours}u contract en direct ingeroosterd.`);
      setNewEmployee({
        displayName: "",
        employeeNumber: "",
        email: "",
        weeklyHours: "38",
        startDate: todayIso(),
        weekdays: [1, 2, 3, 4, 5],
        startTime: "08:30",
        endTime: "17:00",
        breakMinutes: 54,
        competencyIds: [],
      });
    }
  };


  const submitAdjustment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!storeId || !accountId || !hours || !reason.trim()) return;
    const deltaMinutes = Math.round(Number(hours.replace(",", ".")) * 60);
    if (!Number.isFinite(deltaMinutes) || deltaMinutes === 0) return;
    if (await adjustBalanceAction(storeId, accountId, deltaMinutes, reason.trim())) {
      setHours("");
      setReason("");
      setMessage("Saldocorrectie bewaard.");
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      {(error || message) && (
        <div
          className={`rounded-xl border px-4 py-3 text-xs font-semibold ${
            error ? "border-rose-200 bg-rose-50 text-rose-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"
          }`}
          role={error ? "alert" : "status"}
        >
          {error ?? message}
        </div>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xs">
        <header className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 px-5 py-4 gap-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Contracten en werkpatronen</h2>
            <p className="mt-0.5 text-xs text-slate-500 font-medium">Het patroon is de normale week. Concrete en gepubliceerde roosters blijven afzonderlijk bewaard.</p>
          </div>
          {(currentRole === "owner" || currentRole === "manager") && (
            <button
              type="button"
              onClick={() => setShowAddEmployeeModal(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-black shrink-0 cursor-pointer"
            >
              <UserPlus size={15} />
              <span>Medewerker toevoegen</span>
            </button>
          )}
        </header>

        <div className="grid lg:grid-cols-[280px_minmax(0,1fr)]">
          <div className="border-b border-slate-100 p-2 lg:border-b-0 lg:border-r space-y-1">
            {team.map((employee) => (
              <button
                key={employee.id}
                type="button"
                onClick={() => loadExistingPattern(employee.id)}
                className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left transition-all cursor-pointer ${
                  pattern.employeeId === employee.id
                    ? "border border-slate-900 bg-slate-50 ring-1 ring-slate-900/10 font-bold"
                    : "border border-slate-100 bg-white hover:bg-slate-50 text-slate-700"
                }`}
              >
                <span>
                  <span className="block text-xs font-bold text-slate-900">{employee.displayName}</span>
                  <span className="mt-0.5 block text-[11px] text-slate-500 font-medium">{formatMinutes(employee.weeklyMinutes ?? 0)} per week</span>
                </span>
                <Clock3 size={15} className={pattern.employeeId === employee.id ? "text-slate-900" : "text-slate-400"} />
              </button>
            ))}
          </div>

          <form onSubmit={savePattern} className="p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">{selectedEmployee?.displayName ?? "Medewerker"}</h3>
                <p className="mt-0.5 text-xs text-slate-500 font-medium">{selectedPatterns.length ? `${selectedPatterns.length} actieve werkdagen ingesteld` : "Nog geen werkpatroon"}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={applyingRange || !pattern.employeeId}
                  onClick={() => void handleApplyYearBatch(false)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-sky-800 bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded-xl transition cursor-pointer disabled:opacity-50"
                  title="Genereert direct planning voor het hele lopende jaar"
                >
                  <span>Doortrekken t/m dec {new Date().getFullYear()}</span>
                </button>
              </div>
            </div>

            {/* SNELLE PRESETS */}
            <div className="mt-4 p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2">
              <span className="text-[11px] font-bold text-slate-600 block">Snelle roostertemplates:</span>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { label: "Voltijds 38u (Ma–Vr)", days: [1, 2, 3, 4, 5], start: "08:30", end: "17:00", brk: 54 },
                  { label: "Retail 38u (Di–Za)", days: [2, 3, 4, 5, 6], start: "09:00", end: "17:00", brk: 24 },
                  { label: "Deeltijds 32u (4 d.)", days: [1, 2, 4, 5], start: "08:30", end: "17:00", brk: 30 },
                  { label: "Halftijds 19u", days: [1, 2, 3, 4, 5], start: "08:30", end: "12:18", brk: 0 },
                ].map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() =>
                      setPattern((p) => ({
                        ...p,
                        weekdays: preset.days,
                        startTime: preset.start,
                        endTime: preset.end,
                        breakMinutes: preset.brk,
                      }))
                    }
                    className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 transition shadow-2xs cursor-pointer"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <fieldset className="mt-4">
              <legend className="text-xs font-bold text-slate-600">Werkdagen</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {weekdays.map(([day, label]) => {
                  const active = pattern.weekdays.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      aria-pressed={active}
                      onClick={() =>
                        setPattern((value) => ({
                          ...value,
                          weekdays: active ? value.weekdays.filter((item) => item !== day) : [...value.weekdays, day].sort(),
                        }))
                      }
                      className={`h-9 min-w-10 rounded-xl border px-3 text-xs font-bold transition-colors cursor-pointer ${
                        active ? "border-slate-900 bg-slate-900 text-white font-bold shadow-xs" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 font-medium"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <label className="text-xs font-bold text-slate-600">
                Start
                <input type="time" required value={pattern.startTime} onChange={(event) => setPattern({ ...pattern, startTime: event.target.value })} className={fieldClass} />
              </label>
              <label className="text-xs font-bold text-slate-600">
                Einde
                <input type="time" required value={pattern.endTime} onChange={(event) => setPattern({ ...pattern, endTime: event.target.value })} className={fieldClass} />
              </label>
              <label className="text-xs font-bold text-slate-600">
                Pauze (min)
                <input type="number" min="0" max="720" required value={pattern.breakMinutes} onChange={(event) => setPattern({ ...pattern, breakMinutes: Number(event.target.value) || 0 })} className={fieldClass} />
              </label>
              <label className="text-xs font-bold text-slate-600">
                Functie
                <input value={pattern.roleLabel} onChange={(event) => setPattern({ ...pattern, roleLabel: event.target.value })} className={fieldClass} placeholder="bv. Verkoop" />
              </label>
              <label className="text-xs font-bold text-slate-600">
                Locatie
                <input value={pattern.locationLabel} onChange={(event) => setPattern({ ...pattern, locationLabel: event.target.value })} className={fieldClass} placeholder="bv. Hoofdvestiging" />
              </label>
              <label className="text-xs font-bold text-slate-600">
                Geldig vanaf
                <input type="date" required value={pattern.effectiveFrom} onChange={(event) => setPattern({ ...pattern, effectiveFrom: event.target.value })} className={fieldClass} />
              </label>
            </div>

            {/* LIVE BEREKENING & CONTRACT AFSTEMMING */}
            {(() => {
              const dailyMin = Math.max(0, Math.round((new Date(`2020-01-01T${pattern.endTime}:00`).getTime() - new Date(`2020-01-01T${pattern.startTime}:00`).getTime()) / 60_000) - (Number(pattern.breakMinutes) || 0));
              const weeklyMin = dailyMin * pattern.weekdays.length;
              const contractMin = selectedEmployee?.weeklyMinutes || 2280;
              const matches = weeklyMin === contractMin;
              return (
                <div className={`mt-4 p-3 rounded-xl border flex items-center justify-between text-xs ${matches ? "bg-emerald-50 border-emerald-200 text-emerald-900" : "bg-amber-50 border-amber-200 text-amber-900"}`}>
                  <span className="font-semibold">
                    {pattern.weekdays.length} dagen × {formatMinutes(dailyMin)} = <strong>{formatMinutes(weeklyMin)}</strong> per week
                  </span>
                  <span className="font-bold">
                    Contract: {formatMinutes(contractMin)} {matches ? "• Sluit exact aan" : `• Verschil: ${formatMinutes(Math.abs(weeklyMin - contractMin))}`}
                  </span>
                </div>
              );
            })()}

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
              <button
                type="button"
                disabled={applyingRange}
                onClick={() => void handleApplyYearBatch(true)}
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer disabled:opacity-50"
              >
                <span>Alle medewerkers doortrekken (2026)</span>
              </button>
              <button
                type="submit"
                disabled={mutating || !pattern.employeeId || !pattern.weekdays.length}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-xs font-bold text-white shadow-xs transition hover:bg-black disabled:opacity-50 cursor-pointer"
              >
                <Check size={15} /> Werkpatroon bewaren
              </button>
            </div>
          </form>

        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xs">
        <header className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-sm font-bold text-slate-900">Verlofsaldi {new Date().getFullYear()}</h2>
          <p className="mt-0.5 text-xs text-slate-500 font-medium">Saldi worden in minuten bewaard; correcties blijven in het auditlog.</p>
        </header>
        <div className="divide-y divide-slate-100">
          {team.map((member) => {
            const memberBalances = currentYearBalances.filter((balance) => balance.employeeId === member.id);
            return (
              <div key={member.id} className="grid gap-3 px-5 py-3.5 sm:grid-cols-[minmax(0,1fr)_2fr] sm:items-center">
                <div>
                  <p className="text-xs font-bold text-slate-900">{member.displayName}</p>
                  <p className="text-[11px] text-slate-500 font-medium">{member.employeeNumber ?? member.email ?? "Medewerker"}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {memberBalances.length ? (
                    memberBalances.map((balance) => (
                      <span key={balance.accountId} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700">
                        {balance.leaveTypeName}: {formatWorkdays(balance.availableMinutes)} <span className="font-normal text-slate-500">({formatMinutes(balance.availableMinutes)})</span>
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-slate-400">Geen saldoaccount</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {currentRole === "owner" && (
        <form onSubmit={submitAdjustment} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
          <h2 className="text-sm font-bold text-slate-900">Gemotiveerde saldocorrectie</h2>
          <div className="mt-4 grid gap-4 lg:grid-cols-[2fr_1fr_2fr_auto] lg:items-end">
            <label className="text-xs font-bold text-slate-600">
              Medewerker
              <select value={accountId} onChange={(event) => setAccountId(event.target.value)} className={fieldClass}>
                <option value="">Kies verlofrekening</option>
                {balances.map((balance) => (
                  <option key={balance.accountId} value={balance.accountId}>
                    {team.find((e) => e.id === balance.employeeId)?.displayName ?? "Medewerker"} - {balance.leaveTypeName} ({balance.year})
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-bold text-slate-600">
              Uren (+/-)
              <input value={hours} onChange={(event) => setHours(event.target.value)} placeholder="bv. 8 of -4" className={fieldClass} />
            </label>
            <label className="text-xs font-bold text-slate-600">
              Reden (verplicht)
              <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="bv. correctie overuren" className={fieldClass} />
            </label>
            <button
              type="submit"
              disabled={mutating || !accountId || !hours || !reason.trim()}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-xs font-bold text-white shadow-xs transition hover:bg-black disabled:opacity-50 cursor-pointer"
            >
              <Check size={15} /> Corrigeer
            </button>
          </div>
        </form>
      )}

      {/* MODAL: NIEUWE MEDEWERKER TOEVOEGEN */}
      <Modal
        open={showAddEmployeeModal}
        onClose={() => setShowAddEmployeeModal(false)}
        title="Nieuwe medewerker toevoegen"
        subtitle="Voeg een medewerker toe aan uw personeelsplanning, verlofsaldi en roosters"
        icon={<UserPlus size={18} className="text-slate-900" />}
        size="lg"
      >
        <form onSubmit={handleAddEmployee} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-xs font-bold text-slate-700">
                Volledige naam <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={newEmployee.displayName}
                onChange={(e) => setNewEmployee({ ...newEmployee, displayName: e.target.value })}
                placeholder="bv. Sophie De Smet"
                className={fieldClass}
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700">Personeelsnummer (optioneel)</label>
              <input
                type="text"
                value={newEmployee.employeeNumber}
                onChange={(e) => setNewEmployee({ ...newEmployee, employeeNumber: e.target.value })}
                placeholder="bv. EMP-004"
                className={fieldClass}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-xs font-bold text-slate-700">E-mailadres (optioneel)</label>
              <input
                type="email"
                value={newEmployee.email}
                onChange={(e) => setNewEmployee({ ...newEmployee, email: e.target.value })}
                placeholder="sophie@winkel.be"
                className={fieldClass}
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700">Contracturen per week</label>
              <input
                type="text"
                required
                value={newEmployee.weeklyHours}
                onChange={(e) => setNewEmployee({ ...newEmployee, weeklyHours: e.target.value })}
                placeholder="38"
                className={fieldClass}
              />
              <p className="mt-1 text-[11px] text-slate-400">Voltijds = 38u, Deeltijds = bijv. 20u of 32u</p>
            </div>
          </div>

          {/* NIEUWE SECTIE: STANDAARD WERKROOSTER IN MODAL */}
          <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/70 space-y-3.5">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <Clock3 size={14} className="text-slate-900" />
                <span>Standaard Werkrooster</span>
              </h4>
              <span className="text-[11px] text-slate-500 font-medium">Wordt direct doorgezet in de planning</span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {[
                { label: "Voltijds 38u (Ma–Vr)", hours: "38", days: [1, 2, 3, 4, 5], start: "08:30", end: "17:00", brk: 54 },
                { label: "Retail 38u (Di–Za)", hours: "38", days: [2, 3, 4, 5, 6], start: "09:00", end: "17:00", brk: 24 },
                { label: "Deeltijds 32u (4 d.)", hours: "32", days: [1, 2, 4, 5], start: "08:30", end: "17:00", brk: 30 },
                { label: "Halftijds 19u", hours: "19", days: [1, 2, 3, 4, 5], start: "08:30", end: "12:18", brk: 0 },
              ].map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() =>
                    setNewEmployee({
                      ...newEmployee,
                      weeklyHours: preset.hours,
                      weekdays: preset.days,
                      startTime: preset.start,
                      endTime: preset.end,
                      breakMinutes: preset.brk,
                    })
                  }
                  className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 transition shadow-2xs cursor-pointer"
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-700 block mb-1.5">Werkdagen</label>
              <div className="flex flex-wrap gap-1.5">
                {weekdays.map(([dayNum, dayName]) => {
                  const num = dayNum as number;
                  const isSelected = newEmployee.weekdays.includes(num);
                  return (
                    <button
                      key={num}
                      type="button"
                      onClick={() =>
                        setNewEmployee({
                          ...newEmployee,
                          weekdays: isSelected
                            ? newEmployee.weekdays.filter((d) => d !== num)
                            : [...newEmployee.weekdays, num].sort(),
                        })
                      }
                      className={`h-8 min-w-9 px-2.5 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                        isSelected
                          ? "bg-slate-900 border-slate-900 text-white shadow-2xs"
                          : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      {dayName}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="text-[11px] font-bold text-slate-700">Starttijd</label>
                <input
                  type="time"
                  required
                  value={newEmployee.startTime}
                  onChange={(e) => setNewEmployee({ ...newEmployee, startTime: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:border-sky-500 font-semibold"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-700">Eindtijd</label>
                <input
                  type="time"
                  required
                  value={newEmployee.endTime}
                  onChange={(e) => setNewEmployee({ ...newEmployee, endTime: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:border-sky-500 font-semibold"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-700">Pauze (min)</label>
                <input
                  type="number"
                  min="0"
                  max="360"
                  value={newEmployee.breakMinutes}
                  onChange={(e) => setNewEmployee({ ...newEmployee, breakMinutes: Number(e.target.value) || 0 })}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:border-sky-500 font-medium"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700">Startdatum contract</label>
            <input
              type="date"
              required
              value={newEmployee.startDate}
              onChange={(e) => setNewEmployee({ ...newEmployee, startDate: e.target.value })}
              className={fieldClass}
            />
          </div>

          {competencies.length > 0 && (
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-2">Competenties & rollen</label>
              <div className="flex flex-wrap gap-2">
                {competencies.map((comp) => {
                  const active = newEmployee.competencyIds.includes(comp.id);
                  return (
                    <button
                      key={comp.id}
                      type="button"
                      onClick={() =>
                        setNewEmployee({
                          ...newEmployee,
                          competencyIds: active
                            ? newEmployee.competencyIds.filter((id) => id !== comp.id)
                            : [...newEmployee.competencyIds, comp.id],
                        })
                      }
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                        active
                          ? "border-slate-900 bg-slate-900 text-white shadow-xs"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      {comp.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setShowAddEmployeeModal(false)}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 border border-slate-200 rounded-xl bg-white hover:bg-slate-50 transition cursor-pointer"
            >
              Annuleren
            </button>
            <button
              type="submit"
              disabled={mutating || !newEmployee.displayName.trim() || newEmployee.weekdays.length === 0}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-black rounded-xl shadow-xs transition disabled:opacity-50 cursor-pointer"
            >
              <Check size={15} /> Medewerker opslaan
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
