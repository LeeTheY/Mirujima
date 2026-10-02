import { operationResponder } from "../_shared/operation-response.ts";
import { authenticatedClient, corsHeaders, json as baseJson, membershipResponse } from "../_shared/membership.ts";
import {
  assertTossPaymentConfig,
  parseMembershipConfirmationRequest,
  TossApiError
} from "../_shared/toss.ts";

import { recoverableTossConfirmation, isObservedTerminalPayment } from "../_shared/payment-recovery.ts";

Deno.serve(async (request) => {
  const json = operationResponder("membership-confirm-payment", baseJson);
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let userId: string | null = null;
  let orderId: string | null = null;
  try {
    const { admin, client, user } = await authenticatedClient(request);
    userId = user.id;
    const body = await request.json().catch(() => ({}));
    let input;
    if (body?.action === "reconcile") {
      if (typeof body.orderId !== "string" || !/^[A-Za-z0-9_-]{6,64}$/.test(body.orderId)) throw new Error("invalid membership order");
      const { data: stored, error: storedError } = await admin.from("membership_payment_orders").select("order_id,payment_key,amount_krw").eq("user_id", user.id).eq("order_id", body.orderId).maybeSingle();
      if (storedError || !stored) throw new Error("membership order not found");
      if (!stored.payment_key) return json({ error: "payment_temporarily_unavailable" }, 502);
      input = parseMembershipConfirmationRequest({ paymentKey: stored.payment_key, orderId: stored.order_id, amount: stored.amount_krw });
    } else input = parseMembershipConfirmationRequest(body);
    orderId = input.orderId;
    const config = assertTossPaymentConfig({
      MIRUJIMA_LIVE_PAYMENTS_ENABLED: Deno.env.get("MIRUJIMA_LIVE_PAYMENTS_ENABLED"), TOSS_PAYMENT_MODE: Deno.env.get("TOSS_PAYMENT_MODE"),
      TOSS_SECRET_KEY: Deno.env.get("TOSS_SECRET_KEY")
    });
    const { data: claim, error: claimError } = await admin.rpc("claim_membership_payment", {
      p_user_id: user.id,
      p_order_id: input.orderId,
      p_payment_key: input.paymentKey,
      p_callback_amount: input.amount
    });
    if (claimError) throw claimError;
    const { data: order, error: orderError } = await admin.from("membership_payment_orders").select("order_kind").eq("user_id", user.id).eq("order_id", input.orderId).maybeSingle();
    if (orderError || !order || !["membership", "family_seat"].includes(order.order_kind)) throw new Error("membership_confirmation_failed");
    async function response() { return { ...await membershipResponse(client, user.id), paymentOrder: { status: "confirmed", orderId: input.orderId, amount: input.amount, orderKind: order.order_kind } }; }
    if (claim?.status === "confirmed") return json(await response());

    const provider = await recoverableTossConfirmation(config, {
      ...input,
      idempotencyKey: `membership-confirm:${input.orderId}`
    }, { reconcileFirst: claim?.reconciliationRequired !== false, reconciliationOnly: claim?.reconciliationOnly === true });
    const confirmationFunction = order?.order_kind === "family_seat" ? "confirm_toss_family_seat_payment" : "confirm_toss_membership_payment";
    const { error: confirmationError } = await admin.rpc(confirmationFunction, {
      p_user_id: user.id,
      p_order_id: input.orderId,
      p_payment_key: input.paymentKey,
      p_provider_payload: provider
    });
    if (confirmationError) throw confirmationError;
    return json(await response());
  } catch (error) {
    if (error instanceof Error && error.message === "payment_configuration_required") return json({ error: "payment_configuration_required" }, 503);
    if (isObservedTerminalPayment(error) && userId && orderId) {
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
