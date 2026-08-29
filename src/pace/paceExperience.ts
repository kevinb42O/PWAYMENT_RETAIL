import type { PaceEmotion, PacePerformance } from "./PaceMark";
import type { PaceSignalTone } from "./paceSignals";
import type { PaceMotion } from "./usePace";

export type PaceExperienceState =
  | "dormant"
  | "aware"
  | "listening"
  | "planning"
  | "resolving"
  | "retrieving"
  | "comparing"
  | "composing"
  | "verifying"
  | "ready"
  | "guiding"
  | "awaiting_confirmation"
  | "executing"
  | "completed"
  | "blocked"
  | "degraded"
  | "offline";

export type PaceInteraction = "none" | "cancel" | "choose" | "confirm" | "retry" | "undo";
export type PaceSeverity = "neutral" | "positive" | "attention" | "critical";

export interface PaceTruthState {
  phase: PaceExperienceState;
  interaction: PaceInteraction;
  severity: PaceSeverity;
  turnId?: string;
  sequence: number;
  progress?: { completed: number; total: number };
  sourceCount?: number;
  reasonCode?: string;
}

export interface PaceExperienceSnapshot {
  enabled: boolean;
  open: boolean;
  online: boolean;
  thinking: boolean;
  slow: boolean;
  hardLimited: boolean;
  hasResponse: boolean;
  hasClarification: boolean;
  hasAction: boolean;
  hasAttentionSignal: boolean;
}

export interface PaceExpressionToken {
  pose: "rest" | "focus" | "split" | "gather" | "shield" | "path" | "settle" | "notch" | "tether";
  energy: "still" | "low" | "medium";
  accent: "brand" | "information" | "success" | "warning" | "danger" | "offline";
  emotion: PaceEmotion;
  tone: PaceSignalTone;
  performance: PacePerformance | null;
}

export type PaceTruthEvent =
  | { type: "turn_started"; turnId: string }
  | {
      type: "progress";
      turnId: string;
      sequence: number;
      phase: Exclude<PaceExperienceState, "dormant" | "aware" | "offline">;
      interaction?: PaceInteraction;
      severity?: PaceSeverity;
      progress?: { completed: number; total: number };
      sourceCount?: number;
      reasonCode?: string;
    }
  | { type: "turn_cancelled"; turnId: string };

export const INITIAL_PACE_TRUTH_STATE: PaceTruthState = {
  phase: "dormant",
  interaction: "none",
  severity: "neutral",
  sequence: 0,
};

const boundedProgress = (progress?: { completed: number; total: number }) => {
  if (!progress || !Number.isFinite(progress.completed) || !Number.isFinite(progress.total) || progress.total <= 0) return undefined;
  const total = Math.max(1, Math.floor(progress.total));
  return { completed: Math.min(total, Math.max(0, Math.floor(progress.completed))), total };
};

/**
 * Reduces authenticated public lifecycle events only. Events from another turn
 * or with a stale sequence cannot move Pace into a state the active turn has
 * not reached.
 */
export const reducePaceTruthState = (state: PaceTruthState, event: PaceTruthEvent): PaceTruthState => {
  if (event.type === "turn_started") {
    return {
      phase: "planning",
      interaction: "cancel",
      severity: "neutral",
      turnId: event.turnId,
      sequence: 0,
    };
  }
  if (event.turnId !== state.turnId) return state;
  if (event.type === "turn_cancelled") {
    return { phase: "aware", interaction: "none", severity: "neutral", sequence: state.sequence };
  }
  if (event.sequence <= state.sequence) return state;
  return {
    phase: event.phase,
    interaction: event.interaction ?? state.interaction,
    severity: event.severity ?? state.severity,
    turnId: event.turnId,
    sequence: event.sequence,
    progress: boundedProgress(event.progress),
    sourceCount: event.sourceCount == null ? undefined : Math.max(0, Math.floor(event.sourceCount)),
    reasonCode: event.reasonCode,
  };
};

