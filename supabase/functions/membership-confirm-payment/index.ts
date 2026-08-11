import { authenticatedClient, corsHeaders, json, membershipResponse } from "../_shared/membership.ts";
import {
  assertTossTestMode,
  confirmTossPayment,
  parseMembershipConfirmationRequest,
  TossApiError
} from "../_shared/toss.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let userId: string | null = null;
  let orderId: string | null = null;
  try {
    const { admin, client, user } = await authenticatedClient(request);
    userId = user.id;
    const input = parseMembershipConfirmationRequest(await request.json().catch(() => ({})));
    orderId = input.orderId;
    const config = assertTossTestMode({
      TOSS_PAYMENT_MODE: Deno.env.get("TOSS_PAYMENT_MODE"),
      TOSS_SECRET_KEY: Deno.env.get("TOSS_SECRET_KEY")
    });
    const { data: claim, error: claimError } = await admin.rpc("claim_membership_payment", {
      p_user_id: user.id,
      p_order_id: input.orderId,
      p_payment_key: input.paymentKey,
      p_callback_amount: input.amount
    });
    if (claimError) throw claimError;
    if (claim?.status === "confirmed") return json(await membershipResponse(client, user.id));

    const provider = await confirmTossPayment(config, {
      ...input,
      idempotencyKey: `membership-confirm:${input.orderId}`
    });
    const { data: order } = await admin.from("membership_payment_orders").select("order_kind").eq("user_id", user.id).eq("order_id", input.orderId).maybeSingle();
    const confirmationFunction = order?.order_kind === "family_seat" ? "confirm_toss_family_seat_payment" : "confirm_toss_membership_payment";
    const { error: confirmationError } = await admin.rpc(confirmationFunction, {
      p_user_id: user.id,
      p_order_id: input.orderId,
      p_payment_key: input.paymentKey,
      p_provider_payload: provider
    });
    if (confirmationError) throw confirmationError;
    return json(await membershipResponse(client, user.id));
  } catch (error) {
    if (error instanceof TossApiError && !error.retryable && userId && orderId) {
      try {
        const { admin } = await authenticatedClient(request);
        await admin.rpc("fail_membership_payment", {
          p_user_id: userId,
          p_order_id: orderId,
          p_failure_code: error.code
        });
      } catch {
        // The original safe error remains the response; a retry can reconcile a confirming order.
      }
    }
    const message = error instanceof Error ? error.message : "membership_confirmation_failed";
    if (message.includes("로그인") || message.includes("인증")) return json({ error: "authentication_required" }, 401);
    if (error instanceof TossApiError) {
      return json({ error: error.retryable ? "payment_temporarily_unavailable" : "payment_rejected" }, error.retryable ? 502 : 400);
    }
    const code = message.includes("student membership conflict") ? "student_membership_conflict"
      : message.includes("guardian membership conflict") ? "guardian_membership_conflict"
      : message.includes("seat limit") ? "family_seat_limit_reached"
      : message.includes("period changed") || message.includes("stale") ? "membership_order_expired"
      : message.includes("amount mismatch") ? "membership_payment_amount_mismatch"
      : message.includes("already active") ? "membership_already_active"
      : message.includes("role") ? "membership_role_mismatch"
      : "membership_confirmation_failed";
    return json({ error: code }, 400);
  }
});
