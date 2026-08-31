import { create } from "zustand";
import { db } from "../db/db";
import { isSupabaseConfigured } from "../lib/supabase";
import type { Role } from "../types";
import { verifyCredential } from "../utils/credentials";
import { useAuth } from "../auth/useAuth";
import {
  bootstrapPosAccess,
  changeOwnPosPin,
  endPosOperatorSession,
  isPosAccessNetworkError,
  setupOwnerPosAccess,
  stepUpPosOwner,
  verifyPosOperatorPin,
} from "./service";
import type { PosAccessStatus, PosDevice, PosOperator } from "./types";
import {
  getCachedOfflineDevice,
  offlineRetryAt,
  saveOfflineGrant,
  unlockOfflineGrant,
} from "./offlineGrant";

const INSTALLATION_KEY = "pwayment:pos-installation:v1";

export const getPosInstallationId = (): string => {
  try {
    const existing = localStorage.getItem(INSTALLATION_KEY);
    if (existing && /^[0-9a-f-]{36}$/i.test(existing)) return existing;
    const created = crypto.randomUUID();
    localStorage.setItem(INSTALLATION_KEY, created);
    return created;
  } catch {
    return crypto.randomUUID();
  }
};

const fixtureRuntime = () =>
  import.meta.env.DEV ||
  import.meta.env.VITE_E2E_BUILD === "true" ||
  import.meta.env.VITE_PRESENTATION_BUILD === "true" ||
  !isSupabaseConfigured;

const pinError = (code?: string, retryAt?: string): string => {
  if (code === "device-revoked") return "Deze kassa is ingetrokken. Laat de eigenaar het toestel opnieuw activeren.";
  if (code === "operator-inactive") return "Deze kassatoegang is niet actief. Neem contact op met de eigenaar.";
  if (code === "reset-expired") return "De tijdelijke PIN is verlopen. Vraag de eigenaar om een nieuwe reset.";
  if (code === "pin-locked") {
    const suffix = retryAt ? ` Probeer opnieuw na ${new Date(retryAt).toLocaleTimeString("nl-BE", { hour: "2-digit", minute: "2-digit" })}.` : " Probeer later opnieuw.";
    return `Te veel mislukte pogingen.${suffix}`;
  }
  return "De PIN is niet correct. Probeer opnieuw.";
};

interface PosAccessState {
  status: PosAccessStatus;
  storeId: string | null;
  device: PosDevice | null;
  operator: PosOperator | null;
  sessionToken: string | null;
  expiresAt: string | null;
  error: string | null;
  initializedFor: string | null;
  ownerStepUpAt: number | null;
  initialize: (storeId: string | null) => Promise<void>;
  setupOwner: (pin: string, deviceName: string) => Promise<boolean>;
  unlock: (pin: string) => Promise<boolean>;
  lock: (reason?: string) => Promise<void>;
  stepUpOwner: (pin: string) => Promise<boolean>;
  changePin: (pin: string) => Promise<boolean>;
  clearError: () => void;
  reset: () => void;
}

const initialState = {
  status: "idle" as PosAccessStatus,
  storeId: null,
  device: null,
  operator: null,
  sessionToken: null,
  expiresAt: null,
  error: null,
  initializedFor: null,
  ownerStepUpAt: null,
};

