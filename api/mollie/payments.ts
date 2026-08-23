import { createHash } from "node:crypto";

type MolliePayment = {
  id?: unknown;
  status?: unknown;
  testmode?: unknown;
  mode?: unknown;
  amount?: { currency?: unknown; value?: unknown };
  detail?: unknown;
  title?: unknown;
  metadata?: { source?: unknown; ownerKey?: unknown };
  _links?: { changePaymentState?: { href?: unknown } };
};

const PAYMENT_ID = /^tr_[A-Za-z0-9]+$/;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9:_-]{8,200}$/;
const MAX_BODY_BYTES = 8_000;

const json = (status: number, body: Record<string, unknown>) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });

const authenticate = async (authorization: string, supabaseUrl: string, publishableKey: string) => {
  const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/auth/v1/user`, {
    headers: { apikey: publishableKey, Authorization: authorization },
  });
  if (!response.ok) return null;
  const user = await response.json() as { id?: unknown };
  return typeof user.id === "string" && user.id ? user.id : null;
};

const centsFromMollie = (payment: MolliePayment) => {
  const value = typeof payment.amount?.value === "string" ? payment.amount.value : "0";
  return Math.round(Number(value) * 100);
};

const publicPayment = (payment: MolliePayment) => {
  const testMode = payment.testmode === true || payment.mode === "test";
  return ({
  id: payment.id,
  status: payment.status,
  amountCents: centsFromMollie(payment),
  testMode,
  changePaymentStateUrl:
    testMode && typeof payment._links?.changePaymentState?.href === "string"
      ? payment._links.changePaymentState.href
      : undefined,
  });
};

const mollieErrorMessage = (payment: MolliePayment) =>
  typeof payment.detail === "string"
    ? payment.detail
    : typeof payment.title === "string"
      ? payment.title
      : "Mollie kon de terminalbetaling niet verwerken.";

const paymentOwnerKey = (userId: string) =>
  createHash("sha256").update(`pwayment:mollie:${userId}`).digest("hex");

const discoverTerminalId = async (mollieHeaders: Record<string, string>) => {
  const response = await fetch("https://api.mollie.com/v2/terminals", {
    headers: mollieHeaders,
    signal: AbortSignal.timeout(15_000),
  });
  const body = await response.json().catch(() => ({})) as {
    _embedded?: { terminals?: Array<{ id?: unknown; status?: unknown }> };
  } & MolliePayment;
  if (!response.ok) throw new Error(mollieErrorMessage(body));
  const terminals = body._embedded?.terminals ?? [];
  const terminal = terminals.find((item) => item.status === "active") ?? terminals[0];
  return typeof terminal?.id === "string" ? terminal.id : null;
};

export default {
  async fetch(request: Request) {
    if (!["POST", "GET", "DELETE"].includes(request.method)) {
      return json(405, { error: "METHOD_NOT_ALLOWED", message: "Deze betaalactie wordt niet ondersteund." });
    }

    const mollieApiKey = process.env.MOLLIE_API_KEY?.trim();
    const configuredTerminalId = process.env.MOLLIE_TERMINAL_ID?.trim();
    const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
    const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    if (!mollieApiKey || !supabaseUrl || !publishableKey) {
      return json(503, {
        error: "MOLLIE_NOT_CONFIGURED",
        message: "Mollie is nog niet volledig geconfigureerd voor deze kassa.",
      });
    }

    const authorization = request.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) {
      return json(401, { error: "AUTH_REQUIRED", message: "Meld opnieuw aan om te betalen." });
    }
    let userId: string | null;
    try {
      userId = await authenticate(authorization, supabaseUrl, publishableKey);
      if (!userId) {
        return json(401, { error: "INVALID_SESSION", message: "Uw sessie is verlopen. Meld opnieuw aan." });
      }
    } catch {
      return json(503, { error: "AUTH_UNAVAILABLE", message: "De sessie kon niet worden gecontroleerd." });
    }

    const mollieHeaders = {
      Authorization: `Bearer ${mollieApiKey}`,
      "Content-Type": "application/json",
    };

    if (request.method === "POST") {
      const raw = await request.text();
      if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
        return json(413, { error: "PAYLOAD_TOO_LARGE", message: "Het betaalverzoek is te groot." });
      }
      let body: { amountCents?: unknown; description?: unknown; idempotencyKey?: unknown };
      try { body = JSON.parse(raw); }
      catch { return json(400, { error: "INVALID_JSON", message: "Het betaalverzoek is ongeldig." }); }

      const amountCents = body.amountCents;
      const description = typeof body.description === "string" ? body.description.trim().slice(0, 255) : "";
      const idempotencyKey = typeof body.idempotencyKey === "string" ? body.idempotencyKey.trim() : "";
      if (!Number.isSafeInteger(amountCents) || Number(amountCents) <= 0 || Number(amountCents) > 100_000_000) {
        return json(400, { error: "INVALID_AMOUNT", message: "Het terminalbedrag is ongeldig." });
      }
      if (!description || !IDEMPOTENCY_KEY.test(idempotencyKey)) {
        return json(400, { error: "INVALID_PAYMENT", message: "Het betaalverzoek mist verplichte gegevens." });
      }

      let terminalId = configuredTerminalId;
      if (!terminalId) {
        try { terminalId = await discoverTerminalId(mollieHeaders) ?? undefined; }
        catch { return json(503, { error: "MOLLIE_TERMINAL_UNAVAILABLE", message: "De Mollie-terminal kon niet worden opgehaald." }); }
      }
      if (!terminalId) {
        return json(503, {
          error: "MOLLIE_TERMINAL_NOT_READY",
          message: "Mollie heeft nog geen testterminal voor dit profiel geactiveerd.",
        });
      }

      let upstream: Response;
      try {
        upstream = await fetch("https://api.mollie.com/v2/payments", {
          method: "POST",
          headers: { ...mollieHeaders, "Idempotency-Key": idempotencyKey },
          body: JSON.stringify({
            amount: { currency: "EUR", value: (Number(amountCents) / 100).toFixed(2) },
            description,
            redirectUrl: new URL("/app", request.url).toString(),
            method: "pointofsale",
            terminalId,
            metadata: {
              source: "pwayment-retail",
              ownerKey: paymentOwnerKey(userId),
              checkoutRequestId: idempotencyKey.split(":mollie:")[0],
            },
          }),
          signal: AbortSignal.timeout(15_000),
        });
      } catch {
        return json(503, { error: "MOLLIE_UNAVAILABLE", message: "Mollie is tijdelijk niet bereikbaar." });
      }
      const payment = await upstream.json().catch(() => ({})) as MolliePayment;
      if (!upstream.ok) {
        console.error("Mollie create payment failed", { status: upstream.status });
        return json(upstream.status === 429 ? 429 : 502, {
          error: "MOLLIE_CREATE_FAILED",
          message: mollieErrorMessage(payment),
        });
      }
      return json(201, publicPayment(payment));
    }

    const paymentId = new URL(request.url).searchParams.get("id") ?? "";
    if (!PAYMENT_ID.test(paymentId)) {
      return json(400, { error: "INVALID_PAYMENT_ID", message: "De Mollie-betalingsreferentie is ongeldig." });
    }
    let upstream: Response;
    try {
      upstream = await fetch(`https://api.mollie.com/v2/payments/${encodeURIComponent(paymentId)}`, {
        headers: mollieHeaders,
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      return json(503, { error: "MOLLIE_UNAVAILABLE", message: "Mollie is tijdelijk niet bereikbaar." });
    }
    const payment = await upstream.json().catch(() => ({})) as MolliePayment;
    if (!upstream.ok) {
      return json(upstream.status === 404 ? 404 : 502, {
        error: "MOLLIE_STATUS_FAILED",
        message: mollieErrorMessage(payment),
      });
    }
    if (payment.metadata?.source !== "pwayment-retail" || payment.metadata.ownerKey !== paymentOwnerKey(userId)) {
      return json(403, { error: "PAYMENT_FORBIDDEN", message: "Deze betaling hoort niet bij uw kassasessie." });
    }
    if (request.method === "GET") return json(200, publicPayment(payment));

    let cancellation: Response;
    try {
      cancellation = await fetch(`https://api.mollie.com/v2/payments/${encodeURIComponent(paymentId)}`, {
        method: "DELETE",
        headers: mollieHeaders,
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      return json(503, { error: "MOLLIE_UNAVAILABLE", message: "Mollie is tijdelijk niet bereikbaar." });
    }
    const canceledPayment = await cancellation.json().catch(() => ({})) as MolliePayment;
    if (!cancellation.ok) {
      return json(502, { error: "MOLLIE_CANCEL_FAILED", message: mollieErrorMessage(canceledPayment) });
    }
    return json(200, publicPayment(canceledPayment));
  },
};
