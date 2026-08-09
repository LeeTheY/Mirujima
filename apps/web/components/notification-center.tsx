"use client";

import { useState } from "react";
import { UserCheck, UserX, Flame, Award, X, Bell, Check, Trash2 } from "lucide-react";

export interface NotificationItem {
  id: string;
  type: "link_connected" | "link_disconnected" | "focus_session" | "reward_request";
  title: string;
  body: string;
  timeAgo: string;
  read: boolean;
}

export function NotificationCenter({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [activeTab, setActiveTab] = useState<"all" | "unread" | "family">("all");

  if (!isOpen) return null;

  const unreadCount = notifications.filter((n) => !n.read).length;

  const filtered = notifications.filter((item) => {
    if (activeTab === "unread") return !item.read;
    if (activeTab === "family") return item.type === "link_connected" || item.type === "link_disconnected";
    return true;
  });

  const markAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const clearAll = () => {
    setNotifications([]);
  };

  return (
    <div className="notification-backdrop" onClick={onClose}>
      <div
        className="notification-popover"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="알림 센터"
      >
        <div className="notification-header">
          <div className="notification-title-row">
            <h2>알림 센터</h2>
            {unreadCount > 0 && <span className="unread-badge">{unreadCount}개 안읽음</span>}
          </div>
          <button className="icon-close-button" onClick={onClose} aria-label="닫기">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="notification-tabs">
          <button
            className={`tab-item ${activeTab === "all" ? "active" : ""}`}
            onClick={() => setActiveTab("all")}
          >
            전체
          </button>
          <button
            className={`tab-item ${activeTab === "unread" ? "active" : ""}`}
            onClick={() => setActiveTab("unread")}
          >
            미읽음 ({unreadCount})
          </button>
          <button
            className={`tab-item ${activeTab === "family" ? "active" : ""}`}
            onClick={() => setActiveTab("family")}
          >
            보호자 연결
          </button>
        </div>

        <div className="notification-list">
          {filtered.length === 0 ? (
            <div className="notification-empty">
              <Bell className="w-8 h-8 text-muted" />
              <p>도착한 알림이 없습니다.</p>
            </div>
          ) : (
            filtered.map((item) => (
              <div key={item.id} className={`notification-card ${!item.read ? "unread" : ""}`}>
                <div className={`icon-circle ${item.type}`}>
                  {item.type === "link_connected" && <UserCheck className="w-4 h-4 text-emerald-600" />}
                  {item.type === "link_disconnected" && <UserX className="w-4 h-4 text-rose-500" />}
                  {item.type === "focus_session" && <Flame className="w-4 h-4 text-blue-600" />}
                  {item.type === "reward_request" && <Award className="w-4 h-4 text-amber-500" />}
                </div>

                <div className="notification-content">
                  <div className="notification-card-header">
                    <strong className="notification-item-title">{item.title}</strong>
                    <span className="notification-time">{item.timeAgo}</span>
                  </div>
                  <p className="notification-item-body">{item.body}</p>
                </div>
              </div>
            ))
          )}
        </div>

        {notifications.length > 0 && (
          <div className="notification-footer">
            <button className="footer-action" onClick={markAllRead}>
              <Check className="w-3.5 h-3.5 inline mr-1" /> 모두 읽음 표시
            </button>
            <button className="footer-action danger" onClick={clearAll}>
              <Trash2 className="w-3.5 h-3.5 inline mr-1" /> 알림 지우기
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
