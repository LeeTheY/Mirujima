import type { UserRole } from "@mirujima/contracts";
import { destinationForRole } from "./role-routing";
import { roleRedirect } from "./route-access";

const unsafeCharacters = (value: string) => [...value].some((char) => char === "\\" || char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127);

const destinations = new Set([
  "/home", "/focus", "/history", "/my", "/guardian", "/guardian/students",
  "/guardian/history", "/guardian/my", "/guardian/rewards", "/wallet/charge",
  "/wallet/history", "/wallet/refund", "/wallet/cashout", "/membership/checkout",
]);

export function safeLoginDestination(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048 || !value.startsWith("/")
    || value.startsWith("//") || unsafeCharacters(value)) return null;
  try {
    const decoded = decodeURIComponent(value);
    if (unsafeCharacters(decoded)) return null;
    const url = new URL(value, "https://mirujima.invalid");
    if (url.origin !== "https://mirujima.invalid" || !destinations.has(url.pathname)) return null;
    return `${url.pathname}${url.search}`;
  } catch { return null; }
}

export function loginHref(destination: unknown, error?: string): string {
  const query = new URLSearchParams();
  const next = safeLoginDestination(destination);
  if (next) query.set("next", next);
  if (error) query.set("error", error);
  return `/login${query.size ? `?${query}` : ""}`;
}

export function destinationAfterLogin(role: UserRole | null, requested: unknown): string {
  const next = safeLoginDestination(requested);
  if (!role) return loginHref(next);
  return next ? roleRedirect(new URL(next, "https://mirujima.invalid").pathname, role) ?? next : destinationForRole(role);
}

export function loginErrorMessage(code: unknown): string | null {
  if (code === "cancelled") return "Google 로그인이 취소되었습니다. 다시 로그인하면 이어서 진행할 수 있습니다.";
  if (code === "oauth") return "로그인을 완료하지 못했습니다. 로그인 시간이 지났거나 연결에 문제가 생겼습니다. 다시 시도해 주세요.";
  if (code === "profile") return "계정 정보를 확인하지 못했습니다. 기존 데이터는 변경되지 않았습니다. 잠시 후 다시 시도해 주세요.";
  return null;
}
