import { describe, expect, it, vi } from "vitest";
import { createMollieTestSimulatorPayment } from "./mollieTerminal";

describe("Mollie terminal test simulator", () => {
  it("creates an unmistakable local test payment", () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue("12345678-1234-4123-8123-123456789abc");

    expect(createMollieTestSimulatorPayment(9590)).toEqual({
      id: "sim_12345678123441238123123456789abc",
      status: "open",
      amountCents: 9590,
      testMode: true,
      simulator: true,
    });
  });
});
