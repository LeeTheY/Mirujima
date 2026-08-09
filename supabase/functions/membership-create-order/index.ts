import { authenticatedClient, corsHeaders, json } from "../_shared/membership.ts";
import { parseMembershipOrderRequest } from "../_shared/toss.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const { admin, user } = await authenticatedClient(request);
    const input = parseMembershipOrderRequest(await request.json().catch(() => ({})));
    const { data, error } = await admin.rpc("create_membership_payment_order", {
      p_user_id: user.id,
      p_idempotency_key: input.idempotencyKey
    });
    if (error) throw error;
    return json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "membership_order_failed";
    const status = message.includes("로그인") || message.includes("인증") ? 401 : 400;
    return json({ error: status === 401 ? "authentication_required" : "membership_order_failed" }, status);
  }
});
