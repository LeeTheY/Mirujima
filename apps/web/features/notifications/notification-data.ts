import {
  notificationPageSchema,
  type NotificationCursor,
  type NotificationPage,
} from "@mirujima/contracts";
import { createClient } from "../../lib/supabase/client";

export interface NotificationRpcClient {
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message?: string } | null }>;
}

function browserClient(): NotificationRpcClient {
  return createClient() as unknown as NotificationRpcClient;
}

export async function listNotifications(
  cursor: NotificationCursor | null = null,
  client: NotificationRpcClient = browserClient(),
): Promise<NotificationPage> {
  const { data, error } = await client.rpc("list_notifications", {
    p_limit: 20,
    p_before_created_at: cursor?.createdAt ?? null,
    p_before_id: cursor?.id ?? null,
  });
  if (error) throw new Error("알림 목록을 불러오지 못했습니다.");
  const parsed = notificationPageSchema.safeParse(data);
  if (!parsed.success) throw new Error("알림 목록 형식을 확인하지 못했습니다.");
  return parsed.data;
}

export async function getNotificationUnreadCount(
  client: NotificationRpcClient = browserClient(),
): Promise<number> {
  const { data, error } = await client.rpc("get_notification_unread_count");
  if (error || typeof data !== "number" || !Number.isSafeInteger(data) || data < 0) {
    throw new Error("읽지 않은 알림 수를 불러오지 못했습니다.");
  }
  return data;
}

export async function markNotificationRead(
  notificationId: string,
  client: NotificationRpcClient = browserClient(),
): Promise<boolean> {
  const { data, error } = await client.rpc("mark_notification_read", { p_notification_id: notificationId });
  if (error || typeof data !== "boolean") throw new Error("알림을 읽음 처리하지 못했습니다.");
  return data;
}

export async function markAllNotificationsRead(
  client: NotificationRpcClient = browserClient(),
): Promise<number> {
  const { data, error } = await client.rpc("mark_all_notifications_read");
  if (error || typeof data !== "number" || !Number.isSafeInteger(data) || data < 0) {
    throw new Error("알림을 모두 읽음 처리하지 못했습니다.");
  }
  return data;
}
