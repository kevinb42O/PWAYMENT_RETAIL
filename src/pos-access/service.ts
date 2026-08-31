import { supabase } from "../lib/supabase";
import type { Json } from "../types/database.generated";
import type {
  PosAccessAdminSnapshot,
  PosDevice,
  PosOperator,
} from "./types";

type RpcResult = { data: unknown; error: { message: string } | null };
type PosAccessRpc = {
  rpc: (name: string, args: Record<string, unknown>) => Promise<RpcResult>;
};

const rpc = supabase as unknown as PosAccessRpc;

const assertObject = (value: unknown, message: string): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(message);
  }
  return value as Record<string, unknown>;
};

const call = async (name: string, args: Record<string, unknown>) => {
  const { data, error } = await rpc.rpc(name, args);
  if (error) throw new Error(error.message);
  return assertObject(data, "De kassatoegangsserver gaf geen geldig antwoord.");
};

export const isPosAccessNetworkError = (error: unknown): boolean => {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /failed to fetch|network(?: request)? (?:error|failed)|load failed|connection (?:refused|reset)|fetch failed|offline/i.test(message);
};

export const bootstrapPosAccess = async (
  storeId: string,
  installationId: string,
): Promise<{ configured: boolean; operatorCount: number; device: PosDevice | null }> => {
  const data = await call("bootstrap_pos_access", {
    target_store_id: storeId,
    target_installation_id: installationId,
  });
  return {
    configured: data.configured === true,
    operatorCount: typeof data.operatorCount === "number" ? data.operatorCount : 0,
    device: data.device ? (data.device as PosDevice) : null,
  };
};

export const setupOwnerPosAccess = async (input: {
  storeId: string;
  installationId: string;
  deviceName: string;
  pin: string;
}): Promise<{ deviceId: string; operatorId: string }> => {
  const data = await call("setup_owner_pos_access", {
    target_store_id: input.storeId,
    target_installation_id: input.installationId,
    device_name: input.deviceName.trim(),
    submitted_pin: input.pin,
  });
  if (data.ok === false) {
    const code = typeof data.errorCode === "string" ? data.errorCode : "pairing-failed";
    const retryAt = typeof data.retryAt === "string"
      ? ` Probeer opnieuw na ${new Date(data.retryAt).toLocaleTimeString("nl-BE", { hour: "2-digit", minute: "2-digit" })}.`
      : "";
    throw new Error(code === "pin-locked"
      ? `Te veel mislukte koppelingspogingen.${retryAt}`
      : "De owner-PIN is niet correct.");
  }
  if (typeof data.deviceId !== "string" || typeof data.operatorId !== "string") {
    throw new Error("De kassa kon niet volledig worden geactiveerd.");
  }
  return { deviceId: data.deviceId, operatorId: data.operatorId };
};

export const verifyPosOperatorPin = async (input: {
  storeId: string;
  deviceId: string;
  pin: string;
}): Promise<{
  ok: boolean;
  errorCode?: string;
  retryAt?: string;
  sessionToken?: string;
  expiresAt?: string;
  offlineGrant?: { token: string; expiresAt: string } | null;
  operator?: PosOperator;
}> => {
  const data = await call("verify_pos_operator_pin", {
    target_store_id: input.storeId,
    target_device_id: input.deviceId,
    submitted_pin: input.pin,
  });
  return data as ReturnType<typeof verifyPosOperatorPin> extends Promise<infer R> ? R : never;
};

export const endPosOperatorSession = async (
  storeId: string,
  sessionToken: string,
  reason = "user-lock",
): Promise<void> => {
  const { error } = await rpc.rpc("end_pos_operator_session", {
    target_store_id: storeId,
    session_token: sessionToken,
    reason,
  });
  if (error) throw new Error(error.message);
};

export const stepUpPosOwner = async (
  storeId: string,
  sessionToken: string,
  pin: string,
): Promise<boolean> => {
  const data = await call("step_up_pos_owner", {
    target_store_id: storeId,
    session_token: sessionToken,
    submitted_pin: pin,
  });
  return data.ok === true;
};

export const listPosAccessAdmin = async (
  storeId: string,
  sessionToken: string,
): Promise<PosAccessAdminSnapshot> => {
  const data = await call("list_pos_access_admin", {
    target_store_id: storeId,
    session_token: sessionToken,
  });
  return {
    operators: Array.isArray(data.operators) ? (data.operators as PosOperator[]) : [],
    devices: Array.isArray(data.devices) ? (data.devices as PosDevice[]) : [],
    events: Array.isArray(data.events) ? (data.events as PosAccessAdminSnapshot["events"]) : [],
  };
};

export const savePosOperator = async (input: {
  storeId: string;
  sessionToken: string;
  payload: Record<string, unknown>;
}): Promise<string> => {
  const data = await call("save_pos_operator", {
    target_store_id: input.storeId,
    session_token: input.sessionToken,
    payload: input.payload as Json,
  });
  if (typeof data.operatorId !== "string") throw new Error("De medewerker kon niet worden bewaard.");
  return data.operatorId;
};

export const resetPosOperatorPin = async (input: {
  storeId: string;
  sessionToken: string;
  operatorId: string;
}): Promise<{ temporaryPin: string; expiresAt: string }> => {
  const data = await call("reset_pos_operator_pin", {
    target_store_id: input.storeId,
    session_token: input.sessionToken,
    target_operator_id: input.operatorId,
  });
  if (typeof data.temporaryPin !== "string" || typeof data.expiresAt !== "string") {
    throw new Error("De tijdelijke PIN kon niet worden aangemaakt.");
  }
  return { temporaryPin: data.temporaryPin, expiresAt: data.expiresAt };
};

export const changeOwnPosPin = async (input: {
  storeId: string;
  sessionToken: string;
  pin: string;
}): Promise<void> => {
  const data = await call("change_own_pos_pin", {
    target_store_id: input.storeId,
    session_token: input.sessionToken,
    new_pin: input.pin,
  });
  if (data.ok !== true) throw new Error("De nieuwe PIN kon niet worden ingesteld.");
};

export const updatePosDevice = async (input: {
  storeId: string;
  sessionToken: string;
  deviceId: string;
  payload: Record<string, unknown>;
}): Promise<void> => {
  const data = await call("update_pos_device", {
    target_store_id: input.storeId,
    session_token: input.sessionToken,
    target_device_id: input.deviceId,
    payload: input.payload as Json,
  });
  if (data.ok !== true) throw new Error("De toestelinstellingen konden niet worden bewaard.");
};
