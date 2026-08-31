import type { PosDevice, PosOperator } from "./types";

const PREFIX = "pwayment:pos-offline-grant:v1:";
const ATTEMPTS_PREFIX = "pwayment:pos-offline-attempts:v1:";
const ITERATIONS = 310_000;

interface StoredGrant {
  version: 1;
  storeId: string;
  installationId: string;
  operatorId: string;
  device: PosDevice;
  expiresAt: string;
  salt: string;
  iv: string;
  ciphertext: string;
  updatedAt: number;
}

interface GrantPayload {
  token: string;
  operator: PosOperator;
}

export interface UnlockedOfflineGrant extends GrantPayload {
  device: PosDevice;
  expiresAt: string;
}

const toBase64 = (bytes: Uint8Array): string => {
  let value = "";
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value);
};
const fromBase64 = (value: string): Uint8Array => {
  const decoded = atob(value);
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
};

const deriveKey = async (pin: string, salt: Uint8Array): Promise<CryptoKey> => {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pin),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations: ITERATIONS },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
};

const keyFor = (storeId: string, installationId: string, operatorId: string) =>
  `${PREFIX}${storeId}:${installationId}:${operatorId}`;

const recordsFor = (storeId: string, installationId: string): StoredGrant[] => {
  const records: StoredGrant[] = [];
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key?.startsWith(`${PREFIX}${storeId}:${installationId}:`)) continue;
      const record = JSON.parse(localStorage.getItem(key) ?? "null") as StoredGrant | null;
      if (record?.version === 1 && record.storeId === storeId && record.installationId === installationId) {
        records.push(record);
      }
    }
  } catch {
    return [];
  }
  return records.sort((left, right) => right.updatedAt - left.updatedAt);
};

export const saveOfflineGrant = async (input: {
  storeId: string;
  installationId: string;
  pin: string;
  token: string;
  expiresAt: string;
  operator: PosOperator;
  device: PosDevice;
}): Promise<void> => {
  if (!crypto.subtle || new Date(input.expiresAt).getTime() <= Date.now()) return;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(input.pin, salt);
  const plaintext = new TextEncoder().encode(JSON.stringify({ token: input.token, operator: input.operator }));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  const record: StoredGrant = {
    version: 1,
    storeId: input.storeId,
    installationId: input.installationId,
    operatorId: input.operator.id,
    device: input.device,
    expiresAt: input.expiresAt,
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(ciphertext)),
    updatedAt: Date.now(),
  };
  localStorage.setItem(keyFor(input.storeId, input.installationId, input.operator.id), JSON.stringify(record));
};

export const getCachedOfflineDevice = (
  storeId: string,
  installationId: string,
): PosDevice | null => {
  const record = recordsFor(storeId, installationId).find(
    (candidate) => new Date(candidate.expiresAt).getTime() > Date.now(),
  );
  return record?.device ?? null;
};

const attemptKey = (storeId: string, installationId: string) =>
  `${ATTEMPTS_PREFIX}${storeId}:${installationId}`;

const readAttempts = (storeId: string, installationId: string): { failures: number; lockedUntil: number } => {
  try {
    return JSON.parse(localStorage.getItem(attemptKey(storeId, installationId)) ?? "null")
      ?? { failures: 0, lockedUntil: 0 };
  } catch {
    return { failures: 0, lockedUntil: 0 };
  }
};

export const offlineRetryAt = (storeId: string, installationId: string): number =>
  readAttempts(storeId, installationId).lockedUntil;

export const unlockOfflineGrant = async (
  storeId: string,
  installationId: string,
  pin: string,
): Promise<UnlockedOfflineGrant | null> => {
  const attempts = readAttempts(storeId, installationId);
  if (attempts.lockedUntil > Date.now()) return null;
  for (const record of recordsFor(storeId, installationId)) {
    if (new Date(record.expiresAt).getTime() <= Date.now()) continue;
    try {
      const salt = fromBase64(record.salt);
      const key = await deriveKey(pin, salt);
      const decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: fromBase64(record.iv) },
        key,
        fromBase64(record.ciphertext),
      );
      const payload = JSON.parse(new TextDecoder().decode(decrypted)) as GrantPayload;
      if (!payload.token || payload.operator.id !== record.operatorId) continue;
      localStorage.removeItem(attemptKey(storeId, installationId));
      return { ...payload, device: record.device, expiresAt: record.expiresAt };
    } catch {
      // Every record must be attempted because the PIN itself selects the user.
    }
  }
  const failures = attempts.failures + 1;
  const lockedUntil = failures >= 10
    ? Date.now() + 15 * 60_000
    : failures >= 5
      ? Date.now() + 30_000
      : 0;
  localStorage.setItem(attemptKey(storeId, installationId), JSON.stringify({ failures, lockedUntil }));
  return null;
};
