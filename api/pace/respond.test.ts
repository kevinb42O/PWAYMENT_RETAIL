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
    delete process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_PACE_MODEL;
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
    delete process.env.GEMINI_API_KEY;
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

  it("prefers Gemini, keeps the key in a server header, and returns Gemini text", async () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    process.env.GEMINI_PACE_MODEL = "gemini-2.5-flash-lite";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ id: "user-gemini-test" }))
      .mockResolvedValueOnce(Response.json({
        candidates: [{ content: { parts: [{ text: "Open de productcatalogus via Instellingen." }] } }],
        usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 10 },
      }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await handler.fetch(request({
      question: "Waar beheer ik mijn artikelen?",
      context: { view: "profile", role: "owner", productCount: 12, online: true },
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      answer: "Open de productcatalogus via Instellingen.",
      source: "gemini",
      model: "gemini-2.5-flash-lite",
    });
    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toContain("generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("test-gemini-key");
    expect(String(init.body)).not.toContain("test-gemini-key");
  });

  it("returns an explicit local fallback when the Gemini free-tier quota is exhausted", async () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    const quotaResponse = () => Response.json({
      error: { code: 429, status: "RESOURCE_EXHAUSTED", message: "Quota exceeded" },
    }, { status: 429 });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ id: "user-gemini-quota" }))
      .mockResolvedValueOnce(quotaResponse())
      .mockResolvedValueOnce(quotaResponse())
      .mockResolvedValueOnce(quotaResponse());
    vi.stubGlobal("fetch", fetchMock);

    const response = await handler.fetch(request({ question: "Vrije vraag", context: {} }));
    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({
      error: "PACE_AI_QUOTA_EXHAUSTED",
      fallback: "local",
      provider: "gemini",
    });
  });

  it("switches to an available Flash model when the preferred model is overloaded", async () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    process.env.GEMINI_PACE_MODEL = "gemini-flash-latest";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ id: "user-gemini-retry" }))
      .mockResolvedValueOnce(Response.json({
        error: { code: 503, status: "UNAVAILABLE", message: "High demand" },
      }, { status: 503 }))
      .mockResolvedValueOnce(Response.json({
        candidates: [{ content: { parts: [{ text: "Hallo! Waarmee kan ik helpen?" }] } }],
      }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await handler.fetch(request({ question: "hi", context: { view: "pos" } }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      answer: "Hallo! Waarmee kan ik helpen?",
      source: "gemini",
      model: "gemini-3.5-flash-lite",
    });
    expect(String(fetchMock.mock.calls[1][0])).toContain("gemini-flash-latest");
    expect(String(fetchMock.mock.calls[2][0])).toContain("gemini-3.5-flash-lite");
  });

  it("loads tenant context with the caller session and grounds Gemini in product knowledge", async () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    const storeId = "11111111-1111-4111-8111-111111111111";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ id: "user-tenant-context" }))
      .mockResolvedValueOnce(Response.json({
        version: 1,
        store: { id: storeId, name: "Testwinkel", role: "owner" },
        catalog: { activeProducts: 42, lowStockProducts: 3 },
        sales: { today: { transactionCount: 7, netTotalCents: 12345 } },
      }))
      .mockResolvedValueOnce(Response.json({
        candidates: [{ content: { parts: [{ text: "Vandaag zijn 7 verkopen gesynchroniseerd." }] } }],
      }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await handler.fetch(request({
      question: "Hoeveel verkopen heb ik vandaag en wat betekent lage voorraad?",
      context: { storeId, view: "insights", role: "owner", online: true },
      history: [{ role: "user", text: "Vertel me over vandaag" }, { role: "assistant", text: "Welke metric bedoel je?" }],
      localCandidate: { intentId: "insights.explain", title: "Inzichten", answer: "Controleer de actieve periode." },
    }));

    expect(response.status).toBe(200);
    const [rpcUrl, rpcInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(rpcUrl).toContain("/rest/v1/rpc/get_pace_ai_context");
    expect((rpcInit.headers as Record<string, string>).Authorization).toBe("Bearer valid-token");
    expect(JSON.parse(String(rpcInit.body))).toEqual({ target_store_id: storeId, user_query: "Hoeveel verkopen heb ik vandaag en wat betekent lage voorraad?" });

    const geminiInit = fetchMock.mock.calls[2][1] as RequestInit;
    const geminiBody = JSON.parse(String(geminiInit.body)) as { contents: Array<{ role: string; parts: Array<{ text: string }> }> };
    const prompt = geminiBody.contents.at(-1)?.parts[0]?.text ?? "";
    expect(prompt).toContain("PWAYMENT-productkennis");
    expect(prompt).toContain("Testwinkel");
    expect(prompt).toContain('"transactionCount":7');
    expect(prompt).toContain("insights.explain");
    expect(geminiBody.contents.slice(0, 2).map((item) => item.role)).toEqual(["user", "model"]);
  });

  it("retries a transient PostgREST schema-cache 404 before calling Gemini", async () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    const storeId = "22222222-2222-4222-8222-222222222222";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ id: "user-schema-retry" }))
      .mockResolvedValueOnce(Response.json({ code: "PGRST202" }, { status: 404 }))
      .mockResolvedValueOnce(Response.json({
        store: { id: storeId, name: "Herstelde winkelcontext", role: "owner" },
      }))
      .mockResolvedValueOnce(Response.json({
        candidates: [{ content: { parts: [{ text: "Je winkelcontext is geladen." }] } }],
      }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await handler.fetch(request({
      question: "Wat weet je over mijn winkel?",
      context: { storeId, view: "profile", role: "owner" },
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ answer: "Je winkelcontext is geladen." });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[1][0]).toBe(fetchMock.mock.calls[2][0]);
    const geminiBody = JSON.parse(String((fetchMock.mock.calls[3][1] as RequestInit).body));
    expect(JSON.stringify(geminiBody)).toContain("Herstelde winkelcontext");
  });

  it("never exposes an internal tenant-context reason to Gemini", async () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    const storeId = "33333333-3333-4333-8333-333333333333";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ id: "user-context-unavailable" }))
      .mockResolvedValueOnce(Response.json({ code: "PGRST202" }, { status: 404 }))
      .mockResolvedValueOnce(Response.json({ code: "PGRST202" }, { status: 404 }))
      .mockResolvedValueOnce(Response.json({
        candidates: [{ content: { parts: [{ text: "Ik kan nu alleen productuitleg geven." }] } }],
      }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await handler.fetch(request({
      question: "Hoeveel klanten heb ik?",
      context: { storeId, view: "customers", role: "owner" },
    }));

    expect(response.status).toBe(200);
    const geminiBody = JSON.parse(String((fetchMock.mock.calls[3][1] as RequestInit).body)) as {
      contents: Array<{ parts: Array<{ text: string }> }>;
    };
    const prompt = geminiBody.contents.at(-1)?.parts[0]?.text ?? "";
    expect(prompt).toContain('"unavailable":true');
    expect(prompt).not.toContain("PGRST202");
    expect(prompt).not.toContain("tenant-context-temporarily-unavailable");
    expect(prompt).not.toContain("context-rpc");
  });
});
