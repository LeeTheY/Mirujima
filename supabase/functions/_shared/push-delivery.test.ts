import { describe, expect, it, vi } from "vitest";
import { deliverClaimedBatch, dispatchPush, validPushEndpoint, type PushWork } from "./push-delivery";
const work: PushWork = { notificationId: "11111111-1111-4111-8111-111111111111", deviceId: "device", token: "token", subscription: { endpoint: "https://fcm.googleapis.com/fcm/send/test", keys: { p256dh: "key", auth: "secret" } } };
describe("private notification delivery", () => {
  it("bounds provider concurrency and completes every claimed notification", async () => {
    let active = 0, peak = 0; const completed: number[] = [];
    await deliverClaimedBatch(Array.from({ length: 50 }, (_, id) => id), async (id) => {
      active++; peak = Math.max(peak, active); await Promise.resolve();
      active--; completed.push(id);
    });
    expect(peak).toBeLessThanOrEqual(10); expect(peak).toBeGreaterThan(1);
    expect(new Set(completed).size).toBe(50); expect(active).toBe(0);
  });
  it("a completion failure does not strand the rest of the claimed batch", async () => {
    const attempted: number[] = [];
    await expect(deliverClaimedBatch(Array.from({ length: 50 }, (_, id) => id), async (id) => {
      attempted.push(id); if (id === 0) throw new Error("database unavailable");
    })).rejects.toThrow("push completion failed");
    expect(new Set(attempted).size).toBe(50);
  });
  it("blocks SSRF, credentials, redirects encoded as query, and unknown origins", () => {
    for (const endpoint of ["http://127.0.0.1/", "https://fcm.googleapis.com.evil.test/x", "https://secret@fcm.googleapis.com/x", "https://fcm.googleapis.com/x?target=http://internal", "https://fcm.googleapis.com:444/x"]) expect(validPushEndpoint(endpoint)).toBe(false);
    expect(validPushEndpoint(work.subscription.endpoint)).toBe(true);
  });
  it("sends only a canonical notification id", async () => {
    const send = vi.fn().mockResolvedValue({}); expect(await dispatchPush(work, send)).toBe("sent");
    expect(JSON.parse(send.mock.calls[0][1])).toEqual({ id: work.notificationId });
  });
  it("removes expired subscriptions and preserves temporary failures for retry", async () => {
    expect(await dispatchPush(work, vi.fn().mockRejectedValue({ statusCode: 410 }))).toBe("expired");
    expect(await dispatchPush(work, vi.fn().mockRejectedValue({ statusCode: 503 }))).toBe("retry");
  });
  it("never calls an arbitrary endpoint", async () => {
    const send = vi.fn(); expect(await dispatchPush({ ...work, subscription: { ...work.subscription, endpoint: "https://private.test" } }, send)).toBe("expired"); expect(send).not.toHaveBeenCalled();
  });
});
