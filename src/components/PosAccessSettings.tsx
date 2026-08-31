import {
  Activity,
  Check,
  Clock3,
  KeyRound,
  Laptop,
  LockKeyhole,
  Plus,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  UserRound,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/useAuth";
import { db } from "../db/db";
import { isSupabaseConfigured } from "../lib/supabase";
import {
  listPosAccessAdmin,
  resetPosOperatorPin,
  savePosOperator,
  updatePosDevice,
} from "../pos-access/service";
import type { PosAccessAdminSnapshot, PosOperator } from "../pos-access/types";
import { usePosAccess } from "../pos-access/usePosAccess";
import type { Role } from "../types";
import { hashCredential } from "../utils/credentials";
import { Modal } from "./Modal";

type View = "overview" | "team" | "devices" | "policy" | "audit";

const emptySnapshot: PosAccessAdminSnapshot = {
  operators: [],
  devices: [],
  events: [],
};
const fieldClass =
  "mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-900 outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100";
const fixtureRuntime = () =>
  import.meta.env.DEV ||
  import.meta.env.VITE_E2E_BUILD === "true" ||
  import.meta.env.VITE_PRESENTATION_BUILD === "true" ||
  !isSupabaseConfigured;

const roleLabel: Record<Role, string> = {
  owner: "Eigenaar",
  manager: "Manager",
  cashier: "Medewerker",
};

const eventLabel: Record<string, string> = {
  "pos.owner_configured": "Kassatoegang geactiveerd",
  "pos.device_paired": "Kassatoestel veilig gekoppeld",
  "pos.device_pairing_failed": "Toestelkoppeling mislukt",
  "pos.login_succeeded": "Aanmelding gelukt",
  "pos.login_failed": "Aanmelding mislukt",
  "pos.login_throttled": "Aanmelding tijdelijk geblokkeerd",
  "pos.session_ended": "Kassasessie beëindigd",
  "pos.owner_step_up": "Eigenaar opnieuw geverifieerd",
  "pos.owner_step_up_failed": "Owner-verificatie mislukt",
  "pos.operator_saved": "Medewerkerstoegang gewijzigd",
  "pos.device_updated": "Kassatoestel gewijzigd",
  "pos.pin_reset_issued": "Tijdelijke reset-PIN aangemaakt",
  "pos.pin_changed": "Persoonlijke PIN gewijzigd",
  "pos.discount_approved": "Korting door manager goedgekeurd",
  "pos.discount_approval_failed": "Managergoedkeuring mislukt",
};

const formatMoment = (value?: string | null) =>
  value
    ? new Intl.DateTimeFormat("nl-BE", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "Nog nooit";

export const PosAccessSettings = () => {
  const storeId = useAuth((state) => state.currentStoreId);
  const currentOperatorId = useAuth((state) => state.currentUserId);
  const currentRole = useAuth((state) => state.currentRole);
  const sessionToken = usePosAccess((state) => state.sessionToken);
  const currentDevice = usePosAccess((state) => state.device);
  const stepUpOwner = usePosAccess((state) => state.stepUpOwner);
  const ownerStepUpAt = usePosAccess((state) => state.ownerStepUpAt);
  const [view, setView] = useState<View>("overview");
  const [snapshot, setSnapshot] = useState(emptySnapshot);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PosOperator | null>(null);
  const [form, setForm] = useState({
    displayName: "",
    jobTitle: "",
    employeeNumber: "",
    role: "cashier" as Role,
    pin: "",
    offlineAccessEnabled: true,
  });
  const [resetTarget, setResetTarget] = useState<PosOperator | null>(null);
  const [ownerPin, setOwnerPin] = useState("");
  const [temporaryPin, setTemporaryPin] = useState<{
    operator: string;
    pin: string;
    expiresAt: string;
  } | null>(null);
  const [deviceTarget, setDeviceTarget] = useState<
    PosAccessAdminSnapshot["devices"][number] | null
  >(null);
  const [deviceForm, setDeviceForm] = useState({
    name: "",
    offlineGraceHours: 24,
    status: "active" as "active" | "revoked" | "retired",
    ownerPin: "",
  });

  const load = useCallback(async () => {
    if (currentRole !== "owner") return;
    setLoading(true);
    setError(null);
    try {
      if (
        fixtureRuntime() ||
        !storeId ||
        !sessionToken ||
        sessionToken.startsWith("fixture:")
      ) {
        const users = await db.users.toArray();
        setSnapshot({
          operators: users.map((user) => ({
            id: user.id,
            displayName: user.name,
            role: user.role,
            status: "active",
            jobTitle: user.jobTitle,
            employeeNumber: null,
            workforceEmployeeId: user.workforceEmployeeId,
            offlineAccessEnabled: true,
            mustChangePin: false,
            pinConfigured: Boolean(user.pinHash),
            lastLoginAt: null,
          })),
          devices: [
            {
              id: "fixture-device",
              name: "Deze kassa",
              status: "active",
              offlineGraceHours: 24,
              lastSeenAt: new Date().toISOString(),
              pairedAt: new Date().toISOString(),
            },
          ],
          events: [],
        });
      } else {
        setSnapshot(await listPosAccessAdmin(storeId, sessionToken));
      }
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Kassatoegang kon niet worden geladen.",
      );
    } finally {
      setLoading(false);
    }
  }, [currentRole, sessionToken, storeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(
    () => ({
      active: snapshot.operators.filter(
        (operator) => operator.status === "active",
      ).length,
      owners: snapshot.operators.filter(
        (operator) => operator.role === "owner" && operator.status === "active",
      ).length,
      locked: snapshot.operators.filter(
        (operator) =>
          operator.lockedUntil && new Date(operator.lockedUntil) > new Date(),
      ).length,
      resets: snapshot.operators.filter((operator) => operator.mustChangePin)
        .length,
    }),
    [snapshot.operators],
  );
  const hasRecentOwnerStepUp = Boolean(
    ownerStepUpAt && Date.now() - ownerStepUpAt < 5 * 60_000,
  );

  const openCreate = () => {
    setEditing(null);
    setForm({
      displayName: "",
      jobTitle: "",
      employeeNumber: "",
      role: "cashier",
      pin: "",
      offlineAccessEnabled: true,
    });
    setError(null);
    setFormOpen(true);
  };

  const openEdit = (operator: PosOperator) => {
    setEditing(operator);
    setForm({
      displayName: operator.displayName,
      jobTitle: operator.jobTitle ?? "",
      employeeNumber: operator.employeeNumber ?? "",
      role: operator.role,
      pin: "",
      offlineAccessEnabled: operator.offlineAccessEnabled !== false,
    });
    setError(null);
    setFormOpen(true);
  };

  const submitOperator = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.displayName.trim())
      return setError("Vul de naam van de medewerker in.");
    if (!editing && !/^\d{6}$/.test(form.pin))
      return setError("Stel een unieke persoonlijke PIN van 6 cijfers in.");
    if (form.pin && !/^\d{6}$/.test(form.pin))
      return setError("De PIN moet exact 6 cijfers bevatten.");
    setSaving(true);
    setError(null);
    try {
      if (
        fixtureRuntime() ||
        !storeId ||
        !sessionToken ||
        sessionToken.startsWith("fixture:")
      ) {
        const id = editing?.id ?? crypto.randomUUID();
        const existing = await db.users.get(id);
        await db.users.put({
          ...existing,
          id,
          name: form.displayName.trim(),
          role: form.role,
          jobTitle: form.jobTitle.trim() || undefined,
          pinHash: form.pin
            ? await hashCredential(form.pin, "pin")
            : (existing?.pinHash ?? ""),
          createdAt: existing?.createdAt ?? new Date().toISOString(),
        });
      } else {
        await savePosOperator({
          storeId,
          sessionToken,
          payload: {
            id: editing?.id,
            displayName: form.displayName.trim(),
            jobTitle: form.jobTitle.trim(),
            employeeNumber: form.employeeNumber.trim(),
            role: form.role,
            status: editing?.status ?? "active",
            pin: form.pin || undefined,
            offlineAccessEnabled: form.offlineAccessEnabled,
          },
        });
      }
      setFormOpen(false);
      setNotice(
        editing
          ? "Medewerkerstoegang bijgewerkt."
          : "Medewerkerstoegang veilig aangemaakt.",
      );
      await load();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "De medewerker kon niet worden bewaard.",
      );
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (operator: PosOperator) => {
    if (!storeId || !sessionToken) return;
    setSaving(true);
    setError(null);
    try {
      await savePosOperator({
        storeId,
        sessionToken,
        payload: {
          id: operator.id,
          displayName: operator.displayName,
          jobTitle: operator.jobTitle ?? "",
          employeeNumber: operator.employeeNumber ?? "",
          role: operator.role,
          status: operator.status === "active" ? "suspended" : "active",
          offlineAccessEnabled: operator.offlineAccessEnabled !== false,
        },
      });
      setNotice(
        operator.status === "active"
          ? "Kassatoegang gedeactiveerd; actieve sessies zijn ingetrokken."
          : "Kassatoegang opnieuw geactiveerd.",
      );
      await load();
    } catch (toggleError) {
      setError(
        toggleError instanceof Error
          ? toggleError.message
          : "Status wijzigen mislukt.",
      );
    } finally {
      setSaving(false);
    }
  };

  const performReset = async () => {
    if (!resetTarget) return;
    setSaving(true);
    setError(null);
    try {
      if (!hasRecentOwnerStepUp && !(await stepUpOwner(ownerPin))) {
        setError("De owner-PIN is niet correct. De reset is niet uitgevoerd.");
        return;
      }
      let reset: { temporaryPin: string; expiresAt: string };
      if (
        fixtureRuntime() ||
        !storeId ||
        !sessionToken ||
        sessionToken.startsWith("fixture:")
      ) {
        const value = String(340000 + Math.floor(Math.random() * 500000));
        await db.users.update(resetTarget.id, {
          pinHash: await hashCredential(value, "pin"),
        });
        reset = {
          temporaryPin: value,
          expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        };
      } else {
        reset = await resetPosOperatorPin({
          storeId,
          sessionToken,
          operatorId: resetTarget.id,
        });
      }
      setTemporaryPin({
        operator: resetTarget.displayName,
        pin: reset.temporaryPin,
        expiresAt: reset.expiresAt,
      });
      setResetTarget(null);
      setOwnerPin("");
      await load();
    } catch (resetError) {
      setError(
        resetError instanceof Error ? resetError.message : "PIN-reset mislukt.",
      );
    } finally {
      setSaving(false);
    }
  };

  const openDevice = (device: PosAccessAdminSnapshot["devices"][number]) => {
    setDeviceTarget(device);
    setDeviceForm({
      name: device.name,
      offlineGraceHours: device.offlineGraceHours,
      status: device.status,
      ownerPin: "",
    });
    setError(null);
  };

  const saveDevice = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!deviceTarget || !deviceForm.name.trim()) return;
    if (
      deviceTarget.id === currentDevice?.id &&
      deviceForm.status !== "active"
    ) {
      setError("De kassa waarop je nu werkt kan zichzelf niet intrekken.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const statusChanging = deviceTarget.status !== deviceForm.status;
      const disabling = deviceTarget.status === "active" && deviceForm.status !== "active";
      if (statusChanging) {
        if (!hasRecentOwnerStepUp && !(await stepUpOwner(deviceForm.ownerPin))) {
          setError(
            "De owner-PIN is niet correct. Het toestel is niet ingetrokken.",
          );
          return;
        }
      }
      if (
        !fixtureRuntime() &&
        storeId &&
        sessionToken &&
        !sessionToken.startsWith("fixture:")
      ) {
        await updatePosDevice({
          storeId,
          sessionToken,
          deviceId: deviceTarget.id,
          payload: {
            name: deviceForm.name.trim(),
            offlineGraceHours: deviceForm.offlineGraceHours,
            status: deviceForm.status,
          },
        });
      }
      setDeviceTarget(null);
      setNotice(
        disabling
          ? "Het toestel en al zijn actieve sessies zijn ingetrokken."
          : "Toestelinstellingen bijgewerkt.",
      );
      await load();
    } catch (deviceError) {
      setError(
        deviceError instanceof Error
          ? deviceError.message
          : "Toestel wijzigen mislukt.",
      );
    } finally {
      setSaving(false);
    }
  };

  if (currentRole !== "owner") return null;

  const views: Array<{ id: View; label: string; icon: React.ReactNode }> = [
    { id: "overview", label: "Overzicht", icon: <Activity size={14} /> },
    { id: "team", label: "Medewerkers & PINs", icon: <Users size={14} /> },
    { id: "devices", label: "Toestellen", icon: <Laptop size={14} /> },
    { id: "policy", label: "Beleid", icon: <ShieldCheck size={14} /> },
    { id: "audit", label: "Audit", icon: <Clock3 size={14} /> },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-12">
      <section className="rounded-3xl border border-cyan-200 bg-gradient-to-br from-white via-cyan-50/50 to-sky-50/60 p-5 shadow-sm md:p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-cyan-100 bg-white text-cyan-800 shadow-sm">
            <LockKeyhole size={25} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-cyan-700">
              Owner-only beveiligingscentrum
            </p>
            <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950">
              Wie mag deze kassa openen?
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Beheer persoonlijke PINs, rollen, gekoppelde toestellen en
              toegangsgebeurtenissen. PIN-codes zijn nooit terugleesbaar.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-cyan-200 bg-white px-3 text-xs font-extrabold text-cyan-800 hover:bg-cyan-50 disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />{" "}
            Vernieuwen
          </button>
        </div>
      </section>

      <nav
        className="flex gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm"
        aria-label="Kassatoegangsinstellingen"
      >
        {views.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setView(item.id)}
            className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl px-3 text-xs font-extrabold transition ${view === item.id ? "bg-cyan-800 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"}`}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </nav>

      {error && (
        <p
          className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-800"
          role="alert"
        >
          {error}
        </p>
      )}
      {notice && (
        <p
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800"
          role="status"
        >
          {notice}
        </p>
      )}

      {view === "overview" && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              [
                "Actieve gebruikers",
                counts.active,
                <Users size={19} className="text-cyan-700" />,
              ],
              [
                "Actieve eigenaars",
                counts.owners,
                <ShieldCheck size={19} className="text-amber-600" />,
              ],
              [
                "Tijdelijk geblokkeerd",
                counts.locked,
                <LockKeyhole size={19} className="text-rose-600" />,
              ],
              [
                "PIN-wijziging vereist",
                counts.resets,
                <KeyRound size={19} className="text-sky-700" />,
              ],
            ].map(([label, value, icon]) => (
              <div
                key={String(label)}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50">
                  {icon}
                </span>
                <strong className="mt-4 block text-3xl font-black text-slate-950">
                  {String(value)}
                </strong>
                <span className="mt-1 block text-xs font-bold text-slate-500">
                  {String(label)}
                </span>
              </div>
            ))}
          </div>
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-black text-slate-950">
              Veiligheidsstatus
            </h3>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-bold text-emerald-800">
                Persoonlijke PINs · actief
              </div>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-bold text-emerald-800">
                Settings · alleen eigenaar
              </div>
              <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-3 text-xs font-bold text-cyan-900">
                {snapshot.devices.length} gekoppelde{" "}
                {snapshot.devices.length === 1 ? "kassa" : "kassa's"}
              </div>
            </div>
          </section>
        </>
      )}

      {view === "team" && (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <header className="flex flex-col gap-3 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-black text-slate-950">
                Medewerkers & persoonlijke PINs
              </h3>
              <p className="mt-1 text-xs text-slate-500">
                Iedere gebruiker heeft een eigen identiteit; gedeelde
                managercodes zijn niet nodig.
              </p>
            </div>
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-cyan-800 px-4 text-xs font-extrabold text-white hover:bg-cyan-900"
            >
              <Plus size={15} /> Medewerker toevoegen
            </button>
          </header>
          <div className="divide-y divide-slate-100">
            {snapshot.operators.map((operator) => (
              <div
                key={operator.id}
                className="grid gap-3 p-4 md:grid-cols-[minmax(0,1.4fr)_120px_150px_minmax(240px,auto)] md:items-center"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-cyan-100 bg-cyan-50 text-sm font-black text-cyan-800">
                    {operator.displayName.charAt(0).toUpperCase()}
                  </span>
                  <span className="min-w-0">
                    <strong className="block truncate text-sm text-slate-950">
                      {operator.displayName}
                      {operator.id === currentOperatorId ? " · Jij" : ""}
                    </strong>
                    <small className="block truncate text-xs text-slate-500">
                      {operator.jobTitle ||
                        operator.employeeNumber ||
                        "Kassamedewerker"}
                    </small>
                  </span>
                </div>
                <span
                  className={`w-fit rounded-full border px-2.5 py-1 text-[10px] font-black uppercase ${operator.role === "owner" ? "border-amber-200 bg-amber-50 text-amber-800" : operator.role === "manager" ? "border-cyan-200 bg-cyan-50 text-cyan-800" : "border-slate-200 bg-slate-50 text-slate-700"}`}
                >
                  {roleLabel[operator.role]}
                </span>
                <span
                  className={`inline-flex w-fit items-center gap-1.5 text-xs font-bold ${operator.mustChangePin ? "text-amber-700" : operator.pinConfigured ? "text-emerald-700" : "text-rose-700"}`}
                >
                  <KeyRound size={13} />
                  {operator.mustChangePin
                    ? "Wijziging vereist"
                    : operator.pinConfigured
                      ? "PIN actief"
                      : "PIN ontbreekt"}
                </span>
                <div className="flex flex-wrap justify-start gap-2 md:justify-end">
                  <button
                    type="button"
                    onClick={() => openEdit(operator)}
                    className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-50"
                  >
                    Bewerken
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setResetTarget(operator);
                      setOwnerPin("");
                      setError(null);
                    }}
                    className="rounded-lg border border-cyan-200 bg-cyan-50 px-2.5 py-1.5 text-[11px] font-bold text-cyan-800 hover:bg-cyan-100"
                  >
                    PIN resetten
                  </button>
                  {operator.id !== currentOperatorId && (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void toggleStatus(operator)}
                      className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-bold ${operator.status === "active" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}
                    >
                      {operator.status === "active"
                        ? "Deactiveren"
                        : "Activeren"}
                    </button>
                  )}
                </div>
                <p className="md:col-start-1 md:col-end-5 text-[11px] text-slate-400">
                  Laatste login: {formatMoment(operator.lastLoginAt)}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {view === "devices" && (
        <div className="grid gap-4 lg:grid-cols-2">
          {snapshot.devices.map((device) => (
            <section
              key={device.id}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="flex items-start justify-between">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-50 text-cyan-800">
                  {device.name.toLowerCase().includes("ipad") ? (
                    <Smartphone size={20} />
                  ) : (
                    <Laptop size={20} />
                  )}
                </span>
                <span
                  className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${device.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}
                >
                  {device.status}
                </span>
              </div>
              <h3 className="mt-4 text-sm font-black text-slate-950">
                {device.name}
                {device.id === currentDevice?.id ? " · Dit toestel" : ""}
              </h3>
              <dl className="mt-4 space-y-2 text-xs">
                <div className="flex justify-between">
                  <dt className="text-slate-500">Laatste activiteit</dt>
                  <dd className="font-bold text-slate-700">
                    {formatMoment(device.lastSeenAt)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Offline grace</dt>
                  <dd className="font-bold text-slate-700">
                    {device.offlineGraceHours} uur
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Gekoppeld</dt>
                  <dd className="font-bold text-slate-700">
                    {formatMoment(device.pairedAt)}
                  </dd>
                </div>
              </dl>
              <button
                type="button"
                onClick={() => openDevice(device)}
                className="mt-4 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-extrabold text-slate-700 hover:bg-slate-50"
              >
                Toestel beheren
              </button>
            </section>
          ))}
        </div>
      )}

      {view === "policy" && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <h3 className="text-sm font-black text-slate-950">
            Vast beveiligingsbeleid
          </h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Deze veilige defaults gelden onmiddellijk. Fijnmazige
            winkelaanpassing volgt pas wanneer serverhandhaving voor iedere
            mutatie actief is.
          </p>
          <div className="mt-5 divide-y divide-slate-100">
            {[
              ["Automatisch vergrendelen", "Na 15 minuten zonder activiteit"],
              ["Achtergrondvergrendeling", "Na 2 minuten buiten de app"],
              ["Operatorsessie", "Maximaal 12 uur en niet bewaard na refresh"],
              [
                "Owner step-up",
                "Opnieuw verifiëren voor PIN-reset; 5 minuten geldig",
              ],
              [
                "Mislukte pogingen",
                "Cooldown vanaf 5 pogingen, escalatie vanaf 10",
              ],
              ["Settings", "Permanent owner-only; niet delegeerbaar"],
            ].map(([label, detail]) => (
              <div
                key={label}
                className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <strong className="text-xs text-slate-900">{label}</strong>
                <span className="text-xs font-medium text-slate-500">
                  {detail}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {view === "audit" && (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <header className="border-b border-slate-100 p-5">
            <h3 className="text-sm font-black text-slate-950">
              Recente toegangsgebeurtenissen
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              PINs, hashes en lookupwaarden worden nooit gelogd.
            </p>
          </header>
          <div className="divide-y divide-slate-100">
            {snapshot.events.length ? (
              snapshot.events.map((event) => {
                const operator = snapshot.operators.find(
                  (candidate) => candidate.id === event.operatorId,
                );
                const device = snapshot.devices.find(
                  (candidate) => candidate.id === event.deviceId,
                );
                return (
                  <div
                    key={event.id}
                    className="grid gap-2 p-4 sm:grid-cols-[1fr_180px_180px] sm:items-center"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`h-2.5 w-2.5 rounded-full ${event.success ? "bg-emerald-500" : "bg-rose-500"}`}
                      />
                      <span>
                        <strong className="block text-xs text-slate-900">
                          {eventLabel[event.eventType] ?? event.eventType}
                        </strong>
                        <small className="text-[11px] text-slate-500">
                          {operator?.displayName ?? "Systeem"}
                          {device ? ` · ${device.name}` : ""}
                        </small>
                      </span>
                    </div>
                    <span className="text-xs font-bold text-slate-500">
                      {event.success ? "Geslaagd" : "Geweigerd"}
                    </span>
                    <time className="text-xs text-slate-500 sm:text-right">
                      {formatMoment(event.occurredAt)}
                    </time>
                  </div>
                );
              })
            ) : (
              <p className="p-8 text-center text-xs text-slate-400">
                Nog geen servergebeurtenissen beschikbaar.
              </p>
            )}
          </div>
        </section>
      )}

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? "Kassatoegang bewerken" : "Medewerker toegang geven"}
        subtitle="Persoonlijke PIN, rol en veilige offline-toegang"
        icon={<UserRound size={18} />}
        size="lg"
      >
        <form onSubmit={submitOperator} className="space-y-4">
          {error && (
            <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-800">
              {error}
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-xs font-bold text-slate-700">
              Naam
              <input
                value={form.displayName}
                onChange={(event) =>
                  setForm({ ...form, displayName: event.target.value })
                }
                className={fieldClass}
                required
              />
            </label>
            <label className="text-xs font-bold text-slate-700">
              Personeelsnummer
              <input
                value={form.employeeNumber}
                onChange={(event) =>
                  setForm({ ...form, employeeNumber: event.target.value })
                }
                className={fieldClass}
              />
            </label>
          </div>
          <label className="block text-xs font-bold text-slate-700">
            Functie
            <input
              value={form.jobTitle}
              onChange={(event) =>
                setForm({ ...form, jobTitle: event.target.value })
              }
              className={fieldClass}
              placeholder="Verkoop, atelier, magazijn…"
            />
          </label>
          <fieldset>
            <legend className="text-xs font-bold text-slate-700">
              Systeemrol
            </legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {(["cashier", "manager", "owner"] as Role[]).map((role) => (
                <button
                  key={role}
                  type="button"
                  onClick={() => setForm({ ...form, role })}
                  className={`rounded-xl border p-3 text-left ${form.role === role ? "border-cyan-700 bg-cyan-50 ring-2 ring-cyan-100" : "border-slate-200 bg-white"}`}
                >
                  <strong className="block text-xs text-slate-950">
                    {roleLabel[role]}
                  </strong>
                  <small className="mt-1 block text-[10px] leading-4 text-slate-500">
                    {role === "owner"
                      ? "Alle settings en beheer"
                      : role === "manager"
                        ? "Operationele goedkeuringen"
                        : "Dagelijkse kassawerk"}
                  </small>
                </button>
              ))}
            </div>
          </fieldset>
          <label className="block text-xs font-bold text-slate-700">
            {editing ? "Nieuwe PIN (optioneel)" : "Persoonlijke PIN"}
            <input
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              maxLength={6}
              value={form.pin}
              onChange={(event) =>
                setForm({ ...form, pin: event.target.value.replace(/\D/g, "") })
              }
              className={`${fieldClass} text-center tracking-[0.35em]`}
              required={!editing}
            />
          </label>
          <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <input
              type="checkbox"
              checked={form.offlineAccessEnabled}
              onChange={(event) =>
                setForm({ ...form, offlineAccessEnabled: event.target.checked })
              }
              className="mt-0.5 h-4 w-4 accent-cyan-700"
            />
            <span>
              <strong className="block text-xs text-slate-900">
                Gecontroleerde offline toegang
              </strong>
              <small className="mt-0.5 block text-[11px] leading-4 text-slate-500">
                Alleen met een recente device-bound grant; owner-instellingen
                blijven online-only.
              </small>
            </span>
          </label>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700"
            >
              Annuleren
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-cyan-800 px-4 py-2 text-xs font-extrabold text-white disabled:opacity-50"
            >
              <Check size={14} /> Veilig opslaan
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(deviceTarget)}
        onClose={() => setDeviceTarget(null)}
        title="Kassatoestel beheren"
        subtitle={deviceTarget?.name}
        icon={<Laptop size={18} />}
        size="sm"
      >
        <form onSubmit={saveDevice} className="space-y-4">
          {error && (
            <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-800">
              {error}
            </p>
          )}
          <label className="block text-xs font-bold text-slate-700">
            Herkenbare toestelnaam
            <input
              value={deviceForm.name}
              onChange={(event) => setDeviceForm({ ...deviceForm, name: event.target.value })}
              className={fieldClass}
              required
            />
          </label>
          <label className="block text-xs font-bold text-slate-700">
            Offline synchronisatieperiode
            <select
              value={deviceForm.offlineGraceHours}
              onChange={(event) => setDeviceForm({ ...deviceForm, offlineGraceHours: Number(event.target.value) })}
              className={fieldClass}
            >
              <option value={0}>Geen offline toegang</option>
              <option value={8}>8 uur</option>
              <option value={24}>24 uur</option>
              <option value={48}>48 uur</option>
              <option value={72}>72 uur</option>
            </select>
          </label>
          <label className="block text-xs font-bold text-slate-700">
            Status
            <select
              value={deviceForm.status}
              onChange={(event) => setDeviceForm({ ...deviceForm, status: event.target.value as typeof deviceForm.status })}
              className={fieldClass}
              disabled={deviceTarget?.id === currentDevice?.id}
            >
              <option value="active">Actief</option>
              <option value="revoked">Ingetrokken</option>
              <option value="retired">Buiten gebruik</option>
            </select>
          </label>
          {deviceTarget?.status !== deviceForm.status && (
            <>
              <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                Een toestelstatus wijzigen vereist owner step-up. Bij intrekken of buiten gebruik stellen worden alle sessies onmiddellijk beëindigd.
              </p>
              <label className="block text-xs font-bold text-slate-700">
                Owner-PIN
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={deviceForm.ownerPin}
                  onChange={(event) => setDeviceForm({ ...deviceForm, ownerPin: event.target.value.replace(/\D/g, "") })}
                  className={`${fieldClass} text-center tracking-[0.35em]`}
                />
              </label>
            </>
          )}
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button type="button" onClick={() => setDeviceTarget(null)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold">Annuleren</button>
            <button type="submit" disabled={saving} className="rounded-xl bg-cyan-800 px-3 py-2 text-xs font-extrabold text-white disabled:opacity-50">Veilig opslaan</button>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(resetTarget)}
        onClose={() => setResetTarget(null)}
        title="Persoonlijke PIN resetten"
        subtitle={resetTarget ? `Voor ${resetTarget.displayName}` : undefined}
        icon={<KeyRound size={18} />}
        size="sm"
      >
        <div className="space-y-4">
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
            Alle bestaande kassasessies worden ingetrokken. De tijdelijke PIN is
            24 uur geldig en moet bij de eerste login worden vervangen.
          </p>
          {error && (
            <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-800">
              {error}
            </p>
          )}
          <label className="block text-xs font-bold text-slate-700">
            Bevestig met je eigen owner-PIN
            <input
              type="password"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={ownerPin}
              onChange={(event) =>
                setOwnerPin(event.target.value.replace(/\D/g, ""))
              }
              className={`${fieldClass} text-center tracking-[0.35em]`}
            />
          </label>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={() => setResetTarget(null)}
              className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold"
            >
              Annuleren
            </button>
            <button
              type="button"
              disabled={saving || (!hasRecentOwnerStepUp && ownerPin.length !== 6)}
              onClick={() => void performReset()}
              className="rounded-xl bg-cyan-800 px-3 py-2 text-xs font-extrabold text-white disabled:opacity-50"
            >
              Reset veilig uitvoeren
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(temporaryPin)}
        onClose={() => setTemporaryPin(null)}
        title="Tijdelijke PIN — één keer zichtbaar"
        subtitle={temporaryPin?.operator}
        icon={<KeyRound size={18} />}
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-xs leading-5 text-slate-600">
            Geef deze code rechtstreeks aan de medewerker. PWAYMENT toont hem na
            het sluiten van dit venster nooit opnieuw.
          </p>
          <div className="rounded-2xl border border-cyan-200 bg-cyan-50 p-5 text-center">
            <strong className="text-3xl font-black tracking-[0.28em] text-cyan-950">
              {temporaryPin?.pin}
            </strong>
            <small className="mt-2 block text-[11px] font-bold text-cyan-800">
              Geldig tot {formatMoment(temporaryPin?.expiresAt)}
            </small>
          </div>
          <button
            type="button"
            onClick={() => setTemporaryPin(null)}
            className="w-full rounded-xl bg-slate-950 px-4 py-2.5 text-xs font-extrabold text-white"
          >
            Ik heb de code veilig doorgegeven
          </button>
        </div>
      </Modal>
    </div>
  );
};
