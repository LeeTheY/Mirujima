const CACHE_NAME = "mirujima-shell-v3";
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
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))),
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
