import { operationResponder } from "../_shared/operation-response.ts";
import { authenticatedClient, corsHeaders, json as baseJson } from "../_shared/membership.ts";
import { assertTossPaymentConfig, parseTopupConfirmationRequest, TossApiError } from "../_shared/toss.ts";

import { recoverableTossConfirmation, isObservedTerminalPayment } from "../_shared/payment-recovery.ts";

Deno.serve(async (request) => {
  const json = operationResponder("wallet-confirm-topup", baseJson);
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  let userId: string | null = null; let orderId: string | null = null;
  try {
    const { admin, user } = await authenticatedClient(request); userId = user.id;
    const body = await request.json().catch(() => ({}));
    let input;
    if (body?.action === "reconcile") {
      if (typeof body.orderId !== "string" || !/^[A-Za-z0-9_-]{6,64}$/.test(body.orderId)) throw new Error("invalid topup order");
      const { data: stored, error: readError } = await admin.from("wallet_transactions").select("provider_order_id, provider_payment_key, krw_amount").eq("to_user_id", user.id).eq("kind", "topup_requested").eq("provider_order_id", body.orderId).maybeSingle();
      if (readError || !stored) throw new Error("topup order not found");
      if (!stored.provider_payment_key) return json({ error: "payment_temporarily_unavailable" }, 502);
      input = parseTopupConfirmationRequest({ paymentKey: stored.provider_payment_key, orderId: stored.provider_order_id, amount: stored.krw_amount });
    } else input = parseTopupConfirmationRequest(body);
    orderId = input.orderId;
    const config = assertTossPaymentConfig({ MIRUJIMA_LIVE_PAYMENTS_ENABLED: Deno.env.get("MIRUJIMA_LIVE_PAYMENTS_ENABLED"), TOSS_PAYMENT_MODE: Deno.env.get("TOSS_PAYMENT_MODE"), TOSS_SECRET_KEY: Deno.env.get("TOSS_SECRET_KEY") });
    const { data: claim, error: claimError } = await admin.rpc("claim_topup_payment", { p_user_id: user.id, p_order_id: input.orderId, p_payment_key: input.paymentKey, p_callback_amount: input.amount });
    if (claimError) throw claimError;
    if (claim?.status === "confirmed") return json({ status: "confirmed", points: claim.points, balances: (await admin.rpc("get_wallet_balances", { p_user_id: user.id })).data });
    const provider = await recoverableTossConfirmation(config, { ...input, idempotencyKey: `topup-confirm:${input.orderId}` }, { reconcileFirst: claim?.reconciliationRequired !== false, reconciliationOnly: claim?.reconciliationOnly === true });
    const { data, error } = await admin.rpc("confirm_toss_topup_payment", { p_user_id: user.id, p_order_id: input.orderId, p_payment_key: input.paymentKey, p_provider_payload: provider });
    if (error) throw error;
    return json(data);
  } catch (error) {
    if (error instanceof Error && error.message === "payment_configuration_required") return json({ error: "payment_configuration_required" }, 503);
    if (isObservedTerminalPayment(error) && userId && orderId) {
      try { const { admin } = await authenticatedClient(request); await admin.rpc("fail_topup_payment", { p_user_id: userId, p_order_id: orderId, p_failure_code: error.code }); } catch { /* retry can reconcile */ }
    }
    if (error instanceof TossApiError) return json({ error: error.retryable ? "payment_temporarily_unavailable" : "payment_rejected" }, error.retryable ? 502 : 400);
    const message = error instanceof Error ? error.message : "topup_confirmation_failed";
    const code = message.includes("amount mismatch") ? "topup_payment_amount_mismatch"
      : message.includes("payment key") ? "topup_payment_conflict"
      : message.includes("로그인") || message.includes("인증") ? "authentication_required"
      : "topup_confirmation_failed";
    return json({ error: code }, code === "authentication_required" ? 401 : 400);
  }
});
