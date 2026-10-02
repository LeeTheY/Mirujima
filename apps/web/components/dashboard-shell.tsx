"use client";

import { useState } from "react";
import type { UserRole } from "@mirujima/contracts";
import Link, { useLinkStatus } from "next/link";
import { Brand } from "./brand";
import { BellIcon } from "./icons";
import { navigationForRole } from "@/features/navigation/navigation";
import { signOut } from "@/features/auth/actions";
import { NotificationCenter } from "./notification-center";

export function DashboardShell({
  role,
  activeHref,
  children,
}: Readonly<{
  role: UserRole;
  activeHref: string;
  children: React.ReactNode;
}>) {
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  return (
    <div className="app-frame">
      <header className="app-header">
        <Brand href={role === "guardian" ? "/guardian" : "/home"} />
        <nav aria-label="주요 메뉴" className="pill-nav-container">
          <div className="pill-nav">
            {navigationForRole(role).map((item) => (
              <Link
                className={`pill-item ${item.href === activeHref ? "active" : ""}`}
                aria-current={item.href === activeHref ? "page" : undefined}
                href={item.href}
                prefetch={true}
                key={item.href}
              >
                {item.label}
                <NavigationHint />
              </Link>
            ))}
          </div>
        </nav>

        <div className="header-actions">
          <button
            className="icon-button notification-bell-button"
            type="button"
            aria-label="알림 센터"
            onClick={() => setIsNotifOpen(true)}
          >
            <BellIcon />
            {unreadCount > 0 && <span className="notification-bell-badge" aria-hidden="true">{Math.min(unreadCount, 99)}</span>}
          </button>
          <form action={signOut}>
            <button className="logout-button" type="submit">
              로그아웃
            </button>
          </form>
        </div>
      </header>

      <NotificationCenter isOpen={isNotifOpen} onClose={() => setIsNotifOpen(false)} onUnreadCountChange={setUnreadCount} />

      <main className="app-main">{children}</main>
    </div>
  );
}

function NavigationHint() {
  const { pending } = useLinkStatus();
  return <span className={`navigation-hint${pending ? " pending" : ""}`} aria-hidden="true" />;
}
