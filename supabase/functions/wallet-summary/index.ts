import { authenticatedClient, corsHeaders, json } from "../_shared/membership.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const { admin, user } = await authenticatedClient(request);
    const { data, error } = await admin.rpc("get_wallet_balances", { p_user_id: user.id });
    if (error) throw error;
    return json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "wallet_summary_failed";
    const authenticationError = message.includes("로그인") || message.includes("인증");
    return json({ error: authenticationError ? "authentication_required" : "wallet_summary_failed" }, authenticationError ? 401 : 500);
  }
});
