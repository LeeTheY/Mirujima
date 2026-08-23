import { describe, expect, it } from "vitest";
import { notificationPageSchema } from "./index";

describe("server notification contracts", () => {
  it("accepts a bounded recipient notification page", () => {
    const parsed = notificationPageSchema.parse({
      items: [{
        id: "11111111-1111-4111-8111-111111111111",
        kind: "focus_completed",
        title: "집중 완료",
        body: "기록이 반영되었습니다.",
        data: { sessionId: "session-1", route: "/history" },
        readAt: null,
        createdAt: "2026-08-24T10:00:00.000Z",
      }],
      unreadCount: 1,
      nextCursor: null,
    });
    expect(parsed.items[0].kind).toBe("focus_completed");
  });

  it("rejects unsupported kinds and invalid cursors", () => {
    expect(() => notificationPageSchema.parse({
      items: [{ id: "bad", kind: "raw_activity", title: "x", body: "x", data: {}, readAt: null, createdAt: "bad" }],
      unreadCount: -1,
      nextCursor: null,
    })).toThrow();
  });
});
