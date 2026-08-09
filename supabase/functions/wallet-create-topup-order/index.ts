import { authenticatedClient, corsHeaders, json } from "../_shared/membership.ts";
import { assertSandboxTestMode, parseTopupOrderRequest } from "../_shared/toss.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    assertSandboxTestMode({ TOSS_PAYMENT_MODE: Deno.env.get("TOSS_PAYMENT_MODE") });
    const { admin, user } = await authenticatedClient(request);
    const input = parseTopupOrderRequest(await request.json().catch(() => ({})));
    const { data, error } = await admin.rpc("create_topup_payment_order", { p_user_id: user.id, p_points: input.points, p_idempotency_key: input.idempotencyKey });
    if (error) throw error;
    return json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "topup_order_failed";
    return json({ error: message.includes("테스트 모드") ? "test_mode_required" : "topup_order_failed" }, message.includes("테스트 모드") ? 503 : 400);
  }
});
