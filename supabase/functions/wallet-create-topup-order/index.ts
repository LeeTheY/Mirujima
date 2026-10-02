import { authenticatedClient, corsHeaders, json } from "../_shared/membership.ts";
import { assertTossPaymentConfig, parseTopupOrderRequest } from "../_shared/toss.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    assertTossPaymentConfig({ MIRUJIMA_LIVE_PAYMENTS_ENABLED: Deno.env.get("MIRUJIMA_LIVE_PAYMENTS_ENABLED"), TOSS_PAYMENT_MODE: Deno.env.get("TOSS_PAYMENT_MODE"), TOSS_SECRET_KEY: Deno.env.get("TOSS_SECRET_KEY") });
    const { admin, user } = await authenticatedClient(request);
    const input = parseTopupOrderRequest(await request.json().catch(() => ({})));
    const { data, error } = await admin.rpc("create_topup_payment_order", { p_user_id: user.id, p_points: input.points, p_idempotency_key: input.idempotencyKey });
    if (error) throw error;
    return json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "topup_order_failed";
    return json({ error: message === "payment_configuration_required" ? "payment_configuration_required" : "topup_order_failed" }, message === "payment_configuration_required" ? 503 : 400);
  }
});
