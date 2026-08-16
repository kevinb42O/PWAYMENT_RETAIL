/**
 * Stable machine lookup key for a completed retail document.
 *
 * The code intentionally does not contain an id, amount, date or customer
 * information. It is generated before an offline checkout is committed, so a
 * printed receipt keeps resolving to the same transaction after server sync.
 */
export const RECEIPT_BARCODE_PREFIX = "91";
export const RECEIPT_BARCODE_LENGTH = 20;

export const normalizeReceiptBarcode = (value?: string): string =>
  (value ?? "").replace(/\D/g, "");

export const luhnCheckDigit = (withoutCheckDigit: string): string => {
  let sum = 0;
  let doubleDigit = true;
  for (let index = withoutCheckDigit.length - 1; index >= 0; index -= 1) {
    let digit = Number(withoutCheckDigit[index]);
    if (doubleDigit) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    doubleDigit = !doubleDigit;
  }
  return String((10 - (sum % 10)) % 10);
};

export const isValidReceiptBarcode = (value?: string): boolean => {
  const code = normalizeReceiptBarcode(value);
  return (
    code.length === RECEIPT_BARCODE_LENGTH &&
    code.startsWith(RECEIPT_BARCODE_PREFIX) &&
    luhnCheckDigit(code.slice(0, -1)) === code.at(-1)
  );
};

/** Generate 56 bits of collision-resistant entropy as a Code 128-C payload. */
export const generateReceiptBarcode = (): string => {
  const bytes = new Uint8Array(17);
  globalThis.crypto.getRandomValues(bytes);
  const entropy = Array.from(bytes, (byte) => String(byte % 10)).join("");
  const body = `${RECEIPT_BARCODE_PREFIX}${entropy}`;
  return `${body}${luhnCheckDigit(body)}`;
};

export const formatReceiptBarcode = (value?: string): string => {
  const code = normalizeReceiptBarcode(value);
  return code.replace(/(\d{2})(?=\d)/g, "$1 ").trim();
};
