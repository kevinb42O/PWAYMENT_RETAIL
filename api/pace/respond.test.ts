import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import handler from "./respond";

const originalEnv = { ...process.env };

const request = (body: unknown, token = "valid-token") => new Request("https://pwayment.test/api/pace/respond", {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

describe("Pace OpenAI endpoint", () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-openai-key";
    process.env.OPENAI_PACE_MODEL = "gpt-5-nano";
    process.env.SUPABASE_URL = "https://supabase.test";
    process.env.SUPABASE_PUBLISHABLE_KEY = "test-publishable-key";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
  });

  it("falls back locally when server secrets are missing", async () => {
    delete process.env.OPENAI_API_KEY;
    const response = await handler.fetch(request({ question: "Help", context: {} }));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: "PACE_AI_NOT_CONFIGURED", fallback: "local" });
  });

  it("requires a valid Supabase user before spending model tokens", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 401 })));
    const response = await handler.fetch(request({ question: "Help", context: {} }));
    expect(response.status).toBe(401);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("sends only bounded operational context and returns OpenAI text", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ id: "user-pace-test" }))
      .mockResolvedValueOnce(Response.json({
        id: "resp_123",
        output: [{ type: "message", content: [{ type: "output_text", text: "Open de catalogus via Instellingen." }] }],
        usage: { input_tokens: 40, output_tokens: 9 },
      }, { headers: { "x-request-id": "req_123" } }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await handler.fetch(request({
      question: "Waar voeg ik een product toe?",
      context: {
        view: "pos",
        role: "owner",
        productCount: -4,
        cartCount: 2,
        firstRunCompleted: false,
        online: true,
        pendingSync: 0,
        forbiddenCustomerData: "must-not-pass",
      },
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      answer: "Open de catalogus via Instellingen.",
      source: "openai",
      model: "gpt-5-nano",
    });
    const openAiInit = fetchMock.mock.calls[1][1] as RequestInit;
    const upstreamBody = JSON.parse(String(openAiInit.body)) as Record<string, unknown>;
    expect(upstreamBody.store).toBe(false);
    expect(String(upstreamBody.input)).not.toContain("must-not-pass");
    expect(String(upstreamBody.input)).toContain('"productCount":0');
  });
});
