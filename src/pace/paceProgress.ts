import type { PaceExperienceState, PaceInteraction, PaceSeverity } from "./paceExperience";

export const PACE_PROGRESS_CONTENT_TYPE = "application/x-ndjson";

export type PacePublicProgressPhase = Extract<
  PaceExperienceState,
  "planning" | "resolving" | "retrieving" | "comparing" | "composing" | "verifying" | "awaiting_confirmation" | "degraded"
>;

export interface PacePublicProgressEvent {
  version: 1;
  type: "progress";
  sequence: number;
  phase: PacePublicProgressPhase;
  interaction?: PaceInteraction;
  severity?: PaceSeverity;
  progress?: { completed: number; total: number };
  sourceCount?: number;
}

export interface PacePublicAnswerEvent {
  version: 1;
  type: "answer";
  status: number;
  payload: Record<string, unknown>;
}

export interface PacePublicErrorEvent {
  version: 1;
  type: "error";
  status: number;
  payload: Record<string, unknown>;
}

export type PacePublicStreamEvent = PacePublicProgressEvent | PacePublicAnswerEvent | PacePublicErrorEvent;

const progressPhases = new Set<PacePublicProgressPhase>([
  "planning", "resolving", "retrieving", "comparing", "composing", "verifying", "awaiting_confirmation", "degraded",
]);

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);

export const parsePaceStreamEvent = (line: string): PacePublicStreamEvent | null => {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (!isRecord(value) || value.version !== 1 || typeof value.type !== "string") return null;
  if (value.type === "progress") {
    if (!Number.isInteger(value.sequence) || Number(value.sequence) < 1 || !progressPhases.has(value.phase as PacePublicProgressPhase)) return null;
    const progress = isRecord(value.progress)
      && Number.isFinite(value.progress.completed)
      && Number.isFinite(value.progress.total)
      ? { completed: Number(value.progress.completed), total: Number(value.progress.total) }
      : undefined;
    return {
      version: 1,
      type: "progress",
      sequence: Number(value.sequence),
      phase: value.phase as PacePublicProgressPhase,
      interaction: ["none", "cancel", "choose", "confirm", "retry", "undo"].includes(String(value.interaction))
        ? value.interaction as PaceInteraction : undefined,
      severity: ["neutral", "positive", "attention", "critical"].includes(String(value.severity))
        ? value.severity as PaceSeverity : undefined,
      progress,
      sourceCount: Number.isFinite(value.sourceCount) ? Math.max(0, Math.floor(Number(value.sourceCount))) : undefined,
    };
  }
  if ((value.type === "answer" || value.type === "error") && Number.isInteger(value.status) && isRecord(value.payload)) {
    return { version: 1, type: value.type, status: Number(value.status), payload: value.payload };
  }
  return null;
};

export const encodePaceStreamEvent = (event: PacePublicStreamEvent) => `${JSON.stringify(event)}\n`;
