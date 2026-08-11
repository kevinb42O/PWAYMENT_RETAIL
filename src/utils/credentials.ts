import { generateHash } from "./crypto";

const ITERATIONS = 120_000;
const PREFIX = "pbkdf2-sha256";

const subtleCrypto = (): SubtleCrypto => {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error("SubtleCrypto is niet beschikbaar");
  return subtle;
};

const bytesToHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

const hexToBytes = (hex: string): Uint8Array | null => {
  if (!/^[a-f\d]+$/i.test(hex) || hex.length % 2 !== 0) return null;
  return new Uint8Array(
    Array.from({ length: hex.length / 2 }, (_, index) =>
      Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16),
    ),
  );
};

const derive = async (
  secret: string,
  purpose: "pin" | "password",
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> => {
  const input = new TextEncoder().encode(`pwayment:${purpose}:${secret}`);
  const key = await subtleCrypto().importKey("raw", input, "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await subtleCrypto().deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    key,
    256,
  );
  return new Uint8Array(bits);
};

export const hashCredential = async (
  secret: string,
  purpose: "pin" | "password",
): Promise<string> => {
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const derived = await derive(secret, purpose, salt, ITERATIONS);
  return `${PREFIX}$${ITERATIONS}$${bytesToHex(salt)}$${bytesToHex(derived)}`;
};

const timingSafeEqual = (left: Uint8Array, right: Uint8Array): boolean => {
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
};

export const verifyCredential = async (
  secret: string,
  purpose: "pin" | "password",
  stored: string,
): Promise<{ valid: boolean; needsUpgrade: boolean }> => {
  const [prefix, iterationsText, saltHex, expectedHex] = stored.split("$");
  if (prefix === PREFIX) {
    const iterations = Number(iterationsText);
    const salt = hexToBytes(saltHex ?? "");
    const expected = hexToBytes(expectedHex ?? "");
    if (
      !Number.isSafeInteger(iterations) ||
      iterations < 50_000 ||
      iterations > 2_000_000 ||
      !salt ||
      salt.length < 16 ||
      !expected
    ) {
      return { valid: false, needsUpgrade: false };
    }
    const actual = await derive(secret, purpose, salt, iterations);
    return {
      valid: timingSafeEqual(actual, expected),
      needsUpgrade: iterations < ITERATIONS,
    };
  }

  // Backwards-compatible one-time verification for existing local accounts.
  const legacy = await generateHash(
    purpose === "pin" ? `pwayment:${secret}` : `pwayment-pwd:${secret}`,
  );
  return {
    valid: timingSafeEqual(
      hexToBytes(legacy)!,
      hexToBytes(stored) ?? new Uint8Array(),
    ),
    needsUpgrade: true,
  };
};
