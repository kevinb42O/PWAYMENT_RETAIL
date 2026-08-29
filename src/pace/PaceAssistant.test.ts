import { describe, expect, it } from "vitest";
import {
  composePaceQueryResponse,
  composeStoredPaceResponse,
  paceAssistantModeLabel,
  paceClarificationFollowUp,
  paceResponseSourceLabel,
  paceThinkingStatus,
  shouldShowPaceSetupProgress,
  shouldUseLocalPaceDestination,
} from "./PaceAssistant";
import type { PaceQueryAnswer } from "./paceSignals";

const localAnswer: PaceQueryAnswer = {
  intentId: "pos.payment",
  title: "Betalen aan de kassa",
  answer: "Lokaal antwoord",
  action: { kind: "navigate", view: "pos" },
  actionLabel: "Open Kassa",
  steps: ["Controleer de mand."],
  limitation: "Pace start geen betaling.",
  followUps: ["Hoe splits ik de betaling?"],
  confidence: 0.9,
  matched: true,
};

describe("Pace assistant response safety", () => {
  it("does not attach local regex actions or instructions to a remote answer", () => {
    expect(composePaceQueryResponse(localAnswer, { answer: "Serverantwoord", source: "gemini" })).toEqual(expect.objectContaining({
      answer: "Serverantwoord",
      action: { kind: "none" },
      actionLabel: undefined,
      steps: undefined,
      limitation: undefined,
      followUps: undefined,
    }));
  });

  it("keeps structured local guidance for a local server fallback", () => {
    expect(composePaceQueryResponse(localAnswer, { answer: "Lokaal serverantwoord", source: "local" })).toEqual(expect.objectContaining({
      action: { kind: "navigate", view: "pos" },
      actionLabel: "Open Kassa",
      steps: ["Controleer de mand."],
    }));
  });

  it("uses the local fast path only for a reviewed high-confidence typed destination", () => {
    const typed = { ...localAnswer, confidence: 0.92, action: { kind: "destination" as const, destination: { type: "workspace" as const, view: "pos" as const, focus: "cart" as const, label: "de winkelmand", reason: "Open de bestaande mand." } } };
    expect(shouldUseLocalPaceDestination(typed)).toBe(true);
    expect(shouldUseLocalPaceDestination({ ...typed, confidence: 0.89 })).toBe(false);
    expect(shouldUseLocalPaceDestination(localAnswer)).toBe(false);
  });

  it("hides completed setup progress from the Pace overview", () => {
    expect(shouldShowPaceSetupProgress({ role: "owner", ready: true })).toBe(false);
    expect(shouldShowPaceSetupProgress({ role: "manager", ready: true })).toBe(false);
    expect(shouldShowPaceSetupProgress({ role: "owner", ready: false })).toBe(true);
    expect(shouldShowPaceSetupProgress({ role: "cashier", ready: false })).toBe(false);
  });

  it("does not reconstruct unverified actions when reopening a stored answer", () => {
    expect(composeStoredPaceResponse(localAnswer, "Historisch antwoord", "Onderzoek")).toEqual(expect.objectContaining({
      title: "Onderzoek",
      answer: "Historisch antwoord",
      action: { kind: "none" },
      actionLabel: undefined,
      steps: undefined,
    }));
    expect(paceResponseSourceLabel("history")).toBe("BEWAARD ANTWOORD");
  });

  it("reports the actual privacy mode instead of always claiming live context", () => {
    expect(paceAssistantModeLabel({ aiEnabled: false, liveStoreContext: true, thinking: false })).toBe("LOKALE KENNIS");
    expect(paceAssistantModeLabel({ aiEnabled: true, liveStoreContext: false, thinking: false })).toBe("AI · GEEN WINKELGEGEVENS");
    expect(paceAssistantModeLabel({ aiEnabled: true, liveStoreContext: true, thinking: false })).toBe("AI + WINKELGEGEVENS");
  });

  it("uses truthful request status without claiming unknown backend phases", () => {
    expect(paceThinkingStatus({ aiEnabled: true, liveStoreContext: true, slow: false })).toContain("kunnen worden opgehaald");
    expect(paceThinkingStatus({ aiEnabled: true, liveStoreContext: false, slow: false })).toContain("zonder actuele winkelgegevens");
    expect(paceThinkingStatus({ aiEnabled: false, liveStoreContext: false, slow: false })).toContain("lokale PWAYMENT-productkennis");
    expect(paceThinkingStatus({ aiEnabled: true, liveStoreContext: true, slow: true })).toContain("langer dan normaal");
  });

  it("turns authenticated progress into specific public status copy", () => {
    expect(paceThinkingStatus({
      aiEnabled: true,
      liveStoreContext: true,
      slow: false,
      truthState: { phase: "retrieving", interaction: "cancel", severity: "neutral", sequence: 3, progress: { completed: 2, total: 4 } },
    })).toBe("2 van 4 toegestane gegevensbronnen gecontroleerd.");
    expect(paceThinkingStatus({
      aiEnabled: true,
      liveStoreContext: true,
      slow: false,
      truthState: { phase: "verifying", interaction: "cancel", severity: "neutral", sequence: 4 },
    })).toContain("bron en actualiteit");
  });

  it("bounds clarification labels before sending a follow-up", () => {
    const followUp = paceClarificationFollowUp(`  ${"A".repeat(200)}  `);
    expect(followUp).toBe(`Ik bedoel ${"A".repeat(160)}.`);
  });
});
