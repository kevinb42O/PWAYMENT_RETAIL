import { describe, expect, it } from "vitest";
import { loadingJourneyStep } from "./loadingProgress";

describe("loadingJourneyStep", () => {
  it("maps technical loading stages onto the four customer-facing steps", () => {
    expect(loadingJourneyStep("starting")).toBe(0);
    expect(loadingJourneyStep("session")).toBe(0);
    expect(loadingJourneyStep("membership")).toBe(1);
    expect(loadingJourneyStep("store-data")).toBe(2);
    expect(loadingJourneyStep("local-cache")).toBe(2);
    expect(loadingJourneyStep("finishing")).toBe(3);
    expect(loadingJourneyStep("ready")).toBe(3);
  });
});
