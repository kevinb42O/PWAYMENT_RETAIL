import { describe, expect, it } from "vitest";
import {
  contrastRatio,
  createAccessibleCustomerDisplayTheme,
} from "./theme";

describe("customer display theme", () => {
  it("keeps a sufficiently dark merchant accent", () => {
    const theme = createAccessibleCustomerDisplayTheme("#0891b2");
    expect(contrastRatio(theme.accentText, "#ffffff")).toBeGreaterThanOrEqual(4.5);
  });

  it("derives readable financial text from a very light accent", () => {
    const theme = createAccessibleCustomerDisplayTheme("#ffff00");
    expect(theme.adjustedForContrast).toBe(true);
    expect(contrastRatio(theme.accentText, "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(theme.onAccent).toBe("#0f172a");
  });

  it("falls back safely for malformed colors", () => {
    expect(createAccessibleCustomerDisplayTheme("not-a-color").accent).toBe("#0891b2");
  });
});
