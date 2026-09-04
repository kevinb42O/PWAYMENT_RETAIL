import { supabase } from "../lib/supabase";
import type { PaceContext, PaceQueryAnswer } from "./paceSignals";
import type { PaceQuotaSnapshot } from "./usePaceBilling";
import type { PaceCitation, PaceConversationResponse, PaceResolvedEntity } from "./conversation/types";
import { PACE_PROGRESS_CONTENT_TYPE, parsePaceStreamEvent, type PacePublicProgressEvent } from "./paceProgress";

export interface PaceAiAnswer {
  answer: string;
  model: string;
  source: "gemini" | "openai" | "analytics" | "records" | "local";
  quota?: PaceQuotaSnapshot;
  conversation?: PaceConversationResponse["conversation"];
  citations?: PaceCitation[];
  entities?: PaceResolvedEntity[];
  clarification?: PaceConversationResponse["clarification"];
}

export class PaceAiUnavailableError extends Error {}
// Pace can gather several tenant-safe sources before the model composes its
// answer. This remains bounded server-side, but must outlive that work and the
// final streamed event; 22 seconds cut off healthy requests mid-stream.
export const PACE_AI_REQUEST_TIMEOUT_MS = 40_000;
export class PaceQuotaExceededError extends PaceAiUnavailableError {
  constructor(public readonly quota: Partial<PaceQuotaSnapshot>) {
    super("Je PACE-vragenbundel is opgebruikt.");
  }
}

export interface PaceConversationTurn {
  role: "user" | "assistant";
  text: string;
}

type PaceApiPayload = Partial<PaceConversationResponse & PaceAiAnswer> & {
  error?: string;
  remaining_credits?: number;
  reset_in_seconds?: number;
  reset_at?: string;
  tier?: PaceQuotaSnapshot["tier"];
};

export const readPaceApiResponse = async (
  response: Response,
  onProgress?: (event: PacePublicProgressEvent) => void,
): Promise<{ status: number; result: PaceApiPayload | null }> => {
  if (!response.headers.get("content-type")?.includes(PACE_PROGRESS_CONTENT_TYPE) || !response.body) {
    return { status: response.status, result: await response.json().catch(() => null) as PaceApiPayload | null };
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let final: { status: number; payload: Record<string, unknown> } | null = null;
  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split("\n");
    buffer = done ? "" : lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const event = parsePaceStreamEvent(line);
      if (!event) continue;
      if (event.type === "progress") onProgress?.(event);
      else final = { status: event.status, payload: event.payload };
    }
    if (done) break;
  }
  if (!final) return { status: 502, result: { error: "PACE_STREAM_INCOMPLETE" } };
  return { status: final.status, result: final.payload as PaceApiPayload };
};

let aiUnavailableUntil = 0;

