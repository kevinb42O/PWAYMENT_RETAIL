import { describe, expect, it } from "vitest";
import { formatMinutes, formatWorkdays } from "./format";

describe("workforce duration formatting", () => {
  it("keeps the canonical minute value exact", () => {
    expect(formatMinutes(456)).toBe("7 u 36 min");
    expect(formatMinutes(-60)).toBe("−1 u");
  });

  it("renders the Belgian four-week estimate in workdays", () => {
    expect(formatWorkdays(9120)).toBe("20 dagen");
  });
});