/** Current non-streaming adapter. It exposes only states the client can prove. */
export const derivePaceTruthState = (snapshot: PaceExperienceSnapshot): PaceTruthState => {
  if (!snapshot.enabled) return INITIAL_PACE_TRUTH_STATE;
  if (!snapshot.online) return { phase: "offline", interaction: "none", severity: "attention", sequence: 0, reasonCode: "offline" };
  if (snapshot.open && snapshot.hardLimited) return { phase: "blocked", interaction: "retry", severity: "attention", sequence: 0, reasonCode: "quota" };
  if (snapshot.thinking && snapshot.slow) return { phase: "degraded", interaction: "cancel", severity: "attention", sequence: 0, reasonCode: "slow" };
  if (snapshot.thinking) return { phase: "planning", interaction: "cancel", severity: "neutral", sequence: 0 };
  if (snapshot.hasClarification) return { phase: "awaiting_confirmation", interaction: "choose", severity: "attention", sequence: 0 };
  if (snapshot.hasResponse && snapshot.hasAction) return { phase: "guiding", interaction: "none", severity: "neutral", sequence: 0 };
  if (snapshot.hasResponse) return { phase: "ready", interaction: "none", severity: "positive", sequence: 0 };
  if (snapshot.open || snapshot.hasAttentionSignal) return { phase: "aware", interaction: "none", severity: "neutral", sequence: 0 };
  return INITIAL_PACE_TRUTH_STATE;
};

const workingPhases = new Set<PaceExperienceState>(["listening", "planning", "resolving", "retrieving", "comparing", "composing", "verifying", "executing"]);

export const derivePaceExpression = (
  truth: PaceTruthState,
  motion: PaceMotion,
  signalTone: PaceSignalTone = "flow",
): PaceExpressionToken => {
  const energy = motion === "off" ? "still" : motion === "subtle" ? "low" : workingPhases.has(truth.phase) ? "medium" : "low";
  if (truth.phase === "offline") return { pose: "tether", energy, accent: "offline", emotion: "sleeping", tone: "attention", performance: null };
  if (truth.phase === "blocked") return { pose: "notch", energy, accent: truth.severity === "critical" ? "danger" : "warning", emotion: "attentive", tone: "attention", performance: null };
  if (truth.phase === "degraded") return { pose: "focus", energy, accent: "warning", emotion: "thinking", tone: "attention", performance: null };
  if (truth.phase === "awaiting_confirmation") return { pose: "shield", energy, accent: "warning", emotion: "attentive", tone: "attention", performance: null };
  if (truth.phase === "guiding") return { pose: "path", energy, accent: "information", emotion: "guiding", tone: "flow", performance: null };
  if (truth.phase === "completed") return { pose: "settle", energy, accent: "success", emotion: "celebrating", tone: "success", performance: null };
  if (truth.phase === "ready") return { pose: "settle", energy, accent: "success", emotion: "attentive", tone: "success", performance: null };
  if (workingPhases.has(truth.phase)) {
    return { pose: truth.phase === "comparing" ? "split" : truth.phase === "retrieving" ? "gather" : "focus", energy, accent: "information", emotion: "thinking", tone: "flow", performance: null };
  }
  return { pose: truth.phase === "aware" ? "focus" : "rest", energy, accent: "brand", emotion: truth.phase === "aware" ? "attentive" : "idle", tone: signalTone, performance: null };
};

export const paceTruthStateLabel = (phase: PaceExperienceState) => {
  if (phase === "planning") return "vraag wordt verwerkt";
  if (phase === "degraded") return "antwoord duurt langer";
  if (phase === "awaiting_confirmation") return "keuze nodig";
  if (phase === "guiding") return "oplossing beschikbaar";
  if (phase === "ready") return "antwoord klaar";
  if (phase === "blocked") return "actie geblokkeerd";
  if (phase === "offline") return "offline";
  if (phase === "aware") return "beschikbaar";
  return "ruststand";
};
