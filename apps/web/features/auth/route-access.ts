import type { UserRole } from "@mirujima/contracts";

export type RouteAccess = "public" | "shared" | UserRole;

const publicRoutes = new Set(["/", "/login", "/auth/callback", "/how", "/privacy"]);
const studentRoutes = new Set(["/home", "/focus", "/history", "/my", "/wallet/cashout"]);
const guardianRoutes = new Set(["/guardian", "/guardian/students", "/guardian/history", "/guardian/my", "/guardian/rewards", "/wallet/refund"]);

function matchesRoute(pathname: string, route: string): boolean {
  return pathname === route || pathname.startsWith(`${route}/`);
}

export function routeAccess(pathname: string): RouteAccess {
  if (publicRoutes.has(pathname)) return "public";
  if (matchesRoute(pathname, "/membership") || matchesRoute(pathname, "/wallet/charge")) return "shared";
  if (studentRoutes.has(pathname)) return "student";
  if (guardianRoutes.has(pathname)) return "guardian";
  return "shared";
}

export type AccessDecision = { role: UserRole } | { redirectTo: string };

export function resolveAccess(
  pathname: string,
  userId: string | null,
  profileRole: unknown,
): AccessDecision {
  if (!userId || (profileRole !== "student" && profileRole !== "guardian")) {
    return { redirectTo: "/login" };
  }

  const redirectTo = roleRedirect(pathname, profileRole);
  return redirectTo ? { redirectTo } : { role: profileRole };
}

export function roleRedirect(pathname: string, actualRole: UserRole): string | null {
  const access = routeAccess(pathname);
  if (access === "public" || access === "shared" || access === actualRole) return null;

  if (pathname === "/my" && actualRole === "guardian") return "/guardian/my";
  if (pathname === "/guardian/my" && actualRole === "student") return "/my";
  return actualRole === "guardian" ? "/guardian" : "/home";
}
