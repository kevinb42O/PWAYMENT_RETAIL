import { supabase } from "../lib/supabase";
import type { PaceContext, PaceQueryAnswer } from "./paceSignals";
import type { PaceQuotaSnapshot } from "./usePaceBilling";

export interface PaceAiAnswer {
  answer: string;
  model: string;
  source: "gemini" | "openai" | "analytics";
  quota?: PaceQuotaSnapshot;
}

export class PaceAiUnavailableError extends Error {}
export class PaceQuotaExceededError extends PaceAiUnavailableError {
  constructor(public readonly quota: Partial<PaceQuotaSnapshot>) {
    super("Je PACE-vragenbundel is opgebruikt.");
  }
}

export interface PaceConversationTurn {
  role: "user" | "assistant";
  text: string;
}

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
  storeId: includeLiveStoreContext ? context.storeId : undefined,
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
  options: { enabled?: boolean; includeLiveStoreContext?: boolean } = {},
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
  const safeContext = toPaceAiContext(context, options.includeLiveStoreContext !== false);

  let response: Response;
  try {
    response = await fetch("/api/pace/respond", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        question,
        context: safeContext,
        history: history.slice(-6).map((turn) => ({ role: turn.role, text: turn.text.slice(0, 800) })),
        localCandidate: localCandidate ? {
          intentId: localCandidate.intentId,
          title: localCandidate.title,
          answer: localCandidate.answer,
          steps: localCandidate.steps,
          limitation: localCandidate.limitation,
        } : undefined,
      }),
      signal: AbortSignal.timeout(22_000),
    });
  } catch {
    aiUnavailableUntil = Date.now() + 15_000;
    throw new PaceAiUnavailableError("Pace AI is tijdelijk niet bereikbaar.");
  }

  const result = await response.json().catch(() => null) as Partial<PaceAiAnswer> & { error?: string; remaining_credits?: number; reset_in_seconds?: number; reset_at?: string; tier?: PaceQuotaSnapshot["tier"] } | null;
  if (response.status === 429 && result?.error === "QUOTA_EXCEEDED") {
    throw new PaceQuotaExceededError({ tier: result.tier, remaining: 0, remaining_credits: result.remaining_credits ?? 0, reset_in_seconds: result.reset_in_seconds, reset_at: result.reset_at });
  }
  if (!response.ok || (result?.source !== "gemini" && result?.source !== "openai" && result?.source !== "analytics") || typeof result.answer !== "string") {
    aiUnavailableUntil = Date.now() + (response.status === 429 || result?.error === "PACE_AI_QUOTA_EXHAUSTED" ? 60_000 : 15_000);
    throw new PaceAiUnavailableError(result?.error ?? "Pace AI is tijdelijk niet beschikbaar.");
  }
  aiUnavailableUntil = 0;
  return {
    answer: normalizePaceAiAnswer(result.answer),
    source: result.source,
    model: typeof result.model === "string" ? result.model : result.source === "gemini" ? "Gemini" : result.source === "analytics" ? "PWAYMENT Analytics" : "OpenAI",
    quota: result.quota,
  };
};
