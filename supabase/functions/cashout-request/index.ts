import { parseCashoutRequest } from "../_shared/cashout.ts";
import { authenticatedClient, corsHeaders, json } from "../_shared/membership.ts";
import { assertTossTestMode } from "../_shared/toss.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const { admin, user } = await authenticatedClient(request);
    assertTossTestMode({
      TOSS_PAYMENT_MODE: Deno.env.get("TOSS_PAYMENT_MODE"),
      TOSS_SECRET_KEY: Deno.env.get("TOSS_SECRET_KEY")
    });
    const input = parseCashoutRequest(await request.json().catch(() => ({})));
    const { data, error } = await admin.rpc("request_test_cashout", {
      p_user_id: user.id,
      p_points: input.points,
      p_idempotency_key: input.idempotencyKey
    });
    if (error) throw error;
    return json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "cashout_request_failed";
    if (message.includes("로그인") || message.includes("인증")) return json({ error: "authentication_required" }, 401);
    if (message.includes("insufficient earned")) return json({ error: "insufficient_earned_points" }, 400);
    if (message.includes("테스트 모드") || message.includes("테스트 secret")) return json({ error: "test_mode_required" }, 503);
    return json({ error: "invalid_cashout_points" }, 400);
  }
});
