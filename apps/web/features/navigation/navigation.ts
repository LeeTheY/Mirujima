import type { UserRole } from "@mirujima/contracts";

export interface NavigationItem {
  label: string;
  href: string;
}

const studentNavigation: NavigationItem[] = [
  { label: "홈", href: "/home" },
  { label: "집중", href: "/focus" },
  { label: "기록", href: "/history" },
  { label: "마이페이지", href: "/my" },
];

const guardianNavigation: NavigationItem[] = [
  { label: "홈", href: "/guardian" },
  { label: "학생", href: "/guardian/students" },
  { label: "기록", href: "/guardian/history" },
  { label: "마이페이지", href: "/my" },
];

export function navigationForRole(role: UserRole): NavigationItem[] {
  return role === "guardian" ? guardianNavigation : studentNavigation;
}
