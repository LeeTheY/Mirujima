"use client";

import { useCallback, useEffect, useState } from "react";
import type { NotificationCursor, ServerNotification } from "@mirujima/contracts";
import { UserCheck, UserX, Flame, Award, X, Bell, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  getNotificationUnreadCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/features/notifications/notification-data";
import { notificationCategory, relativeNotificationTime } from "@/features/notifications/notification-format";

import { PushSettings } from "@/features/notifications/push-settings";

export function NotificationCenter({
  isOpen,
  onClose,
  onUnreadCountChange,
}: {
  isOpen: boolean;
  onClose: () => void;
  onUnreadCountChange: (count: number) => void;
}) {
  const [notifications, setNotifications] = useState<ServerNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [nextCursor, setNextCursor] = useState<NotificationCursor | null>(null);
  const [activeTab, setActiveTab] = useState<"all" | "unread" | "family">("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const publishUnreadCount = useCallback((count: number) => {
    setUnreadCount(count);
    onUnreadCountChange(count);
  }, [onUnreadCountChange]);

  const loadFirstPage = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const page = await listNotifications();
      setNotifications(page.items);
      setNextCursor(page.nextCursor);
      publishUnreadCount(page.unreadCount);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "알림을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [publishUnreadCount]);

  useEffect(() => {
    void getNotificationUnreadCount().then(publishUnreadCount).catch(() => undefined);
  }, [publishUnreadCount]);

  useEffect(() => {
    if (!isOpen) return;
    const timer = window.setTimeout(() => void loadFirstPage(), 0);
    return () => window.clearTimeout(timer);
  }, [isOpen, loadFirstPage]);

  useEffect(() => {
    const supabase = createClient();
    let disposed = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    void supabase.auth.getUser().then(({ data, error: authError }) => {
      if (disposed || authError || !data.user) return;
      channel = supabase.channel(`notifications:${data.user.id}`).on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `recipient_user_id=eq.${data.user.id}` },
        () => {
          void getNotificationUnreadCount().then(publishUnreadCount).catch(() => undefined);
          if (isOpen) void loadFirstPage();
        },
      ).subscribe();
    });
    return () => {
      disposed = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [isOpen, loadFirstPage, publishUnreadCount]);

  const loadMore = async () => {
    if (!nextCursor || loading) return;
    setLoading(true);
    try {
      const page = await listNotifications(nextCursor);
      setNotifications((current) => [
        ...current,
        ...page.items.filter((item) => !current.some((existing) => existing.id === item.id)),
      ]);
      setNextCursor(page.nextCursor);
      publishUnreadCount(page.unreadCount);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "다음 알림을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const readOne = async (item: ServerNotification) => {
    if (item.readAt) return;
    try {
      if (!await markNotificationRead(item.id)) return;
      const readAt = new Date().toISOString();
      setNotifications((current) => current.map((value) => value.id === item.id ? { ...value, readAt } : value));
      publishUnreadCount(Math.max(0, unreadCount - 1));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "알림을 읽음 처리하지 못했습니다.");
    }
  };

  const readAll = async () => {
    try {
      await markAllNotificationsRead();
      const readAt = new Date().toISOString();
      setNotifications((current) => current.map((item) => item.readAt ? item : { ...item, readAt }));
      publishUnreadCount(0);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "알림을 모두 읽음 처리하지 못했습니다.");
    }
  };

  if (!isOpen) return null;
  const filtered = notifications.filter((item) => {
    if (activeTab === "unread") return !item.readAt;
    if (activeTab === "family") return notificationCategory(item.kind) === "family";
    return true;
  });

  return (
    <div className="notification-backdrop" onClick={onClose}>
      <div className="notification-popover" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="알림 센터">
        <div className="notification-header">
          <div className="notification-title-row"><h2>알림 센터</h2>{unreadCount > 0 && <span className="unread-badge">미읽음 {unreadCount}</span>}</div>
          <button className="icon-close-button" onClick={onClose} aria-label="닫기"><X className="w-4 h-4" /></button>
        </div>
        <div className="notification-tabs" role="group" aria-label="알림 필터">
          <button className={`tab-item ${activeTab === "all" ? "active" : ""}`} aria-pressed={activeTab === "all"} onClick={() => setActiveTab("all")}>전체</button>
          <button className={`tab-item ${activeTab === "unread" ? "active" : ""}`} aria-pressed={activeTab === "unread"} onClick={() => setActiveTab("unread")}>미읽음 ({unreadCount})</button>
          <button className={`tab-item ${activeTab === "family" ? "active" : ""}`} aria-pressed={activeTab === "family"} onClick={() => setActiveTab("family")}>보호자 연결</button>
        </div>
        <PushSettings />
        <div className="notification-list" aria-live="polite">
          {error && <div className="notice error"><strong>알림을 확인하지 못했습니다.</strong><p>{error}</p><button className="text-button" onClick={() => void loadFirstPage()}>다시 시도</button></div>}
          {!error && loading && notifications.length === 0 && <div className="notification-empty"><Bell className="w-8 h-8 text-muted" /><p>알림을 불러오는 중입니다.</p></div>}
          {!error && !loading && filtered.length === 0 && <div className="notification-empty"><Bell className="w-8 h-8 text-muted" /><p>도착한 알림이 없습니다.</p></div>}
          {filtered.map((item) => {
            const category = notificationCategory(item.kind);
            return (
              <button key={item.id} type="button" className={`notification-card ${!item.readAt ? "unread" : ""}`} onClick={() => void readOne(item)}>
                <span className={`icon-circle ${category}`}>
                  {item.kind === "family_linked" && <UserCheck className="w-4 h-4 text-emerald-600" />}
                  {item.kind === "family_disconnected" && <UserX className="w-4 h-4 text-rose-500" />}
                  {category === "focus" && <Flame className="w-4 h-4 text-blue-600" />}
                  {category === "reward" && <Award className="w-4 h-4 text-amber-500" />}
                  {category !== "focus" && category !== "reward" && !["family_linked", "family_disconnected"].includes(item.kind) && <Bell className="w-4 h-4 text-blue-600" />}
                </span>
                <span className="notification-content">
                  <span className="notification-card-header"><strong className="notification-item-title">{item.title}</strong><span className="notification-time">{relativeNotificationTime(item.createdAt)}</span></span>
                  <span className="notification-item-body">{item.body}</span>
                </span>
              </button>
            );
          })}
          {nextCursor && <button className="text-button" type="button" onClick={() => void loadMore()} disabled={loading}>{loading ? "불러오는 중" : "이전 알림 더 보기"}</button>}
        </div>
        {notifications.length > 0 && <div className="notification-footer"><button className="footer-action" onClick={() => void readAll()}><Check className="w-3.5 h-3.5 inline mr-1" /> 모두 읽음 표시</button></div>}
      </div>
    </div>
  );
}
