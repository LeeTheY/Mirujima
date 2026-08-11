import { authenticatedClient, corsHeaders, json } from "../_shared/membership.ts";
import { parseMembershipOrderRequest } from "../_shared/toss.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const { admin, user } = await authenticatedClient(request);
    const input = parseMembershipOrderRequest(await request.json().catch(() => ({})));
    const { data, error } = input.orderKind === "family_seat"
      ? await admin.rpc("create_family_seat_payment_order", { p_user_id: user.id, p_idempotency_key: input.idempotencyKey })
      : await admin.rpc("create_membership_payment_order", { p_user_id: user.id, p_idempotency_key: input.idempotencyKey, p_order_kind: input.orderKind });
    if (error) throw error;
    return json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "membership_order_failed";
    const status = message.includes("로그인") || message.includes("인증") ? 401 : message.includes("already active") || message.includes("conflict") || message.includes("seat") ? 409 : 400;
    const code = status === 401 ? "authentication_required"
      : message.includes("student membership conflict") ? "student_membership_conflict"
      : message.includes("guardian membership conflict") ? "guardian_membership_conflict"
      : message.includes("seat limit") ? "family_seat_limit_reached"
      : message.includes("seat already available") ? "family_seat_already_available"
      : message.includes("family membership inactive") ? "family_membership_inactive"
      : message.includes("already active") ? "membership_already_active"
      : message.includes("role") ? "membership_role_mismatch"
      : "membership_order_failed";
    return json({ error: code }, status);
  }
});
