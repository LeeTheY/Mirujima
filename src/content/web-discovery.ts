// Only announce the public extension ID on the configured control-plane origin.
// This channel never handles credentials, focus commands or financial data.
export function registerWebDiscovery() {
  const origin = import.meta.env.VITE_WEB_APP_ORIGIN;
  if (!origin || location.origin !== origin) return;
  window.addEventListener("message", (event: MessageEvent) => {
    if (event.source !== window || event.origin !== origin || event.data?.type !== "mirujima:discover-extension" || typeof event.data.requestId !== "string" || event.data.requestId.length > 128) return;
    window.postMessage({ type: "mirujima:extension-discovered", requestId: event.data.requestId, extensionId: chrome.runtime.id }, origin);
  });
}