export const normalizePaceAiAnswer = (answer: string) => answer
  .replace(/\r\n?/g, "\n")
  .replace(/\*\*(.*?)\*\*/g, "$1")
  .replace(/`([^`]+)`/g, "$1")
  .replace(/[^\S\n]+/g, " ")
  .replace(/ +\n/g, "\n")
  .replace(/\n{3,}/g, "\n\n")
  .trim();

export const toPaceAiContext = (context: PaceContext, includeLiveStoreContext = true) => ({
  // The store id is still required for tenant authorization and quota when the
  // user opts out of sending live store facts to the model.
  storeId: context.storeId,
  liveStoreContext: includeLiveStoreContext,
  view: context.view,
  role: context.role,
  productCount: includeLiveStoreContext ? context.productCount : undefined,
  cartCount: includeLiveStoreContext ? context.cartCount : undefined,
  firstRunCompleted: includeLiveStoreContext ? context.firstRunCompleted : undefined,
  online: includeLiveStoreContext ? context.online : undefined,
  pendingSync: includeLiveStoreContext ? context.pendingSync : undefined,
  retryingSync: includeLiveStoreContext ? context.retryingSync : undefined,
  failedSync: includeLiveStoreContext ? context.failedSync : undefined,
  syncIssueSummary: includeLiveStoreContext ? context.syncIssueSummary : undefined,
  syncIssueResolution: includeLiveStoreContext ? context.syncIssueResolution : undefined,
  cartSummary: includeLiveStoreContext && context.cartSummary ? {
    items: context.cartSummary.items.slice(0, 25).map((item) => ({
      name: item.name.slice(0, 120),
      quantity: Math.max(0, Math.floor(item.quantity)),
      unitPriceCents: Math.max(0, Math.floor(item.unitPriceCents)),
      sku: item.sku?.slice(0, 80),
      variant: item.variant?.slice(0, 120),
    })),
    customerLinked: context.cartSummary.customerLinked,
    customerName: context.cartSummary.customerName?.slice(0, 160),
    discountCents: context.cartSummary.discountCents,
    documentType: context.cartSummary.documentType,
  } : undefined,
});

export const askPaceAi = async (
  question: string,
  context: PaceContext,
  history: PaceConversationTurn[] = [],
  localCandidate?: PaceQueryAnswer,
  options: {
    enabled?: boolean;
    includeLiveStoreContext?: boolean;
    conversation?: { id?: string; revision?: number; clientTurnId?: string };
    onProgress?: (event: PacePublicProgressEvent) => void;
  } = {},
): Promise<PaceAiAnswer> => {
  if (options.enabled === false) {
    throw new PaceAiUnavailableError("AI-antwoorden staan uit in je Pace-instellingen.");
  }
  if (import.meta.env.VITE_ENABLE_PACE_AI === "false") {
    throw new PaceAiUnavailableError("Pace AI is niet ingeschakeld.");
  }
  if (Date.now() < aiUnavailableUntil) {
    throw new PaceAiUnavailableError("Pace AI zit tijdelijk in lokale fallbackmodus.");
  }
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new PaceAiUnavailableError("Pace AI vereist een actieve sessie.");

  // Customer insight records are deliberately local-only. Keep this allow-list
  // on the client as well as on the API boundary so PII never leaves the till.
  const includeLiveStoreContext = options.includeLiveStoreContext !== false;
  const safeContext = toPaceAiContext(context, includeLiveStoreContext);

  let response: Response;
  try {
    response = await fetch("/api/pace/respond", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(options.onProgress ? { Accept: PACE_PROGRESS_CONTENT_TYPE, "X-Pace-Progress-Version": "1" } : {}),
      },
      body: JSON.stringify({
        ...(options.conversation ? {
          version: 2,
          conversationId: options.conversation.id,
          expectedRevision: options.conversation.revision,
          clientTurnId: options.conversation.clientTurnId ?? crypto.randomUUID(),
        } : {}),
        question,
        context: safeContext,
        // Earlier turns and deterministic local answers may themselves contain
        // store facts. Do not replay them after the user disables live context.
        history: options.conversation ? undefined : includeLiveStoreContext ? history.slice(-6).map((turn) => ({ role: turn.role, text: turn.text.slice(0, 800) })) : [],
        localCandidate: includeLiveStoreContext && localCandidate ? {
          intentId: localCandidate.intentId,
          title: localCandidate.title,
          answer: localCandidate.answer,
          steps: localCandidate.steps,
          limitation: localCandidate.limitation,
        } : undefined,
      }),
      signal: AbortSignal.timeout(PACE_AI_REQUEST_TIMEOUT_MS),
    });
  } catch {
    aiUnavailableUntil = Date.now() + 15_000;
    throw new PaceAiUnavailableError("Pace AI is tijdelijk niet bereikbaar.");
  }

  const { status, result } = await readPaceApiResponse(response, options.onProgress);
  if (status === 429 && result?.error === "QUOTA_EXCEEDED") {
    throw new PaceQuotaExceededError({ tier: result.tier, remaining: 0, remaining_credits: result.remaining_credits ?? 0, reset_in_seconds: result.reset_in_seconds, reset_at: result.reset_at });
  }
  if (status < 200 || status >= 300 || (result?.source !== "gemini" && result?.source !== "openai" && result?.source !== "analytics" && result?.source !== "records" && result?.source !== "local") || typeof result.answer !== "string") {
    aiUnavailableUntil = Date.now() + (status === 429 || result?.error === "PACE_AI_QUOTA_EXHAUSTED" ? 60_000 : 15_000);
    throw new PaceAiUnavailableError(result?.error ?? "Pace AI is tijdelijk niet beschikbaar.");
  }
  aiUnavailableUntil = 0;
  return {
    answer: normalizePaceAiAnswer(result.answer),
    source: result.source,
    model: typeof result.model === "string" ? result.model : result.source === "gemini" ? "Gemini" : result.source === "analytics" ? "PWAYMENT Analytics" : "OpenAI",
    quota: result.quota,
    conversation: result.conversation,
    citations: result.citations ?? [],
    entities: result.entities ?? [],
    clarification: result.clarification,
  };
};