export const usePosAccess = create<PosAccessState>((set, get) => ({
  ...initialState,
  async initialize(storeId) {
    const key = storeId ?? "fixture";
    if (get().initializedFor === key && get().status !== "error") return;
    useAuth.getState().clearOperator();
    set({ ...initialState, status: "loading", storeId, initializedFor: key });
    if (fixtureRuntime() || !storeId) {
      set({
        status: "locked",
        device: { id: "fixture-device", name: "Deze kassa", status: "active", offlineGraceHours: 24 },
      });
      return;
    }
    try {
      const result = await bootstrapPosAccess(storeId, getPosInstallationId());
      if (!result.configured || !result.device) {
        set({ status: "setup-required", device: result.device });
        return;
      }
      if (result.device.status !== "active") {
        set({ status: "device-revoked", device: result.device });
        return;
      }
      set({ status: "locked", device: result.device });
    } catch (error) {
      const cachedDevice = getCachedOfflineDevice(storeId, getPosInstallationId());
      if (cachedDevice && isPosAccessNetworkError(error)) {
        set({ status: "locked", device: cachedDevice, error: "Offline modus · gebruik je persoonlijke PIN." });
      } else {
        set({ status: "error", error: error instanceof Error ? error.message : "Kassatoegang kon niet worden geladen." });
      }
    }
  },
  async setupOwner(pin, deviceName) {
    const { storeId } = get();
    if (!storeId || !/^\d{6}$/.test(pin)) return false;
    set({ status: "verifying", error: null });
    try {
      const result = await setupOwnerPosAccess({ storeId, installationId: getPosInstallationId(), deviceName, pin });
      set({
        device: { id: result.deviceId, name: deviceName.trim(), status: "active", offlineGraceHours: 24 },
        status: "locked",
      });
      return true;
    } catch (error) {
      set({ status: "setup-required", error: error instanceof Error ? error.message : "De kassa kon niet worden geactiveerd." });
      return false;
    }
  },
  async unlock(pin) {
    if (!/^\d{6}$/.test(pin)) return false;
    const { storeId, device } = get();
    set({ status: "verifying", error: null });
    if (fixtureRuntime() || !storeId) {
      const users = await db.users.toArray();
      if (import.meta.env.VITE_E2E_BUILD === "true" && !import.meta.env.DEV) {
        const fixtureIdByPin: Record<string, string> = {
          "123456": "u-owner",
          "234567": "u-mgr",
          "111111": "u-w1",
          "222222": "u-w2",
        };
        const fixtureUserId = fixtureIdByPin[pin];
        const fixtureUser = users.find((user) => user.id === fixtureUserId)
          ?? (pin === "486205" ? users.find((user) => user.email === "e2e-owner@example.test") : undefined);
        if (fixtureUser) {
          const operator: PosOperator = { id: fixtureUser.id, displayName: fixtureUser.name, role: fixtureUser.role, jobTitle: fixtureUser.jobTitle };
          useAuth.getState().activateOperator({ id: operator.id, name: operator.displayName, role: operator.role });
          set({ status: "active", operator, sessionToken: `fixture:${fixtureUser.id}`, expiresAt: null });
          return true;
        }
        if (fixtureUserId) {
          set({ status: "locked", error: "De PIN is niet correct. Probeer opnieuw." });
          return false;
        }
      }
      for (const user of users) {
        if (!user.pinHash) continue;
        const check = await verifyCredential(pin, "pin", user.pinHash);
        if (!check.valid) continue;
        const operator: PosOperator = { id: user.id, displayName: user.name, role: user.role, jobTitle: user.jobTitle };
        useAuth.getState().activateOperator({ id: operator.id, name: operator.displayName, role: operator.role });
        set({ status: "active", operator, sessionToken: `fixture:${user.id}`, expiresAt: null });
        return true;
      }
      set({ status: "locked", error: "De PIN is niet correct. Probeer opnieuw." });
      return false;
    }
    if (!device) {
      set({ status: "setup-required", error: "Deze kassa is nog niet gekoppeld." });
      return false;
    }
    try {
      const result = await verifyPosOperatorPin({ storeId, deviceId: device.id, pin });
      if (!result.ok || !result.operator || !result.sessionToken) {
        set({ status: result.errorCode === "device-revoked" ? "device-revoked" : "locked", error: pinError(result.errorCode, result.retryAt) });
        return false;
      }
      const operator = result.operator;
      if (result.offlineGrant?.token && result.offlineGrant.expiresAt) {
        await saveOfflineGrant({
          storeId,
          installationId: getPosInstallationId(),
          pin,
          token: result.offlineGrant.token,
          expiresAt: result.offlineGrant.expiresAt,
          operator,
          device,
        });
      }
      useAuth.getState().activateOperator({ id: operator.id, name: operator.displayName, role: operator.role });
      set({
        status: operator.mustChangePin ? "pin-change-required" : "active",
        operator,
        sessionToken: result.sessionToken,
        expiresAt: result.expiresAt ?? null,
      });
      return true;
    } catch (error) {
      if (!isPosAccessNetworkError(error)) {
        set({
          status: "locked",
          error: error instanceof Error ? error.message : "Aanmelden is tijdelijk niet mogelijk.",
        });
        return false;
      }
      const installationId = getPosInstallationId();
      const offline = await unlockOfflineGrant(storeId, installationId, pin);
      if (offline) {
        useAuth.getState().activateOperator({ id: offline.operator.id, name: offline.operator.displayName, role: offline.operator.role });
        set({
          status: "active",
          operator: offline.operator,
          device: offline.device,
          sessionToken: `offline:${offline.token}`,
          expiresAt: offline.expiresAt,
          error: "Offline sessie · beheerinstellingen zijn tijdelijk gesloten.",
        });
        return true;
      }
      const retryAt = offlineRetryAt(storeId, installationId);
      set({
        status: "locked",
        error: retryAt > Date.now()
          ? `Te veel offline pogingen. Probeer opnieuw na ${new Date(retryAt).toLocaleTimeString("nl-BE", { hour: "2-digit", minute: "2-digit" })}.`
          : error instanceof Error ? error.message : "Aanmelden is tijdelijk niet mogelijk.",
      });
      return false;
    }
  },
  async lock(reason = "user-lock") {
    const { storeId, sessionToken } = get();
    useAuth.getState().clearOperator();
    set({ status: "locked", operator: null, sessionToken: null, expiresAt: null, ownerStepUpAt: null, error: null });
    if (storeId && sessionToken && !sessionToken.startsWith("fixture:") && !sessionToken.startsWith("offline:")) {
      try { await endPosOperatorSession(storeId, sessionToken, reason); } catch { /* Local lock must never depend on network. */ }
    }
  },
  async stepUpOwner(pin) {
    const { storeId, sessionToken, operator } = get();
    if (operator?.role !== "owner" || !/^\d{6}$/.test(pin)) return false;
    if (fixtureRuntime() || !storeId || !sessionToken || sessionToken.startsWith("fixture:")) {
      const user = await db.users.get(operator.id);
      const valid = Boolean(user?.pinHash && (await verifyCredential(pin, "pin", user.pinHash)).valid);
      if (valid) set({ ownerStepUpAt: Date.now() });
      return valid;
    }
    try {
      const valid = await stepUpPosOwner(storeId, sessionToken, pin);
      if (valid) set({ ownerStepUpAt: Date.now() });
      return valid;
    } catch { return false; }
  },
  async changePin(pin) {
    const { storeId, sessionToken, operator } = get();
    if (!operator || !/^\d{6}$/.test(pin)) return false;
    try {
      if (fixtureRuntime() || !storeId || !sessionToken || sessionToken.startsWith("fixture:")) {
        const { hashCredential } = await import("../utils/credentials");
        await db.users.update(operator.id, { pinHash: await hashCredential(pin, "pin") });
      } else {
        await changeOwnPosPin({ storeId, sessionToken, pin });
      }
      await get().lock("pin-changed");
      return true;
    } catch (error) {
      set({ status: "pin-change-required", error: error instanceof Error ? error.message : "De PIN kon niet worden gewijzigd." });
      return false;
    }
  },
  clearError: () => set({ error: null }),
  reset: () => {
    useAuth.getState().clearOperator();
    set(initialState);
  },
}));

export const canAccessSettings = (role: Role | null): boolean => role === "owner";

export interface PosActionAttribution {
  operator_id: string;
  operator_device_id?: string;
  operator_session_token?: string;
  operator_offline_grant_token?: string;
}

/**
 * Builds the trusted-at-the-server attribution envelope for one POS command.
 * The token is added only when the still-active operator matches the operator
 * captured in the durable local record. Otherwise the server validates the
 * device-scoped offline assertion during outbox replay.
 */
export const getPosActionAttribution = (
  capturedOperatorId: string | null | undefined,
): PosActionAttribution | Record<string, never> => {
  if (!capturedOperatorId) return {};
  const { status, operator, device, sessionToken } = usePosAccess.getState();
  return {
    operator_id: capturedOperatorId,
    ...(device?.id && device.id !== "fixture-device" ? { operator_device_id: device.id } : {}),
    ...(status === "active" && operator?.id === capturedOperatorId && sessionToken && !sessionToken.startsWith("fixture:")
      ? sessionToken.startsWith("offline:")
        ? { operator_offline_grant_token: sessionToken.slice("offline:".length) }
        : { operator_session_token: sessionToken }
      : {}),
  };
};
