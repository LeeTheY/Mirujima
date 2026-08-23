import type { ServerNotificationKind } from "@mirujima/contracts";

export type NotificationCategory = "family" | "focus" | "reward";

export function notificationCategory(kind: ServerNotificationKind): NotificationCategory {
  if (kind.startsWith("family_")) return "family";
  if (kind.startsWith("focus_")) return "focus";
  return "reward";
}

export function relativeNotificationTime(createdAt: string, now = Date.now()): string {
  const elapsedMs = Math.max(0, now - Date.parse(createdAt));
  const minutes = Math.floor(elapsedMs / 60_000);
  if (minutes < 1) return "방금";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}일 전`;
  return new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric" }).format(new Date(createdAt));
}
