import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import handler from "./payments";

const originalEnv = { ...process.env };

const request = (method: string, body?: unknown, query = "") => new Request(
  `https://pwayment.test/api/mollie/payments${query}`,
  {
    method,
    headers: { Authorization: "Bearer valid-token", "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  },
);

describe("Mollie terminal endpoint", () => {
  const ownerKey = createHash("sha256").update("pwayment:mollie:user-1").digest("hex");
  beforeEach(() => {
    process.env.MOLLIE_API_KEY = "test_mollie_key";
    process.env.MOLLIE_TERMINAL_ID = "term_test_terminal";
    process.env.SUPABASE_URL = "https://supabase.test";
    process.env.SUPABASE_PUBLISHABLE_KEY = "publishable-test-key";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
  });

  it("keeps Mollie disabled until the server-side API key exists", async () => {
    delete process.env.MOLLIE_API_KEY;
    const response = await handler.fetch(request("POST", {}));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: "MOLLIE_NOT_CONFIGURED" });
  });

  it("discovers the profile terminal when no fixed terminal ID is configured", async () => {
    delete process.env.MOLLIE_TERMINAL_ID;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ id: "user-1" }))
      .mockResolvedValueOnce(Response.json({
        _embedded: { terminals: [{ id: "term_discovered", status: "active" }] },
      }))
      .mockResolvedValueOnce(Response.json({
        id: "tr_discovered",
        status: "open",
        mode: "test",
        amount: { currency: "EUR", value: "7.50" },
      }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await handler.fetch(request("POST", {
      amountCents: 750,
      description: "Kassaverkoop",
      idempotencyKey: "checkout-750:mollie:attempt-1",
    }));

    expect(response.status).toBe(201);
    expect(JSON.parse(String((fetchMock.mock.calls[2][1] as RequestInit).body))).toMatchObject({
      terminalId: "term_discovered",
    });
  });

  it("creates an authenticated point-of-sale payment using integer cents", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ id: "user-1" }))
      .mockResolvedValueOnce(Response.json({
        id: "tr_test123",
        status: "open",
        mode: "test",
        amount: { currency: "EUR", value: "12.34" },
        _links: { changePaymentState: { href: "https://www.mollie.com/payments/test" } },
      }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await handler.fetch(request("POST", {
      amountCents: 1234,
      description: "Kassaverkoop",
      idempotencyKey: "checkout-123:mollie:attempt-1",
    }));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      id: "tr_test123",
      status: "open",
      amountCents: 1234,
      testMode: true,
      changePaymentStateUrl: "https://www.mollie.com/payments/test",
    });
    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toBe("https://api.mollie.com/v2/payments");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer test_mollie_key",
      "Idempotency-Key": "checkout-123:mollie:attempt-1",
    });
    expect(JSON.parse(String(init.body))).toMatchObject({
      amount: { currency: "EUR", value: "12.34" },
      redirectUrl: "https://pwayment.test/app",
      method: "pointofsale",
      terminalId: "term_test_terminal",
    });
  });

  it("does not leak a live payment state-change link", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(Response.json({ id: "user-1" }))
      .mockResolvedValueOnce(Response.json({
        id: "tr_live123",
        status: "paid",
        testmode: false,
        amount: { currency: "EUR", value: "5.00" },
        metadata: { source: "pwayment-retail", ownerKey },
        _links: { changePaymentState: { href: "https://unexpected.test" } },
      })));

    const response = await handler.fetch(request("GET", undefined, "?id=tr_live123"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      id: "tr_live123",
      status: "paid",
      amountCents: 500,
      testMode: false,
    });
  });

  it("rejects malformed payment references before contacting Mollie", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ id: "user-1" }));
    vi.stubGlobal("fetch", fetchMock);
    const response = await handler.fetch(request("GET", undefined, "?id=../../secret"));
    expect(response.status).toBe(400);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
