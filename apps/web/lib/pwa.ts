export function shouldRegisterServiceWorker(input: {
  secure: boolean;
  supported: boolean;
  production: boolean;
}): boolean {
  return input.secure && input.supported && input.production;
}

const SENSITIVE_PREFIXES = ["/api", "/auth", "/focus", "/guardian", "/history", "/home", "/login", "/membership", "/my", "/wallet"];
const SENSITIVE_QUERY_KEYS = ["code", "token", "paymentKey", "orderId", "amount"];

export function isPublicOfflinePage(pathname: string): boolean {
  return ["/", "/how", "/privacy", "/offline"].includes(pathname);
}

export function isSensitivePwaRequest(input: string, appOrigin = "https://mirujima.vercel.app"): boolean {
  const url = new URL(input, appOrigin);
  if (url.origin !== new URL(appOrigin).origin) return true;
  if (SENSITIVE_QUERY_KEYS.some((key) => url.searchParams.has(key))) return true;
  return SENSITIVE_PREFIXES.some((prefix) => url.pathname === prefix || url.pathname.startsWith(`${prefix}/`));
}
