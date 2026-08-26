import { supabase } from "../../lib/supabase";
import type { PaceConversationDetail, PaceConversationSummary } from "./types";

const token = async () => {
  const { data } = await supabase.auth.getSession();
  if (!data.session?.access_token) throw new Error("PACE_AUTH_REQUIRED");
  return data.session.access_token;
};

export const listPaceConversations = async (storeId: string): Promise<PaceConversationSummary[]> => {
  const response = await fetch(`/api/pace/conversations?storeId=${encodeURIComponent(storeId)}`, {
    headers: { Authorization: `Bearer ${await token()}` },
    signal: AbortSignal.timeout(10_000),
  });
  const result = await response.json().catch(() => null) as { conversations?: PaceConversationSummary[] } | null;
  if (!response.ok || !Array.isArray(result?.conversations)) throw new Error("PACE_CONVERSATIONS_UNAVAILABLE");
  return result.conversations;
};

export const getPaceConversation = async (conversationId: string): Promise<PaceConversationDetail> => {
  const response = await fetch(`/api/pace/conversations?conversationId=${encodeURIComponent(conversationId)}`, {
    headers: { Authorization: `Bearer ${await token()}` },
    signal: AbortSignal.timeout(10_000),
  });
  const result = await response.json().catch(() => null) as { conversation?: PaceConversationDetail } | null;
  if (!response.ok || !result?.conversation) throw new Error("PACE_CONVERSATION_UNAVAILABLE");
  return result.conversation;
};

const mutateConversation = async (conversationId: string, method: "PATCH" | "DELETE") => {
  const response = await fetch("/api/pace/conversations", {
    method,
    headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ conversationId }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error("PACE_CONVERSATION_MUTATION_FAILED");
};

export const closePaceConversation = (conversationId: string) => mutateConversation(conversationId, "PATCH");
export const deletePaceConversation = (conversationId: string) => mutateConversation(conversationId, "DELETE");
