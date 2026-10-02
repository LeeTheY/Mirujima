import { authenticatedClient, corsHeaders, json } from "../_shared/membership.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const { admin, client, user } = await authenticatedClient(request);
    const { data, error } = await admin.rpc("get_wallet_balances", { p_user_id: user.id });
    if (error) throw error;
    const { data: profile, error: profileError } = await client.from("profiles").select("role").eq("id", user.id).single();
    if (profileError || !["student", "guardian"].includes(profile?.role)) throw new Error("wallet_summary_failed");
    // The refund-limit RPC is guardian-only. Students still need real balances.
    if (profile.role === "student") return json({ ...data, maxRefundableTopup: 0 });
    const { data: refundLimits, error: refundError } = await admin.rpc("get_topup_refund_limits", { p_user_id: user.id });
    if (refundError) throw refundError;
    const limit = refundLimits?.maxRefundableTopup;
    if (!Number.isSafeInteger(limit) || limit < 0) throw new Error("wallet_summary_failed");
    return json({ ...data, maxRefundableTopup: limit });
  } catch (error) {
    const message = error instanceof Error ? error.message : "wallet_summary_failed";
    const authenticationError = message.includes("로그인") || message.includes("인증");
    return json({ error: authenticationError ? "authentication_required" : "wallet_summary_failed" }, authenticationError ? 401 : 500);
  }
});
