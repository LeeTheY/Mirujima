const CACHE_NAME = "mirujima-shell-v4";
const APP_SHELL = ["/", "/how", "/privacy", "/offline"];
const PUBLIC_PAGES = new Set(APP_SHELL);
const SENSITIVE_PREFIXES = ["/api", "/auth", "/focus", "/guardian", "/history", "/home", "/login", "/membership", "/my", "/wallet"];
const SENSITIVE_QUERY_KEYS = ["code", "token", "paymentKey", "orderId", "amount"];

function hasSensitiveQuery(url) {
  return SENSITIVE_QUERY_KEYS.some((key) => url.searchParams.has(key));
}

function isStaticAsset(url) {
  return url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/");
}

function isSensitivePath(url) {
  return SENSITIVE_PREFIXES.some((prefix) => url.pathname === prefix || url.pathname.startsWith(`${prefix}/`));
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

async function publicPage(request, url) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok && !hasSensitiveQuery(url)) await cache.put(url.pathname, response.clone());
    return response;
  } catch {
    return (await cache.match(url.pathname)) || (await cache.match("/offline"));
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(Promise.all([
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("mirujima-") && key !== CACHE_NAME).map((key) => caches.delete(key)))),
    self.clients.claim(),
  ]));
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;
  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(event.request));
    return;
  }
  if (event.request.mode !== "navigate") return;
  if (PUBLIC_PAGES.has(url.pathname) && !hasSensitiveQuery(url)) {
    event.respondWith(publicPage(event.request, url));
    return;
  }
  if (isSensitivePath(url) || hasSensitiveQuery(url)) {
    event.respondWith(fetch(event.request).catch(() => caches.match("/offline")));
    return;
  }
  event.respondWith(fetch(event.request).catch(() => caches.match("/offline")));
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "mirujima:activate-update") event.waitUntil(self.skipWaiting());
  if (event.data?.type === "mirujima:clear-private-cache") {
    event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("mirujima-private-")).map((key) => caches.delete(key)))));
  }
});
self.addEventListener("push", (event) => {
  let payload;
  try { payload = event.data?.json(); } catch { return; }
  if (!payload || typeof payload.id !== "string" || !/^[0-9a-f-]{36}$/i.test(payload.id)) return;
  // Never display server-provided names, balances, goal titles, URLs or summaries on lock screens.
  event.waitUntil(self.registration.showNotification("미루지마", {
    body: "새 알림이 도착했습니다. 앱에서 확인해 주세요.", icon: "/icons/icon-192.png",
    tag: `mirujima:${payload.id}`, renotify: false, data: { id: payload.id },
  }));
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  // Login routing resolves the current canonical role; no arbitrary payload URL is followed.
  event.waitUntil(self.clients.openWindow(new URL("/login?next=/home", self.location.origin).href));
});
