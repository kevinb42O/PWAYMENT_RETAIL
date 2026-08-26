const json = (status: number, body: Record<string, unknown>) => Response.json(body, { status, headers: {
  "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8", "X-Content-Type-Options": "nosniff",
} });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const userIdFor = async (authorization: string, supabaseUrl: string, publishableKey: string) => {
  const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/auth/v1/user`, { headers: { apikey: publishableKey, Authorization: authorization } });
  if (!response.ok) return null;
  const user = await response.json() as { id?: unknown };
  return typeof user.id === "string" ? user.id : null;
};

export default {
  async fetch(request: Request) {
    if (!['POST', 'GET'].includes(request.method)) return json(405, { error: "METHOD_NOT_ALLOWED" });
    const mollieKey = process.env.MOLLIE_API_KEY?.trim();
    const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
    const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!mollieKey || !supabaseUrl || !publishableKey || !serviceKey) return json(503, { error: "BILLING_NOT_CONFIGURED", message: "Credit-aankopen zijn nog niet geconfigureerd." });
    const authorization = request.headers.get("authorization") ?? "";
    if (!authorization.startsWith("Bearer ")) return json(401, { error: "AUTH_REQUIRED" });
    const userId = await userIdFor(authorization, supabaseUrl, publishableKey).catch(() => null);
    if (!userId) return json(401, { error: "INVALID_SESSION" });
    const restUrl = supabaseUrl.replace(/\/$/, "");

    if (request.method === 'POST') {
      const body = await request.json().catch(() => null) as { storeId?: unknown; packCode?: unknown; idempotencyKey?: unknown } | null;
      if (!body || typeof body.storeId !== "string" || !UUID.test(body.storeId) || body.packCode !== "pace-50" || typeof body.idempotencyKey !== "string" || !UUID.test(body.idempotencyKey)) {
        return json(400, { error: "INVALID_CREDIT_PACK" });
      }
      const reservation = await fetch(`${restUrl}/rest/v1/rpc/create_pace_credit_purchase`, {
        method: "POST", headers: { apikey: publishableKey, Authorization: authorization, "Content-Type": "application/json" },
        body: JSON.stringify({ target_store_id: body.storeId, purchase_idempotency_key: body.idempotencyKey }),
      });
      if (reservation.status === 401 || reservation.status === 403) return json(403, { error: "OWNER_REQUIRED", message: "Alleen de winkeleigenaar kan credits kopen." });
      if (!reservation.ok) return json(502, { error: "PURCHASE_RESERVATION_FAILED" });
      const purchaseId = await reservation.json() as string;
      const redirectUrl = new URL("/settings/pace", request.url);
      redirectUrl.searchParams.set("pacePurchaseId", purchaseId);
      const paymentResponse = await fetch("https://api.mollie.com/v2/payments", {
        method: "POST", headers: { Authorization: `Bearer ${mollieKey}`, "Content-Type": "application/json", "Idempotency-Key": `pace-${purchaseId}` },
        body: JSON.stringify({ amount: { currency: "EUR", value: "5.00" }, description: "PWAYMENT PACE · 50 extra vragen", redirectUrl: redirectUrl.toString(), metadata: { source: "pwayment-pace-credits", purchaseId } }),
        signal: AbortSignal.timeout(15_000),
      });
      const payment = await paymentResponse.json().catch(() => ({})) as { id?: string; _links?: { checkout?: { href?: string } }; detail?: string };
      if (!paymentResponse.ok || !payment.id || !payment._links?.checkout?.href) return json(502, { error: "PAYMENT_CREATE_FAILED", message: payment.detail ?? "De betaling kon niet worden geopend." });
      await fetch(`${restUrl}/rest/v1/pace_credit_purchases?id=eq.${purchaseId}`, {
        method: "PATCH", headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({ provider_payment_id: payment.id, checkout_url: payment._links.checkout.href }),
      });
      return json(201, { purchaseId, checkoutUrl: payment._links.checkout.href });
    }

    const purchaseId = new URL(request.url).searchParams.get("purchaseId") ?? "";
    if (!UUID.test(purchaseId)) return json(400, { error: "INVALID_PURCHASE" });
    const purchaseResponse = await fetch(`${restUrl}/rest/v1/pace_credit_purchases?id=eq.${purchaseId}&select=id,requested_by,provider_payment_id,status`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, Accept: "application/vnd.pgrst.object+json" },
    });
    const purchase = await purchaseResponse.json().catch(() => null) as { requested_by?: string; provider_payment_id?: string; status?: string } | null;
    if (!purchaseResponse.ok || !purchase || purchase.requested_by !== userId) return json(404, { error: "PURCHASE_NOT_FOUND" });
    if (purchase.status === "paid") return json(200, { status: "paid", credited: false });
    if (!purchase.provider_payment_id) return json(409, { error: "PAYMENT_NOT_READY" });
    const paymentResponse = await fetch(`https://api.mollie.com/v2/payments/${encodeURIComponent(purchase.provider_payment_id)}`, { headers: { Authorization: `Bearer ${mollieKey}` }, signal: AbortSignal.timeout(15_000) });
    const payment = await paymentResponse.json().catch(() => ({})) as { status?: string; metadata?: { purchaseId?: string } };
    if (!paymentResponse.ok || payment.metadata?.purchaseId !== purchaseId) return json(502, { error: "PAYMENT_VERIFY_FAILED" });
    if (payment.status !== "paid") return json(200, { status: payment.status ?? "pending", credited: false });
    const completion = await fetch(`${restUrl}/rest/v1/rpc/complete_pace_credit_purchase`, {
      method: "POST", headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ target_purchase_id: purchaseId, payment_id: purchase.provider_payment_id }),
    });
    if (!completion.ok) return json(502, { error: "CREDIT_GRANT_FAILED" });
    return json(200, { status: "paid", ...(await completion.json() as Record<string, unknown>) });
  },
};
