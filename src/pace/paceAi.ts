import { supabase } from "../lib/supabase";
import type { PaceContext } from "./paceSignals";

export interface PaceAiAnswer {
  answer: string;
  model: string;
  source: "openai";
}

export class PaceAiUnavailableError extends Error {}

export const toPaceAiContext = (context: PaceContext) => ({
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
});

export const askPaceAi = async (
  question: string,
  context: PaceContext,
): Promise<PaceAiAnswer> => {
  if (import.meta.env.VITE_ENABLE_PACE_AI !== "true") {
    throw new PaceAiUnavailableError("Pace AI is niet ingeschakeld.");
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
      body: JSON.stringify({ question, context: safeContext }),
      signal: AbortSignal.timeout(22_000),
    });
  } catch {
    throw new PaceAiUnavailableError("Pace AI is tijdelijk niet bereikbaar.");
  }

  const result = await response.json().catch(() => null) as Partial<PaceAiAnswer> & { error?: string } | null;
  if (!response.ok || result?.source !== "openai" || typeof result.answer !== "string") {
    throw new PaceAiUnavailableError(result?.error ?? "Pace AI is tijdelijk niet beschikbaar.");
  }
  return {
    answer: result.answer,
    source: "openai",
    model: typeof result.model === "string" ? result.model : "OpenAI",
  };
};
