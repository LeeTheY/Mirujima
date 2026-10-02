export interface PushWork {
  notificationId: string; deviceId: string; token: string;
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } };
}
// A claimed batch must be attempted fully. Bound parallel requests so 50
// eight-second provider timeouts do not become a 400-second serial invocation.
export async function deliverClaimedBatch<T>(items: T[], deliver: (item: T) => Promise<void>): Promise<void> {
  let failed = false;
  for (let index = 0; index < items.length; index += 10) {
    const outcomes = await Promise.allSettled(items.slice(index, index + 10).map(deliver));
    failed ||= outcomes.some((outcome) => outcome.status === "rejected");
  }
  if (failed) throw new Error("push completion failed");
}
export function validPushEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    return url.protocol === "https:" && !url.port && !url.username && !url.password && !url.search && !url.hash
      && ["fcm.googleapis.com", "updates.push.services.mozilla.com", "updates-push.services.mozaws.net", "web.push.apple.com"].includes(url.hostname)
      && url.pathname.length > 1 && endpoint.length <= 2048;
  } catch { return false; }
}
export async function dispatchPush(work: PushWork, send: (subscription: PushWork["subscription"], payload: string) => Promise<unknown>): Promise<"sent" | "expired" | "retry"> {
  if (!validPushEndpoint(work.subscription.endpoint)) return "expired";
  try { await send(work.subscription, JSON.stringify({ id: work.notificationId })); return "sent"; }
  catch (error) {
    const status = error && typeof error === "object" ? Reflect.get(error, "statusCode") : null;
    return status === 404 || status === 410 ? "expired" : "retry";
  }
}
