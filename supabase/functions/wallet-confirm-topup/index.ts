import { authenticatedClient, corsHeaders, json } from "../_shared/membership.ts";
import { assertTossTestMode, confirmTossPayment, parseTopupConfirmationRequest, TossApiError } from "../_shared/toss.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  let userId: string | null = null; let orderId: string | null = null;
  try {
    const { admin, user } = await authenticatedClient(request); userId = user.id;
    const input = parseTopupConfirmationRequest(await request.json().catch(() => ({}))); orderId = input.orderId;
    const config = assertTossTestMode({ TOSS_PAYMENT_MODE: Deno.env.get("TOSS_PAYMENT_MODE"), TOSS_SECRET_KEY: Deno.env.get("TOSS_SECRET_KEY") });
    const { data: claim, error: claimError } = await admin.rpc("claim_topup_payment", { p_user_id: user.id, p_order_id: input.orderId, p_payment_key: input.paymentKey, p_callback_amount: input.amount });
    if (claimError) throw claimError;
    if (claim?.status === "confirmed") return json({ status: "confirmed", points: claim.points, balances: (await admin.rpc("get_wallet_balances", { p_user_id: user.id })).data });
    const provider = await confirmTossPayment(config, { ...input, idempotencyKey: `topup-confirm:${input.orderId}` });
    const { data, error } = await admin.rpc("confirm_toss_topup_payment", { p_user_id: user.id, p_order_id: input.orderId, p_payment_key: input.paymentKey, p_provider_payload: provider });
    if (error) throw error;
    return json(data);
  } catch (error) {
    if (error instanceof TossApiError && !error.retryable && userId && orderId) {
      try { const { admin } = await authenticatedClient(request); await admin.rpc("fail_topup_payment", { p_user_id: userId, p_order_id: orderId, p_failure_code: error.code }); } catch { /* retry can reconcile */ }
    }
    if (error instanceof TossApiError) return json({ error: error.retryable ? "payment_temporarily_unavailable" : "payment_rejected" }, error.retryable ? 502 : 400);
    return json({ error: "topup_confirmation_failed" }, 400);
  }
});
