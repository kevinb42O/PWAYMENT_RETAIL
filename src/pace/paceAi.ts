import { supabase } from "../lib/supabase";
import type { PaceContext, PaceQueryAnswer } from "./paceSignals";

export interface PaceAiAnswer {
  answer: string;
  model: string;
  source: "gemini" | "openai";
}

export class PaceAiUnavailableError extends Error {}

export interface PaceConversationTurn {
  role: "user" | "assistant";
  text: string;
}

let aiUnavailableUntil = 0;

export const toPaceAiContext = (context: PaceContext) => ({
  storeId: context.storeId,
  view: context.view,
  role: context.role,
  productCount: context.productCount,
  cartCount: context.cartCount,
  firstRunCompleted: context.firstRunCompleted,
  online: context.online,
  pendingSync: context.pendingSync,
  retryingSync: context.retryingSync,
  failedSync: context.failedSync,
  syncIssueSummary: context.syncIssueSummary,
  syncIssueResolution: context.syncIssueResolution,
  cartSummary: context.cartSummary ? {
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
): Promise<PaceAiAnswer> => {
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
  const safeContext = toPaceAiContext(context);

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

  const result = await response.json().catch(() => null) as Partial<PaceAiAnswer> & { error?: string } | null;
  if (!response.ok || (result?.source !== "gemini" && result?.source !== "openai") || typeof result.answer !== "string") {
    aiUnavailableUntil = Date.now() + (response.status === 429 || result?.error === "PACE_AI_QUOTA_EXHAUSTED" ? 60_000 : 15_000);
    throw new PaceAiUnavailableError(result?.error ?? "Pace AI is tijdelijk niet beschikbaar.");
  }
  aiUnavailableUntil = 0;
  return {
    answer: result.answer,
    source: result.source,
    model: typeof result.model === "string" ? result.model : result.source === "gemini" ? "Gemini" : "OpenAI",
  };
};
