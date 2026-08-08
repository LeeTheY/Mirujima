import type { UserRole } from "@mirujima/contracts";
import Link from "next/link";
import { Brand } from "./brand";
import { BellIcon } from "./icons";
import { navigationForRole } from "@/features/navigation/navigation";
import { signOut } from "@/features/auth/actions";

export function DashboardShell({ role, activeHref, children }: Readonly<{
  role: UserRole;
  activeHref: string;
  children: React.ReactNode;
}>) {
  return (
    <div className="app-frame">
      <header className="app-header">
        <Brand />
        <nav aria-label="주요 메뉴" className="pill-nav">
          {navigationForRole(role).map((item) => (
            <Link className={item.href === activeHref ? "active" : ""} href={item.href} key={item.href}>{item.label}</Link>
          ))}
        </nav>
        <div className="header-actions">
          <button className="icon-button" type="button" aria-label="알림"><BellIcon /></button>
          <form action={signOut}><button className="text-action logout-button" type="submit">로그아웃</button></form>
        </div>
      </header>
      <main className="app-main">{children}</main>
    </div>
  );
}
