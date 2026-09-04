import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import handler from "../../../api/pace/respond";
import { parsePaceStreamEvent } from "../../pace/paceProgress";

const originalEnv = { ...process.env };

const request = (body: unknown, token = "valid-token", stream = false) => new Request("https://pwayment.test/api/pace/respond", {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(stream ? { Accept: "application/x-ndjson" } : {}) },
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
    // Conversation state now runs through the server-only RPC broker. Keep a
    // non-secret fixture value here so endpoint tests exercise the request
    // flow rather than failing at configuration validation.
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
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

  it("atomically rejects an exhausted tenant before any model call", async () => {
    process.env.PACE_QUOTA_ENFORCEMENT = "true";
    const storeId = "11111111-1111-4111-8111-111111111111";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ id: "user-quota-test" }))
      .mockResolvedValueOnce(Response.json({
        allowed: false,
        reason: "QUOTA_EXCEEDED",
        tier: "basic",
        quota: 5,
        remaining: 0,
        remaining_credits: 0,
        reset_at: "2026-08-27T00:00:00Z",
        reset_in_seconds: 43200,
      }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await handler.fetch(request({ question: "Help", context: { storeId } }));
    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({ error: "QUOTA_EXCEEDED", remaining_credits: 0, reset_in_seconds: 43200 });
    expect(response.headers.get("X-RateLimit-Remaining")).toBe("0");
    expect(response.headers.get("Retry-After")).toBe("43200");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toContain("check_and_consume_pace_credit");
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

  it("streams only public phases before the final answer payload", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ id: "user-stream-test" }))
      .mockResolvedValueOnce(Response.json({
        id: "resp_stream",
        output: [{ type: "message", content: [{ type: "output_text", text: "Het antwoord is klaar." }] }],
        usage: { input_tokens: 10, output_tokens: 5 },
      }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await handler.fetch(request({
      question: "Leg de lokale productkennis uit",
      context: { view: "pos", role: "owner", online: true, liveStoreContext: false },
    }, "stream-token", true));

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("application/x-ndjson");
    const events = (await response.text()).trim().split("\n").map(parsePaceStreamEvent);
    const phases = events.filter((event) => event?.type === "progress").map((event) => event?.type === "progress" ? event.phase : null);
    expect(phases).toEqual(["planning", "resolving", "composing", "verifying"]);
    expect(events.at(-1)).toMatchObject({
      type: "answer",
      status: 200,
      payload: { answer: "Het antwoord is klaar.", source: "openai" },
    });
    expect(JSON.stringify(events)).not.toContain("reasoning");
  });

  it("persists a v2 turn server-side and returns conversation metadata", async () => {
    const storeId = "11111111-1111-4111-8111-111111111111";
    const conversationId = "22222222-2222-4222-8222-222222222222";
    const turnId = "33333333-3333-4333-8333-333333333333";
    const clientTurnId = "44444444-4444-4444-8444-444444444444";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ id: "user-v2" }))
      .mockResolvedValueOnce(Response.json({ id: conversationId, storeId, title: "Nieuw onderzoek", status: "active", revision: 0, activeView: "pos", lastTurnAt: "2026-08-26T12:00:00Z", expiresAt: "2026-09-25T12:00:00Z" }))
      .mockResolvedValueOnce(Response.json({ id: conversationId, storeId, title: "Nieuw onderzoek", status: "active", revision: 0, activeView: "pos", state: { version: 1 }, summary: "", turns: [], entities: [], lastTurnAt: "2026-08-26T12:00:00Z", expiresAt: "2026-09-25T12:00:00Z" }))
      .mockResolvedValueOnce(Response.json({ created: true, turnId, sequence: 1, status: "processing", revision: 0, state: { version: 1 }, summary: "" }))
      .mockResolvedValueOnce(Response.json({ version: 1, generatedAt: "2026-08-26T12:01:00Z", basis: "active store configuration", productCount: 4 }))
      .mockResolvedValueOnce(Response.json({ id: "resp-v2", output: [{ type: "message", content: [{ type: "output_text", text: "Je winkelcontext is beschikbaar." }] }], usage: { input_tokens: 20, output_tokens: 6 } }))
      .mockResolvedValueOnce(Response.json({ turnId, sequence: 1, status: "completed", answer: "Je winkelcontext is beschikbaar.", revision: 1, title: "Wat kan PACE hier zien", entities: [], citations: [{ key: "E1" }] }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await handler.fetch(request({
      version: 2,
      clientTurnId,
      question: "Wat kan PACE hier zien?",
      context: { storeId, view: "pos", role: "owner", online: true },
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      version: 2,
      conversation: { id: conversationId, revision: 1, turnSequence: 1 },
      answer: "Je winkelcontext is beschikbaar.",
      citations: [expect.objectContaining({ key: "E1", label: "Winkelcontext" })],
    });
    const brokerCall = (index: number) => {
      const [url, init] = fetchMock.mock.calls[index] as [string, RequestInit];
      expect(url).toContain("/rest/v1/rpc/pace_server_rpc");
      expect(init.headers).toEqual(expect.objectContaining({
        apikey: "test-service-role-key",
        Authorization: "Bearer test-service-role-key",
      }));
      return JSON.parse(String(init.body)) as Record<string, unknown>;
    };
    expect(brokerCall(2)).toMatchObject({ operation: "get_pace_conversation", target_actor_user_id: "user-v2" });
    expect(brokerCall(3)).toMatchObject({ operation: "begin_pace_turn", target_actor_user_id: "user-v2" });
    const completion = brokerCall(6);
    expect(completion).toMatchObject({ operation: "complete_pace_turn", target_actor_user_id: "user-v2" });
    expect((completion.rpc_payload as Record<string, unknown>).evidence_items).toEqual([
      expect.objectContaining({ key: "E1", sourceName: "tenant.context" }),
    ]);
  });

  it("reports a recovered failed retry as failed instead of still processing", async () => {
    const storeId = "11111111-1111-4111-8111-111111111111";
    const conversationId = "22222222-2222-4222-8222-222222222222";
    const turnId = "33333333-3333-4333-8333-333333333333";
    const clientTurnId = "44444444-4444-4444-8444-444444444444";
    const detail = {
      id: conversationId,
      storeId,
      title: "Voorraadonderzoek",
      status: "active",
      revision: 2,
      activeView: "insights",
      state: { version: 1 },
      summary: "",
      turns: [],
      entities: [],
      lastTurnAt: "2026-08-27T12:00:00Z",
      expiresAt: "2026-09-26T12:00:00Z",
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ id: "user-stale-retry" }))
      .mockResolvedValueOnce(Response.json(detail))
      .mockResolvedValueOnce(Response.json({
        created: false,
        turnId,
        sequence: 3,
        status: "failed",
        revision: 2,
        state: { version: 1 },
        summary: "",
      }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await handler.fetch(request({
      version: 2,
      conversationId,
      clientTurnId,
      expectedRevision: 2,
      question: "Probeer dezelfde vraag opnieuw",
      context: { storeId, view: "insights", role: "owner" },
    }));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: "TURN_FAILED",
      fallback: "local",
      conversationId,
      turnId,
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
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

  it("answers an explicit low-stock threshold from the validated inventory query, never a top-stock ranking", async () => {
    const storeId = "99999999-9999-4999-8999-999999999999";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ id: "user-low-stock" }))
      .mockResolvedValueOnce(Response.json({
        version: 1,
        query: { version: 1, target: "products", stock: { comparison: "lt", quantity: 3 }, limit: 25 },
        rows: [
          { name: "Deck 8.5", sku: "DECK-85", variant: "Zwart", stockQty: 0, minStockQty: 2 },
          { name: "Truck 149", sku: "TRUCK-149", variant: null, stockQty: 2, minStockQty: 3 },
        ],
      }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await handler.fetch(request({
      question: "Welke producten hebben minder dan drie stuks op voorraad?",
      context: { storeId, view: "inventory", role: "owner" },
    }));

    expect(response.status).toBe(200);
    const payload = await response.json() as { answer?: string };
    expect(payload).toMatchObject({
      source: "analytics",
      model: "PWAYMENT Inventory",
      answer: expect.stringContaining("Deck 8.5"),
    });
    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toContain("/rest/v1/rpc/get_pace_inventory_query_context");
    expect(JSON.parse(String(init.body))).toEqual({
      target_store_id: storeId,
      query_spec: { version: 1, target: "products", stock: { comparison: "lt", quantity: 3 }, limit: 25 },
    });
    expect(payload.answer).not.toContain("37");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not let a model improvise an answer when a verified inventory query is unavailable", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ id: "user-inventory-unavailable" }))
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await handler.fetch(request({
      question: "Welke artikelen staan onder de minimumvoorraad?",
      context: { storeId: "99999999-9999-4999-8999-999999999999", view: "inventory", role: "owner" },
    }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: "INVENTORY_QUERY_UNAVAILABLE", fallback: "local" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("answers an owner briefing from the bounded first-party briefing source", async () => {
    const storeId = "99999999-9999-4999-8999-999999999999";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ id: "user-briefing" }))
      .mockResolvedValueOnce(Response.json({
        version: 1,
        items: [
          { title: "2 producten onder minimumvoorraad", detail: "Twee actieve producten zitten onder hun ingestelde minimum.", nextQuestion: "Welke artikelen staan onder de minimumvoorraad?" },
          { title: "1 webshoporder wacht op verwerking", detail: "Een betaalde webshoporder staat nog klaar voor verwerking.", nextQuestion: "Welke webshoporders staan open?" },
        ],
      }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await handler.fetch(request({
      question: "Wat vraagt vandaag aandacht?",
      context: { storeId, view: "insights", role: "owner" },
    }));

    expect(response.status).toBe(200);
    const payload = await response.json() as { answer?: string; source?: string; model?: string };
    expect(payload).toMatchObject({ source: "briefing", model: "PWAYMENT Briefing", answer: expect.stringContaining("2 producten onder minimumvoorraad") });
    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toContain("/rest/v1/rpc/get_pace_owner_briefing");
    expect(JSON.parse(String(init.body))).toEqual({ target_store_id: storeId });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not serially retry every planner alias after a transport timeout", async () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    process.env.PACE_GEMINI_PLANNER = "true";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ id: "user-planner-timeout" }))
      .mockRejectedValueOnce(new Error("planner transport timed out"))
      .mockResolvedValueOnce(Response.json({
        candidates: [{ content: { parts: [{ text: "Ik help je graag verder." }] } }],
      }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await handler.fetch(request({ question: "Waar beheer ik mijn artikelen?", context: { view: "profile", role: "owner" } }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ answer: "Ik help je graag verder.", source: "gemini" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[1][0])).toContain("generativelanguage.googleapis.com");
    expect(String(fetchMock.mock.calls[2][0])).toContain("generativelanguage.googleapis.com");
  });

  it("combines selective analytics with product knowledge for a mixed question", async () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    const storeId = "11111111-1111-4111-8111-111111111111";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ id: "user-tenant-context" }))
      .mockResolvedValueOnce(Response.json({
        version: 1, timezone: "Europe/Brussels",
        query: { version: 1, domain: "sales", measure: "transactions", dimension: "total", period: { preset: "today" }, filters: {}, sort: "desc", limit: 12, comparison: "none", rationale: "verkoopanalyse" },
        period: { preset: "today", start: "2026-08-26T00:00:00Z", endExclusive: "2026-08-27T00:00:00Z" },
        rows: [{ label: "Totaal", metricValue: 7, transactionCount: 7, revenueCents: 12345 }],
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
    expect(rpcUrl).toContain("/rest/v1/rpc/get_pace_analytics_context");
    expect((rpcInit.headers as Record<string, string>).Authorization).toBe("Bearer valid-token");
    expect(JSON.parse(String(rpcInit.body))).toMatchObject({ target_store_id: storeId, query_plan: { domain: "sales", measure: "transactions", period: { preset: "today" } } });

    const geminiInit = fetchMock.mock.calls[2][1] as RequestInit;
    const geminiBody = JSON.parse(String(geminiInit.body)) as { contents: Array<{ role: string; parts: Array<{ text: string }> }> };
    const prompt = geminiBody.contents.at(-1)?.parts[0]?.text ?? "";
    expect(prompt).toContain("PWAYMENT-productkennis");
    expect(prompt).toContain("Selectieve, server-side gevalideerde analyses");
    expect(prompt).toContain('"transactionCount":7');
    expect(prompt).toContain("insights.explain");
    expect(geminiBody.contents.slice(0, 2).map((item) => item.role)).toEqual(["user", "model"]);
  });

  it("uses a validated Gemini plan to execute multiple tenant-safe reads", async () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    process.env.PACE_GEMINI_PLANNER = "true";
    const storeId = "77777777-7777-4777-8777-777777777777";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ id: "user-ai-planner" }))
      .mockResolvedValueOnce(Response.json({
        candidates: [{ content: { parts: [{ text: JSON.stringify({
          version: 1,
          intent: "mixed",
          analytics: [{
            domain: "sales", measure: "revenue", dimension: "product",
            period: { preset: "this_month" }, filters: { search: "SKU-42" },
            sort: "desc", limit: 5, comparison: "none", rationale: "Productomzet",
          }],
          record: { entity: "product", search: "SKU-42", limit: 1 },
          inventoryAction: false,
          broadContext: false,
          needsComposition: true,
          clarification: null,
          confidence: 0.97,
        }) }] } }],
      }))
      .mockResolvedValueOnce(Response.json({
        version: 1, query: { domain: "sales", measure: "revenue", dimension: "product" },
        period: { preset: "this_month" }, rows: [{ label: "Sneaker", revenueCents: 42000, metricValue: 42000 }],
      }))
      .mockResolvedValueOnce(Response.json({
        version: 1, entity: "product", rows: [{ name: "Sneaker", sku: "SKU-42", stockQty: 8 }],
      }))
      .mockResolvedValueOnce(Response.json({
        candidates: [{ content: { parts: [{ text: "Sneaker SKU-42 heeft deze maand € 420 omzet en 8 stuks voorraad." }] } }],
      }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await handler.fetch(request({
      question: "Hoe verkoopt SKU-42 deze maand en hoeveel voorraad is er?",
      context: { storeId, view: "insights", role: "owner" },
    }));

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(5);
    const plannerBody = JSON.parse(String((fetchMock.mock.calls[1][1] as RequestInit).body));
    expect(plannerBody.generationConfig).toMatchObject({ responseMimeType: "application/json", temperature: 0 });
    expect(String(fetchMock.mock.calls[2][0])).toContain("get_pace_analytics_context");
    expect(String(fetchMock.mock.calls[3][0])).toContain("get_pace_record_context");
    expect(JSON.parse(String((fetchMock.mock.calls[2][1] as RequestInit).body))).toMatchObject({ query_plan: { filters: { search: "SKU-42" } } });
    expect(JSON.parse(String((fetchMock.mock.calls[3][1] as RequestInit).body))).toMatchObject({ record_plan: { search: "SKU-42", limit: 1 } });
    await expect(response.json()).resolves.toMatchObject({ source: "gemini", answer: expect.stringContaining("SKU-42") });
  });

  it("executes a Gemini-selected specialized read tool under the user session", async () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    process.env.PACE_GEMINI_PLANNER = "true";
    const storeId = "88888888-8888-4888-8888-888888888888";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ id: "user-read-tools" }))
      .mockResolvedValueOnce(Response.json({
        candidates: [{ content: { parts: [{ text: JSON.stringify({
          version: 1,
          intent: "analytics",
          analytics: [],
          record: null,
          tools: [{ name: "sales.vat_breakdown", period: { preset: "this_month" }, search: "", status: "", limit: 12 }],
          inventoryAction: false,
          broadContext: false,
          needsComposition: true,
          clarification: null,
          confidence: 0.99,
        }) }] } }],
      }))
      .mockResolvedValueOnce(Response.json({
        version: 1,
        tool: "sales.vat_breakdown",
        period: { preset: "this_month" },
        rows: [{ rate: 6, grossCents: 10600, exclCents: 10000, vatCents: 600 }],
      }))
      .mockResolvedValueOnce(Response.json({
        candidates: [{ content: { parts: [{ text: "Deze maand is € 6,00 btw aan 6% geregistreerd." }] } }],
      }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await handler.fetch(request({
      question: "Hoeveel btw heb ik deze maand per tarief?",
      context: { storeId, view: "z-report", role: "owner" },
    }));

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    const [toolUrl, toolInit] = fetchMock.mock.calls[2] as [string, RequestInit];
    expect(toolUrl).toContain("/rest/v1/rpc/get_pace_read_tool_context");
    expect((toolInit.headers as Record<string, string>).Authorization).toBe("Bearer valid-token");
    expect(JSON.parse(String(toolInit.body))).toEqual({
      target_store_id: storeId,
      tool_call: { name: "sales.vat_breakdown", period: { preset: "this_month" }, search: "", status: "", limit: 12 },
    });
    const finalPrompt = JSON.parse(String((fetchMock.mock.calls[3][1] as RequestInit).body)).contents.at(-1).parts[0].text;
    expect(finalPrompt).toContain("gespecialiseerde, tenantveilige read-only tools");
    expect(finalPrompt).toContain('"vatCents":600');
  });

  it("loads decision-ready aged inventory for a concrete bundle question", async () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    const storeId = "44444444-4444-4444-8444-444444444444";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ id: "user-inventory-advice" }))
      .mockResolvedValueOnce(Response.json({
        basis: "daysWithoutSale",
        thresholdDays: 60,
        requestedCategories: ["Kledij", "Schoenen"],
        agedProducts: [{
          id: "aged-1",
          name: "Linnen broek",
          sku: "KL-101",
          category: "Kledij",
          stockQty: 8,
          daysWithoutSale: 84,
          priceCents: 8995,
          costPriceCents: 3600,
          maxDiscountPercentAt25Margin: 35,
        }],
        bundlePartners: [{
          id: "partner-1",
          name: "Witte sneaker",
          sku: "SC-202",
          category: "Schoenen",
          stockQty: 12,
          unitsSold30Days: 9,
          priceCents: 10995,
        }],
      }))
      .mockResolvedValueOnce(Response.json({
        candidates: [{ content: { parts: [{ text: "Bundel de linnen broek met de witte sneaker en geef 15% korting op de broek." }] } }],
      }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await handler.fetch(request({
      question: "Welke producten in Kledij of Schoenen liggen meer dan 60 dagen en met welke bundel raak ik ze kwijt zonder mijn marge te verbranden?",
      context: { storeId, view: "insights", role: "owner" },
    }));

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const [inventoryUrl, inventoryInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(inventoryUrl).toContain("/rest/v1/rpc/get_pace_inventory_action_context");
    expect(JSON.parse(String(inventoryInit.body))).toEqual({
      target_store_id: storeId,
      user_query: "Welke producten in Kledij of Schoenen liggen meer dan 60 dagen en met welke bundel raak ik ze kwijt zonder mijn marge te verbranden?",
    });
    const geminiBody = JSON.parse(String((fetchMock.mock.calls[2][1] as RequestInit).body)) as {
      contents: Array<{ parts: Array<{ text: string }> }>;
      generationConfig: { maxOutputTokens: number };
    };
    const prompt = geminiBody.contents.at(-1)?.parts[0]?.text ?? "";
    expect(prompt).toContain("Beslisklare trage-voorraadcontext");
    expect(prompt).toContain("Linnen broek");
    expect(prompt).toContain('"maxDiscountPercentAt25Margin":35');
    expect(prompt).toContain("Witte sneaker");
    expect(geminiBody.generationConfig.maxOutputTokens).toBe(480);
  });

  it("answers all-time weekday sales directly from selective analytics", async () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    const storeId = "55555555-5555-4555-8555-555555555555";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ id: "user-weekday-sales" }))
      .mockResolvedValueOnce(Response.json({
        version: 1,
        timezone: "Europe/Brussels",
        query: { version: 1, domain: "sales", measure: "revenue", dimension: "weekday", period: { preset: "all_time" }, filters: {}, sort: "desc", limit: 5, comparison: "none", rationale: "verkoopanalyse" },
        period: { preset: "all_time", start: null, endExclusive: null },
        basis: "finalized sales and refunds in the store timezone; weekday ranking uses average net revenue per active trading day",
        rows: [
          { key: "6", label: "zaterdag", metricValue: 6736, revenueCents: 485000, transactionCount: 110, tradingDays: 72, averageTicketCents: 4409 },
          { key: "5", label: "vrijdag", metricValue: 5826, revenueCents: 501000, transactionCount: 125, tradingDays: 86, averageTicketCents: 4008 },
        ],
      }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await handler.fetch(request({
      question: "Welke dag van de week is historisch gezien de alltime beste verkoopsdag?",
      context: { storeId, view: "workforce", role: "owner" },
      localCandidate: { intentId: "insights.best-sales-weekday", title: "Historisch beste verkoopsdag" },
    }));

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [analyticsUrl, analyticsInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(analyticsUrl).toContain("/rest/v1/rpc/get_pace_analytics_context");
    expect(JSON.parse(String(analyticsInit.body))).toMatchObject({ target_store_id: storeId, query_plan: { domain: "sales", measure: "revenue", dimension: "weekday", period: { preset: "all_time" } } });
    await expect(response.json()).resolves.toMatchObject({
      source: "analytics",
      model: "PWAYMENT Analytics",
      answer: expect.stringContaining("zaterdag heeft de hoogste gemiddelde dagomzet: € 67,36"),
    });
  });

  it("loads only the requested record projection for a concrete lookup", async () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    const storeId = "66666666-6666-4666-8666-666666666666";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ id: "user-record-lookup" }))
      .mockResolvedValueOnce(Response.json({
        version: 1,
        entity: "webshop_order",
        basis: "webshop order lifecycle; customer and address snapshots excluded",
        rows: [{ orderNumber: "WEB-88", status: "processing", paymentStatus: "paid", totalCents: 12995 }],
      }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await handler.fetch(request({
      question: "Wat is de status van webshoporder WEB-88?",
      context: { storeId, view: "profile", role: "manager" },
    }));

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [recordUrl, recordInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(recordUrl).toContain("/rest/v1/rpc/get_pace_record_context");
    expect(recordUrl).not.toContain("get_pace_ai_context");
    expect(JSON.parse(String(recordInit.body))).toMatchObject({
      target_store_id: storeId,
      record_plan: { entity: "webshop_order", limit: 15 },
    });
    await expect(response.json()).resolves.toMatchObject({
      source: "analytics",
      model: "PWAYMENT Records",
      answer: expect.stringContaining("WEB-88"),
      record: { entity: "webshop_order" },
    });
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
