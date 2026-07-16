import { authenticatedClient, corsHeaders, json, membershipResponse, registerDevice } from "../_shared/membership.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (Deno.env.get("BILLING_INTEGRATION") !== "deferred") {
    return json({ error: "deferred_activation_disabled" }, 409);
  }
  try {
    const body = await request.json().catch(() => ({}));
    const { client, admin, user } = await authenticatedClient(request);
    const { error } = await admin.rpc("activate_deferred_membership", { target_user_id: user.id });
    if (error) throw error;
    const displayName = typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name.slice(0, 120) : null;
    const avatarUrl = typeof user.user_metadata?.avatar_url === "string" ? user.user_metadata.avatar_url.slice(0, 1000) : null;
    const { error: profileError } = await client.from("profiles").update({
      display_name: displayName,
      avatar_url: avatarUrl,
      updated_at: new Date().toISOString()
    }).eq("id", user.id);
    if (profileError) throw profileError;
    await registerDevice(client, user.id, body);
    return json({
      ...await membershipResponse(client, user.id),
      paymentRequired: false,
      message: "현재 버전에서는 결제 정보 입력 없이 Premium이 활성화됩니다."
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "membership_activation_failed" }, 401);
  }
});
