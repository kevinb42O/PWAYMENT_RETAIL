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
  const [newEmployee, setNewEmployee] = useState({
    displayName: "",
    employeeNumber: "",
    email: "",
    weeklyHours: "38",
    startDate: todayIso(),
    competencyIds: [] as string[],
  });
  const [pattern, setPattern] = useState({
    employeeId: "",
    weekdays: [1, 2, 3, 4, 5],
    startTime: "09:00",
    endTime: "17:00",
    breakMinutes: 30,
    roleLabel: "Verkoop",
    locationLabel: "Winkelvloer",
    effectiveFrom: todayIso(),
  });

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
          startTime: first.startTime,
          endTime: first.endTime,
          breakMinutes: first.breakMinutes,
          roleLabel: first.roleLabel ?? "Verkoop",
          locationLabel: first.locationLabel ?? "Winkelvloer",
          effectiveFrom: first.effectiveFrom,
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
        startTime: first.startTime,
        endTime: first.endTime,
        breakMinutes: first.breakMinutes,
        roleLabel: first.roleLabel ?? "Verkoop",
        locationLabel: first.locationLabel ?? "Winkelvloer",
        effectiveFrom: first.effectiveFrom,
      });
    } else {
      setPattern({
        employeeId,
        weekdays: [1, 2, 3, 4, 5],
        startTime: "09:00",
        endTime: "17:00",
        breakMinutes: 30,
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
    if (success) setMessage("Werkpatroon bewaard. Gepubliceerde weken blijven ongewijzigd.");
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
    });

    if (success) {
      setShowAddEmployeeModal(false);
      setMessage(`Medewerker ${newEmployee.displayName} succesvol toegevoegd.`);
      setNewEmployee({
        displayName: "",
        employeeNumber: "",
        email: "",
        weeklyHours: "38",
        startDate: todayIso(),
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
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">{selectedEmployee?.displayName ?? "Medewerker"}</h3>
                <p className="mt-0.5 text-xs text-slate-500 font-medium">{selectedPatterns.length ? `${selectedPatterns.length} actieve werkdagen` : "Nog geen werkpatroon"}</p>
              </div>
            </div>

            <fieldset className="mt-5">
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

            <div className="mt-5 flex justify-end border-t border-slate-100 pt-4">
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
              disabled={mutating || !newEmployee.displayName.trim()}
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
