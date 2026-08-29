import { describe, expect, it } from "vitest";
import {
  INITIAL_PACE_TRUTH_STATE,
  derivePaceExpression,
  derivePaceTruthState,
  reducePaceTruthState,
} from "./paceExperience";

describe("Pace truth state", () => {
  it("derives only states the current non-streaming client can prove", () => {
    const base = {
      enabled: true,
      open: true,
      online: true,
      thinking: false,
      slow: false,
      hardLimited: false,
      hasResponse: false,
      hasClarification: false,
      hasAction: false,
      hasAttentionSignal: false,
    };
    expect(derivePaceTruthState({ ...base, thinking: true }).phase).toBe("planning");
    expect(derivePaceTruthState({ ...base, thinking: true, slow: true }).phase).toBe("degraded");
    expect(derivePaceTruthState({ ...base, hasResponse: true, hasAction: true }).phase).toBe("guiding");
    expect(derivePaceTruthState({ ...base, hasResponse: true, hasClarification: true }).phase).toBe("awaiting_confirmation");
    expect(derivePaceTruthState({ ...base, online: false, thinking: true }).phase).toBe("offline");
  });

  it("rejects stale and cross-turn progress events", () => {
    const started = reducePaceTruthState(INITIAL_PACE_TRUTH_STATE, { type: "turn_started", turnId: "turn-1" });
    const retrieving = reducePaceTruthState(started, { type: "progress", turnId: "turn-1", sequence: 2, phase: "retrieving", sourceCount: 2 });
    expect(retrieving).toMatchObject({ phase: "retrieving", sequence: 2, sourceCount: 2 });
    expect(reducePaceTruthState(retrieving, { type: "progress", turnId: "turn-1", sequence: 1, phase: "planning" })).toBe(retrieving);
    expect(reducePaceTruthState(retrieving, { type: "progress", turnId: "turn-2", sequence: 3, phase: "ready" })).toBe(retrieving);
  });

  it("bounds public progress and removes the turn on cancellation", () => {
    const started = reducePaceTruthState(INITIAL_PACE_TRUTH_STATE, { type: "turn_started", turnId: "turn-1" });
    const progressed = reducePaceTruthState(started, {
      type: "progress",
      turnId: "turn-1",
      sequence: 1,
      phase: "retrieving",
      progress: { completed: 8, total: 3 },
    });
    expect(progressed.progress).toEqual({ completed: 3, total: 3 });
    expect(reducePaceTruthState(progressed, { type: "turn_cancelled", turnId: "turn-1" })).toEqual({
      phase: "aware",
      interaction: "none",
      severity: "neutral",
      sequence: 1,
    });
  });
});

describe("Pace expression mapping", () => {
  it("maps truth states deterministically and keeps motion preferences semantic", () => {
    const planning = { phase: "planning", interaction: "cancel", severity: "neutral", sequence: 0 } as const;
    expect(derivePaceExpression(planning, "full")).toMatchObject({ pose: "focus", energy: "medium", emotion: "thinking", tone: "flow" });
    expect(derivePaceExpression(planning, "off")).toMatchObject({ pose: "focus", energy: "still", emotion: "thinking", tone: "flow" });
    expect(derivePaceExpression({ ...planning, phase: "degraded" }, "full")).toMatchObject({ accent: "warning", emotion: "thinking", tone: "attention" });
  });
});
