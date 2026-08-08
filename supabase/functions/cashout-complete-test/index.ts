import { parseCashoutSettlement } from "../_shared/cashout.ts";
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
    const input = parseCashoutSettlement(await request.json().catch(() => ({})));
    const functionName = input.outcome === "completed" ? "complete_test_cashout" : "reject_test_cashout";
    const { data, error } = await admin.rpc(functionName, {
      p_user_id: user.id,
      p_request_id: input.requestId,
      p_idempotency_key: input.idempotencyKey
    });
    if (error) throw error;
    return json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "cashout_settlement_failed";
    if (message.includes("로그인") || message.includes("인증")) return json({ error: "authentication_required" }, 401);
    if (message.includes("not found") || message.includes("ownership")) return json({ error: "cashout_not_found" }, 404);
    if (message.includes("테스트 모드") || message.includes("테스트 secret")) return json({ error: "test_mode_required" }, 503);
    return json({ error: "cashout_already_settled" }, 400);
  }
});
