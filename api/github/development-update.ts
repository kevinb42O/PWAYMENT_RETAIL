import { createHmac, timingSafeEqual } from "node:crypto";

type GitHubPushPayload = {
  after?: string;
  before?: string;
  commits?: Array<{
    author?: { email?: string; name?: string; username?: string };
    id?: string;
    message?: string;
    timestamp?: string;
    url?: string;
  }>;
  compare?: string;
  deleted?: boolean;
  head_commit?: { message?: string; timestamp?: string } | null;
  pusher?: { email?: string; name?: string };
  push_id?: number | string;
  ref?: string;
  repository?: { full_name?: string };
};

const response = (status: number, body: Record<string, unknown>) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

const verifiedSignature = (body: string, signature: string | null, secret: string) => {
  if (!signature?.startsWith("sha256=")) return false;
  const expected = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
  const suppliedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  return suppliedBuffer.length === expectedBuffer.length && timingSafeEqual(suppliedBuffer, expectedBuffer);
};

const value = (input: unknown) => typeof input === "string" ? input : undefined;

const payloadForRecord = (payload: GitHubPushPayload) => {
  const ref = value(payload.ref);
  const afterSha = value(payload.after);
  const pushId = payload.push_id === undefined || payload.push_id === null ? undefined : String(payload.push_id);
  const repository = value(payload.repository?.full_name);
  if (!ref?.startsWith("refs/") || !afterSha || !pushId || !repository) return null;

  const branchName = ref.startsWith("refs/heads/")
    ? ref.slice("refs/heads/".length)
    : ref.startsWith("refs/tags/") ? `tag/${ref.slice("refs/tags/".length)}` : ref;
  const commits = Array.isArray(payload.commits) ? payload.commits.map((commit) => ({
    sha: value(commit.id),
    message: value(commit.message),
    timestamp: value(commit.timestamp),
    url: value(commit.url),
    author: {
      name: value(commit.author?.name),
      email: value(commit.author?.email),
      username: value(commit.author?.username),
    },
  })) : [];

  return {
    github_push_id: pushId,
    repository_full_name: repository,
    branch_name: branchName,
    before_sha: value(payload.before),
    after_sha: afterSha,
    compare_url: value(payload.compare),
    pusher_name: value(payload.pusher?.name),
    pusher_email: value(payload.pusher?.email),
    headline: value(payload.head_commit?.message) ?? `Push to ${branchName}`,
    pushed_at: value(payload.head_commit?.timestamp) ?? new Date().toISOString(),
    commits,
  };
};

export default {
  async fetch(request: Request) {
    if (request.method !== "POST") return response(405, { error: "METHOD_NOT_ALLOWED" });

    const webhookSecret = process.env.GITHUB_DEVELOPMENT_LOG_WEBHOOK_SECRET;
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!webhookSecret || !supabaseUrl || !serviceRoleKey) return response(503, { error: "DEVELOPMENT_LOG_NOT_CONFIGURED" });

    const rawBody = await request.text();
    if (rawBody.length > 524_288) return response(413, { error: "PAYLOAD_TOO_LARGE" });
    if (!verifiedSignature(rawBody, request.headers.get("x-hub-signature-256"), webhookSecret)) {
      return response(401, { error: "INVALID_SIGNATURE" });
    }

    const event = request.headers.get("x-github-event");
    if (event === "ping") return response(200, { ok: true });
    if (event !== "push") return response(202, { ignored: event ?? "unknown" });

    let eventPayload: GitHubPushPayload;
    try { eventPayload = JSON.parse(rawBody) as GitHubPushPayload; }
    catch { return response(400, { error: "INVALID_JSON" }); }
    if (eventPayload.deleted) return response(202, { ignored: "deleted_ref" });

    const record = payloadForRecord(eventPayload);
    if (!record) return response(400, { error: "INVALID_PUSH_PAYLOAD" });

    const upstream = await fetch(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/ingest_github_development_update`, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ payload: record }),
    });
    if (!upstream.ok) {
      console.error("Development log delivery failed", { status: upstream.status });
      return response(502, { error: "DEVELOPMENT_LOG_WRITE_FAILED" });
    }
    return response(202, { accepted: true, github_push_id: record.github_push_id });
  },
};
