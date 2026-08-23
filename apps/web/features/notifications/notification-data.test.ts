import { describe, expect, it, vi } from "vitest";
import { getNotificationUnreadCount, listNotifications, markNotificationRead } from "./notification-data";

const item = {
  id: "11111111-1111-4111-8111-111111111111",
  kind: "family_linked",
  title: "연결 완료",
  body: "보호자와 연결되었습니다.",
  data: { route: "/my" },
  readAt: null,
  createdAt: "2026-08-24T10:00:00.000Z",
};

describe("notification data gateway", () => {
  it("parses a server page and sends a stable cursor", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { items: [item], unreadCount: 1, nextCursor: null }, error: null });
    await expect(listNotifications(null, { rpc })).resolves.toMatchObject({ unreadCount: 1 });
    expect(rpc).toHaveBeenCalledWith("list_notifications", {
      p_limit: 20,
      p_before_created_at: null,
      p_before_id: null,
    });
  });

  it("rejects malformed counts and preserves recipient RPC boundaries", async () => {
    const badCount = { rpc: vi.fn().mockResolvedValue({ data: "1", error: null }) };
    await expect(getNotificationUnreadCount(badCount)).rejects.toThrow("알림 수");

    const mark = { rpc: vi.fn().mockResolvedValue({ data: true, error: null }) };
    await expect(markNotificationRead(item.id, mark)).resolves.toBe(true);
    expect(mark.rpc).toHaveBeenCalledWith("mark_notification_read", { p_notification_id: item.id });
  });
});
