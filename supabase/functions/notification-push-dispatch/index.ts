import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";
import { deliverClaimedBatch, dispatchPush, type PushWork } from "../_shared/push-delivery.ts";

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response(null, { status: 405 });
  const dispatchSecret = Deno.env.get("MIRUJIMA_PUSH_DISPATCH_SECRET");
  const supplied = request.headers.get("x-mirujima-dispatch-secret");
  if (!dispatchSecret || supplied !== dispatchSecret) return new Response(null, { status: 403 });
  const url = Deno.env.get("SUPABASE_URL"), key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY"), privateKey = Deno.env.get("VAPID_PRIVATE_KEY"), subject = Deno.env.get("VAPID_SUBJECT");
  if (!url || !key || !publicKey || !privateKey || !subject) return new Response(null, { status: 503 });
  const client = createClient(url, key, { auth: { persistSession: false } });
  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    const claim = await client.rpc("claim_notification_push_batch");
    if (claim.error || !Array.isArray(claim.data)) throw new Error("claim failed");
    let sent = 0;
    await deliverClaimedBatch(claim.data as PushWork[], async (work) => {
      const status = await dispatchPush(work, (sub, payload) => webpush.sendNotification(sub, payload, { TTL: 300, timeout: 8000 }));
      const finish = await client.rpc("finish_notification_push", { p_notification_id: work.notificationId, p_device_id: work.deviceId, p_token: work.token, p_status: status });
      if (finish.error) throw new Error("completion failed");
      if (status === "sent") sent++;
    });
    return Response.json({ claimed: claim.data.length, sent });
  } catch {
    // Keep subscriptions, provider responses and credentials out of logs.
    console.error(JSON.stringify({ event: "push_dispatch_failed", requestId: crypto.randomUUID() }));
    return new Response(null, { status: 502 });
  }
});
