import { authenticatedClient, corsHeaders, json } from "../_shared/membership.ts";
import { assertSandboxTestMode, parseTopupRefundRequest, sandboxRefundPayload } from "../_shared/toss.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let refundRequestId: string | null = null;
  try {
    const { admin, user } = await authenticatedClient(request);
    const input = parseTopupRefundRequest(await request.json().catch(() => ({})));
    assertSandboxTestMode({ TOSS_PAYMENT_MODE: Deno.env.get("TOSS_PAYMENT_MODE") });
    const { data: claim, error: claimError } = await admin.rpc("reserve_latest_topup_refund", {
      p_user_id: user.id,
      p_idempotency_key: input.idempotencyKey,
    });
    if (claimError) throw claimError;
    if (claim?.status === "refunded") return json(claim);
    refundRequestId = claim?.refundRequestId ?? null;
    if (!refundRequestId || typeof claim?.paymentKey !== "string") throw new Error("refundable_topup_not_found");

    const { data, error } = await admin.rpc("complete_topup_refund", {
      p_user_id: user.id,
      p_refund_request_id: refundRequestId,
      p_provider_payload: sandboxRefundPayload(claim.paymentKey),
    });
    if (error) throw error;
    return json({ ...data, sandbox: true, actualRefund: false });
  } catch (error) {
    if (refundRequestId) {
      try {
        const { admin, user } = await authenticatedClient(request);
        await admin.rpc("reject_topup_refund", { p_user_id: user.id, p_refund_request_id: refundRequestId });
      } catch { /* reservation remains auditable for manual reconciliation */ }
    }
    const message = error instanceof Error ? error.message : "topup_refund_failed";
    if (message.includes("테스트 모드")) return json({ error: "test_mode_required" }, 503);
    return json({ error: "topup_refund_failed" }, 400);
  }
});
