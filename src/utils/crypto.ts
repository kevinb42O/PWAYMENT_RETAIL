/**
 * SHA-256 hex of a UTF-8 string. Uses Web Crypto in browsers, falls back to
 * Node's webcrypto in test environments (Vitest).
 */
export async function generateHash(data: string): Promise<string> {
  const subtle =
    (typeof globalThis !== 'undefined' &&
      (globalThis.crypto?.subtle ??
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        ((): SubtleCrypto | undefined => {
          try {
            // Node test fallback
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            return require('node:crypto').webcrypto.subtle;
          } catch {
            return undefined;
          }
        })())) ||
    null;

  if (!subtle) throw new Error('SubtleCrypto not available');
  const buf = new TextEncoder().encode(data);
  const digest = await subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
