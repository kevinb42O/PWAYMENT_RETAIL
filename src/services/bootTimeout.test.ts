import { describe, expect, it, vi } from "vitest";
import { BootTimeoutError, withBootTimeout } from "./bootTimeout";

describe("withBootTimeout", () => {
  it("returns a completed boot operation", async () => {
    await expect(withBootTimeout("sessie", Promise.resolve("ready"), 100)).resolves.toBe("ready");
  });

  it("rejects a stalled boot operation", async () => {
    vi.useFakeTimers();
    const stalled = withBootTimeout("sessie", new Promise(() => undefined), 1_000);
    const assertion = expect(stalled).rejects.toBeInstanceOf(BootTimeoutError);
    await vi.advanceTimersByTimeAsync(1_000);
    await assertion;
    vi.useRealTimers();
  });
});
