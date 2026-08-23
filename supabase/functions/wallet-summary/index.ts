import { authenticatedClient, corsHeaders, json } from "../_shared/membership.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const { admin, user } = await authenticatedClient(request);
    const { data, error } = await admin.rpc("get_wallet_balances", { p_user_id: user.id });
    if (error) throw error;
    const { data: refundLimits } = await admin.rpc("get_topup_refund_limits", { p_user_id: user.id });
    return json({ ...data, maxRefundableTopup: refundLimits?.maxRefundableTopup ?? 0 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "wallet_summary_failed";
    const authenticationError = message.includes("로그인") || message.includes("인증");
    return json({ error: authenticationError ? "authentication_required" : "wallet_summary_failed" }, authenticationError ? 401 : 500);
  }
});
