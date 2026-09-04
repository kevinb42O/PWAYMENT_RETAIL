import { closeConversation, deleteConversation, getConversation, listConversations, PaceConversationError, startConversation, type PaceRpcConfig } from "./conversationState.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const json = (status: number, body: Record<string, unknown>) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

const authenticatedUser = async (authorization: string, config: Pick<PaceRpcConfig, "supabaseUrl" | "publishableKey">) => {
  const response = await fetch(`${config.supabaseUrl.replace(/\/$/, "")}/auth/v1/user`, {
    headers: { apikey: config.publishableKey, Authorization: authorization },
  });
  if (!response.ok) return null;
  const user = await response.json() as { id?: unknown };
  return typeof user.id === "string" ? user.id : null;
};

export const handlePaceConversations = {
  async fetch(request: Request) {
    if (!new Set(["GET", "POST", "PATCH", "DELETE"]).has(request.method)) return json(405, { error: "METHOD_NOT_ALLOWED" });
    const authorization = request.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) return json(401, { error: "AUTH_REQUIRED" });
    const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
    const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !publishableKey || !serviceRoleKey) return json(503, { error: "PACE_CONVERSATION_UNAVAILABLE" });
    const actorUserId = await authenticatedUser(authorization, { supabaseUrl, publishableKey });
    if (!actorUserId) return json(401, { error: "INVALID_SESSION" });
    const config: PaceRpcConfig = { supabaseUrl, publishableKey, serviceRoleKey, actorUserId };
    try {
      if (request.method === "GET") {
        const url = new URL(request.url);
        const conversationId = url.searchParams.get("conversationId");
        if (conversationId) {
          if (!UUID.test(conversationId)) return json(400, { error: "INVALID_CONVERSATION_ID" });
          return json(200, { conversation: await getConversation(config, conversationId) });
        }
        const storeId = url.searchParams.get("storeId");
        if (!storeId || !UUID.test(storeId)) return json(400, { error: "INVALID_STORE_ID" });
        return json(200, { conversations: await listConversations(config, storeId) });
      }
      const body = await request.json().catch(() => null) as { storeId?: unknown; view?: unknown; conversationId?: unknown } | null;
      if (request.method === "PATCH" || request.method === "DELETE") {
        if (!body || typeof body.conversationId !== "string" || !UUID.test(body.conversationId)) return json(400, { error: "INVALID_CONVERSATION_ID" });
        if (request.method === "PATCH") await closeConversation(config, body.conversationId);
        else await deleteConversation(config, body.conversationId);
        return json(200, { ok: true });
      }
      if (!body || typeof body.storeId !== "string" || !UUID.test(body.storeId)) return json(400, { error: "INVALID_STORE_ID" });
      const view = typeof body.view === "string" ? body.view : "pos";
      return json(201, { conversation: await startConversation(config, body.storeId, view) });
    } catch (error) {
      if (error instanceof PaceConversationError) {
        return json(error.code === "forbidden" ? 403 : 503, { error: error.code === "forbidden" ? "STORE_ACCESS_DENIED" : "PACE_CONVERSATION_UNAVAILABLE" });
      }
      return json(503, { error: "PACE_CONVERSATION_UNAVAILABLE" });
    }
  },
};
