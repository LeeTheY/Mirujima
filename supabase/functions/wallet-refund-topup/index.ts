import { operationResponder } from "../_shared/operation-response.ts";
import { authenticatedClient, corsHeaders, json as baseJson } from "../_shared/membership.ts";
import { assertSandboxTestMode, assertTossPaymentConfig, parseTopupRefundRequest, sandboxRefundPayload } from "../_shared/toss.ts";
import { recoverableTossRefund, refundMode, type RefundSnapshot } from "../_shared/refund-recovery.ts";

Deno.serve(async (request) => {
  const json = operationResponder("wallet-refund-topup", baseJson);
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const { admin, user } = await authenticatedClient(request);
    const input = parseTopupRefundRequest(await request.json().catch(() => ({})));
    const mode = refundMode(Deno.env.get("MIRUJIMA_REFUND_MODE"));
    if (mode === "sandbox") assertSandboxTestMode({ TOSS_PAYMENT_MODE: Deno.env.get("TOSS_PAYMENT_MODE") });
    else if ((mode === "provider_live" ? "live" : "test") !== Deno.env.get("TOSS_PAYMENT_MODE")) throw new Error("refund_mode_required");
    const config = mode !== "sandbox" ? assertTossPaymentConfig({ MIRUJIMA_LIVE_PAYMENTS_ENABLED: Deno.env.get("MIRUJIMA_LIVE_PAYMENTS_ENABLED"), TOSS_PAYMENT_MODE: Deno.env.get("TOSS_PAYMENT_MODE"), TOSS_SECRET_KEY: Deno.env.get("TOSS_SECRET_KEY") }) : null;
    const { data: claim, error: claimError } = await admin.rpc("reserve_latest_topup_refund", { p_user_id: user.id, p_idempotency_key: input.idempotencyKey, p_points: input.points });
    if (claimError) throw claimError;
    if (!claim || claim.points !== input.points) throw new Error("refund_unconfirmed");
    async function terminal(result: Record<string, unknown>) {
      const { data: limits, error: limitsError } = await admin.rpc("get_topup_refund_limits", { p_user_id: user.id });
      // A successful settlement must not be undone when this projection fails.
      return json({ ...result, maxRefundableTopup: limitsError ? null : limits?.maxRefundableTopup ?? null });
    }
    if (claim.status === "refunded" || claim.status === "rejected") return terminal(claim);
    const id = claim.refundRequestId;
    if (typeof id !== "string" || typeof claim.paymentKey !== "string" || (claim.refundMode && claim.refundMode !== mode)) throw new Error("refund_unconfirmed");
    let provider;
    if (config) {
      if (typeof claim.originalOrderId !== "string" || !Number.isSafeInteger(claim.originalAmount)) throw new Error("refund_requires_review");
      try {
        provider = await recoverableTossRefund(config, { refundRequestId: id, paymentKey: claim.paymentKey, orderId: claim.originalOrderId, originalAmount: claim.originalAmount, points: claim.points, dispatched: claim.dispatched === true, providerSnapshot: claim.providerSnapshot }, async (snapshot: RefundSnapshot) => {
          const { data, error } = await admin.rpc("prepare_topup_refund", { p_user_id: user.id, p_refund_request_id: id, p_mode: mode, p_provider_snapshot: snapshot });
          if (error || !data) throw new Error("refund_unconfirmed");
          return data;
        });
      } catch (cause) {
        // This error is emitted only by preflight, before prepare or any cancel
        // POST. The locked RPC rechecks dispatch so a concurrent invocation
        // cannot return funds after another request has begun cancellation.
        if (!(cause instanceof Error) || cause.message !== "refund_not_supported") throw cause;
        const { data: rejected, error: rejectError } = await admin.rpc("reject_topup_refund", { p_user_id: user.id, p_refund_request_id: id });
        if (rejectError || !rejected) throw new Error("refund_unconfirmed");
        if (rejected.status === "rejected") return terminal(rejected);
        // A concurrent completion wins over rejection. Read its canonical
        // receipt, including provider flags required by the client parser.
        const { data: settled, error: settledError } = await admin.rpc("reserve_latest_topup_refund", { p_user_id: user.id, p_idempotency_key: input.idempotencyKey, p_points: input.points });
        if (settledError || settled?.status !== "refunded" || settled.points !== input.points) throw new Error("refund_unconfirmed");
        return terminal(settled);
      }
    } else {
      const { error } = await admin.rpc("prepare_topup_refund", { p_user_id: user.id, p_refund_request_id: id, p_mode: mode, p_provider_snapshot: null });
      if (error) throw error;
      provider = sandboxRefundPayload(claim.paymentKey, claim.points);
    }
    const { data, error } = await admin.rpc("complete_topup_refund", { p_user_id: user.id, p_refund_request_id: id, p_provider_payload: provider });
    if (error || !data) throw new Error("refund_unconfirmed");
    return terminal(data);
  } catch (error) {
    // No automatic rejection after an unknown provider/DB outcome. Keep the
    // reservation and original request key available for read-only recovery.
    const message = error instanceof Error ? error.message : "";
    if (message.includes("테스트 모드") || message === "refund_mode_required" || message === "payment_configuration_required") return json({ error: "refund_configuration_required" }, 503);
    if (message === "refund_not_supported") return json({ error: "refund_requires_review" }, 422);
    if (message.includes("로그인") || message.includes("인증")) return json({ error: "authentication_required" }, 401);
    return json({ error: "refund_result_unconfirmed" }, 502);
  }
});
