import { parseCashoutRequest } from "../_shared/cashout.ts";
import { authenticatedClient, corsHeaders, json } from "../_shared/membership.ts";
import { assertSandboxTestMode } from "../_shared/toss.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const { admin, user } = await authenticatedClient(request);
    assertSandboxTestMode({ TOSS_PAYMENT_MODE: Deno.env.get("TOSS_PAYMENT_MODE") });
    const input = parseCashoutRequest(await request.json().catch(() => ({})));
    const { data, error } = await admin.rpc("request_test_cashout", {
      p_user_id: user.id,
      p_points: input.points,
      p_idempotency_key: input.idempotencyKey
    });
    if (error) throw error;
    if (data?.status === "completed") return json(data);
    if (data?.status !== "requested" || typeof data?.requestId !== "string") {
      throw new Error("cashout request result invalid");
    }
    const { data: completed, error: completionError } = await admin.rpc("complete_test_cashout", {
      p_user_id: user.id,
      p_request_id: data.requestId,
      p_idempotency_key: `cashout-auto-complete:${data.requestId}`,
    });
    if (completionError) throw completionError;
    return json(completed);
  } catch (error) {
    const message = error instanceof Error ? error.message : "cashout_request_failed";
    if (message.includes("로그인") || message.includes("인증")) return json({ error: "authentication_required" }, 401);
    if (message.includes("insufficient earned")) return json({ error: "insufficient_earned_points" }, 400);
    if (message.includes("테스트 모드") || message.includes("테스트 secret")) return json({ error: "test_mode_required" }, 503);
    return json({ error: "invalid_cashout_points" }, 400);
  }
});
