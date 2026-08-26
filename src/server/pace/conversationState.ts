import type { PaceConversationDetail, PaceConversationSummary } from "../../pace/conversation/types.js";

export interface PaceRpcConfig {
  authorization: string;
  supabaseUrl: string;
  publishableKey: string;
}

export class PaceConversationError extends Error {
  constructor(public readonly code: "forbidden" | "conflict" | "in_progress" | "closed" | "unavailable", message: string) {
    super(message);
  }
}

const rpc = async <T>(config: PaceRpcConfig, name: string, body: Record<string, unknown>): Promise<T> => {
  const response = await fetch(`${config.supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: config.publishableKey, Authorization: config.authorization, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8_000),
  });
  if (response.ok) return await response.json() as T;
  const payload = await response.json().catch(() => ({})) as { message?: string; code?: string };
  const detail = `${payload.message ?? ""} ${payload.code ?? ""}`;
  if (response.status === 401 || response.status === 403 || /forbidden/i.test(detail)) throw new PaceConversationError("forbidden", "Geen toegang tot dit gesprek.");
  if (/revision-conflict|40001/i.test(detail)) throw new PaceConversationError("conflict", "Het gesprek is intussen gewijzigd.");
  if (/turn-in-progress|55P03/i.test(detail)) throw new PaceConversationError("in_progress", "PACE verwerkt al een beurt.");
  if (/closed|55000/i.test(detail)) throw new PaceConversationError("closed", "Dit gesprek is gesloten.");
  throw new PaceConversationError("unavailable", `Conversation RPC ${name} failed (${response.status})`);
};

export const startConversation = (config: PaceRpcConfig, storeId: string, view: string) =>
  rpc<PaceConversationSummary>(config, "start_pace_conversation", { target_store_id: storeId, initial_view: view });

export const listConversations = (config: PaceRpcConfig, storeId: string) =>
  rpc<PaceConversationSummary[]>(config, "list_pace_conversations", { target_store_id: storeId, page_size: 20 });

export const getConversation = (config: PaceRpcConfig, conversationId: string, afterSequence = 0) =>
  rpc<PaceConversationDetail>(config, "get_pace_conversation", { target_conversation_id: conversationId, after_sequence: afterSequence });

export interface BegunTurn {
  created: boolean;
  turnId: string;
  sequence: number;
  status: "processing" | "completed" | "failed" | "clarification";
  answer?: string | null;
  revision: number;
  state: Record<string, unknown>;
  summary: string;
  quota?: {
    allowed: boolean;
    reason?: string;
    tier?: "basic" | "pro" | "enterprise";
    source?: "subscription" | "rollover" | "credit";
    log_id?: string;
    remaining?: number;
    remaining_credits?: number;
    credit_balance?: number;
    quota?: number;
    daily_count?: number;
    monthly_count?: number;
    rollover_balance?: number;
    reset_at?: string;
    reset_in_seconds?: number;
  };
}

export const beginTurn = (
  config: PaceRpcConfig,
  values: { conversationId: string; clientTurnId: string; revision: number; question: string; view: string; plan?: Record<string, unknown> },
) => rpc<BegunTurn>(config, "begin_pace_turn", {
  target_conversation_id: values.conversationId,
  target_client_turn_id: values.clientTurnId,
  expected_revision: values.revision,
  question: values.question,
  current_view: values.view,
  target_plan: values.plan ?? {},
});

export interface CompleteTurnInput {
  turnId: string;
  revision: number;
  answer: string;
  status?: "completed" | "clarification";
  state: Record<string, unknown>;
  summary: string;
  title: string;
  plan: Record<string, unknown>;
  entities?: unknown[];
  mentions?: unknown[];
  evidence?: unknown[];
  modelMetadata?: Record<string, unknown>;
}

export const completeTurn = (config: PaceRpcConfig, values: CompleteTurnInput) => rpc<{
  turnId: string; sequence: number; status: string; answer: string; revision: number; title: string;
  entities: unknown[]; citations: unknown[];
}>(config, "complete_pace_turn", {
  target_turn_id: values.turnId,
  expected_revision: values.revision,
  final_answer: values.answer,
  final_status: values.status ?? "completed",
  state_patch: values.state,
  final_summary: values.summary,
  final_title: values.title,
  final_plan: values.plan,
  entity_items: values.entities ?? [],
  mention_items: values.mentions ?? [],
  evidence_items: values.evidence ?? [],
  final_model_metadata: values.modelMetadata ?? {},
});

export const failTurn = async (config: PaceRpcConfig, turnId: string, code: string) => {
  try { await rpc<null>(config, "fail_pace_turn", { target_turn_id: turnId, failure_code: code }); } catch { /* best effort */ }
};

export const closeConversation = (config: PaceRpcConfig, conversationId: string) =>
  rpc<null>(config, "close_pace_conversation", { target_conversation_id: conversationId });

export const deleteConversation = (config: PaceRpcConfig, conversationId: string) =>
  rpc<null>(config, "delete_pace_conversation", { target_conversation_id: conversationId });
