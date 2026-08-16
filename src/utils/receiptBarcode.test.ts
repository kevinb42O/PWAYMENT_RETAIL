import { describe, expect, it } from "vitest";
import {
  formatReceiptBarcode,
  generateReceiptBarcode,
  isValidReceiptBarcode,
  luhnCheckDigit,
} from "./receiptBarcode";

describe("receipt barcodes", () => {
  it("generates a 20 digit PWAYMENT receipt barcode with a check digit", () => {
    const code = generateReceiptBarcode();
    expect(code).toMatch(/^91\d{18}$/);
    expect(isValidReceiptBarcode(code)).toBe(true);
  });

  it("rejects altered codes and formats only for human reading", () => {
    const body = "9112345678901234567";
    const code = `${body}${luhnCheckDigit(body)}`;
    expect(formatReceiptBarcode(code)).toBe("91 12 34 56 78 90 12 34 56 71");
    expect(isValidReceiptBarcode(`${code.slice(0, -1)}${code.at(-1) === "0" ? "1" : "0"}`)).toBe(false);
  });
});
