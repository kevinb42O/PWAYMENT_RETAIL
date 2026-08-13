import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, BadgeCheck, CalendarClock, Check, Minus, Plus, Users } from "lucide-react";
import { useAuth } from "../auth/useAuth";
import { useWorkforce } from "../store/useWorkforce";
import { formatMinutes, formatWorkdays } from "../workforce/format";

export const WorkforceSettings: React.FC = () => {
  const { currentStoreId, currentRole } = useAuth();
  const workforceStoreId = currentStoreId ?? (import.meta.env.VITE_E2E_BUILD === "true" ? "fixture-store" : null);
  const workforce = useWorkforce();
  const [accountId, setAccountId] = useState("");
  const [hours, setHours] = useState("");
  const [reason, setReason] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (workforceStoreId) void workforce.load(workforceStoreId);
  }, [workforceStoreId, workforce.load]);

  const currentYearBalances = useMemo(
    () => workforce.balances.filter((balance) => balance.year === new Date().getFullYear()),
    [workforce.balances],
  );

  const submitAdjustment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!workforceStoreId || !accountId || !hours || !reason.trim()) return;
    const deltaMinutes = Math.round(Number(hours.replace(",", ".")) * 60);
    if (!Number.isFinite(deltaMinutes) || deltaMinutes === 0) return;
    if (await workforce.adjustBalance(workforceStoreId, accountId, deltaMinutes, reason.trim())) {
      setHours("");
      setReason("");
      setSaved(true);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><Users size={19} className="text-sky-600" /><p className="mt-3 text-3xl font-black text-slate-950">{workforce.team.length}</p><p className="mt-1 text-xs text-slate-500">gekoppelde medewerkers</p></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><CalendarClock size={19} className="text-sky-600" /><p className="mt-3 text-3xl font-black text-slate-950">{workforce.coverageRules.filter((rule) => rule.active).length}</p><p className="mt-1 text-xs text-slate-500">actieve bezettingsregels</p></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><BadgeCheck size={19} className="text-sky-600" /><p className="mt-3 text-3xl font-black text-slate-950">{workforce.competencies.filter((item) => item.active).length}</p><p className="mt-1 text-xs text-slate-500">actieve competenties</p></div>
      </div>

      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
        <div className="flex items-start gap-3"><AlertTriangle size={19} className="mt-0.5 shrink-0 text-amber-600" /><div><h3 className="font-extrabold text-amber-950">Raming is geen officieel vakantierecht</h3><p className="mt-1 text-sm leading-6 text-amber-800">Nieuwe medewerkers krijgen een transparante raming van vier werkweken. Controleer het officiële attest of de sociaal-secretariaatsgegevens en bevestig het saldo via een gemotiveerde correctie. Elke correctie blijft in het ledger bewaard.</p></div></div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4"><h3 className="font-extrabold text-slate-900">Medewerkers en saldo {new Date().getFullYear()}</h3><p className="mt-1 text-xs text-slate-500">Accounts worden automatisch gekoppeld aan actieve winkelgebruikers.</p></div>
        <div className="divide-y divide-slate-100">
          {workforce.team.map((member) => {
            const balances = currentYearBalances.filter((balance) => balance.employeeId === member.id);
            return (
              <div key={member.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0"><p className="truncate font-extrabold text-slate-900">{member.displayName}</p><p className="mt-0.5 truncate text-xs text-slate-500">{member.employeeNumber} {member.email ? `· ${member.email}` : ""}</p></div>
                <div className="flex flex-wrap gap-2">
                  {balances.length ? balances.map((balance) => <span key={balance.accountId} className={`rounded-xl border px-3 py-2 text-xs font-bold ${balance.status === "estimated" ? "border-amber-200 bg-amber-50 text-amber-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{balance.leaveTypeName}: {formatWorkdays(balance.availableMinutes)} <span className="font-normal opacity-75">({formatMinutes(balance.availableMinutes)})</span></span>) : <span className="text-xs text-slate-400">Geen saldoaccount</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {currentRole === "owner" && (
        <form onSubmit={submitAdjustment} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2"><Plus size={18} className="text-sky-600" /><h3 className="font-extrabold text-slate-900">Gemotiveerde saldocorrectie</h3></div>
          <p className="mt-1 text-xs text-slate-500">Gebruik een positief aantal uren om toe te voegen en een negatief aantal om af te trekken.</p>
          {workforce.error && <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800" role="alert">{workforce.error}</div>}
          {saved && <div className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800"><Check size={16} /> Correctie bewaard en saldo als bevestigd gemarkeerd.</div>}
          <div className="mt-5 grid gap-4 lg:grid-cols-[2fr_1fr_2fr_auto] lg:items-end">
            <label className="text-xs font-bold text-slate-600">Saldoaccount
              <select required value={accountId} onChange={(event) => { setAccountId(event.target.value); setSaved(false); }} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"><option value="">Selecteer medewerker…</option>{currentYearBalances.map((balance) => { const employee = workforce.team.find((member) => member.id === balance.employeeId); return <option key={balance.accountId} value={balance.accountId}>{employee?.displayName} · {balance.leaveTypeName}</option>; })}</select>
            </label>
            <label className="text-xs font-bold text-slate-600">Uren (+/−)
              <div className="relative mt-1.5"><Minus size={14} className="absolute left-3 top-3 text-slate-400" /><input required inputMode="decimal" value={hours} onChange={(event) => { setHours(event.target.value); setSaved(false); }} placeholder="bv. 7,6" className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-8 pr-3 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100" /></div>
            </label>
            <label className="text-xs font-bold text-slate-600">Reden
              <input required maxLength={500} value={reason} onChange={(event) => { setReason(event.target.value); setSaved(false); }} placeholder="Attest sociaal secretariaat…" className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100" />
            </label>
            <button type="submit" disabled={workforce.mutating} className="rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-extrabold text-white hover:bg-sky-700 disabled:opacity-50">{workforce.mutating ? "Bewaren…" : "Correctie bewaren"}</button>
          </div>
        </form>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h3 className="font-extrabold text-slate-900">Bezettingsregels</h3><div className="mt-3 space-y-2">{workforce.coverageRules.map((rule) => <div key={rule.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2.5 text-sm"><span className="font-semibold text-slate-700">{rule.name}</span><span className="rounded-full bg-sky-50 px-2 py-1 text-xs font-bold text-sky-700">min. {rule.minimumPresent}</span></div>)}</div></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h3 className="font-extrabold text-slate-900">Competentiedekking</h3>{workforce.competencies.length ? <div className="mt-3 flex flex-wrap gap-2">{workforce.competencies.map((competency) => <span key={competency.id} className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-bold text-sky-700">{competency.name}</span>)}</div> : <p className="mt-3 text-sm leading-6 text-slate-500">Nog geen competenties ingesteld. Het datamodel en de dekkingsanalyse zijn al klaar; competentiebeheer wordt in een volgende beheerlaag ontsloten.</p>}</div>
      </div>
    </div>
  );
};
