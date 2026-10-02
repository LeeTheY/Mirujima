let installedId: string | null = null;
export function clearDiscoveredExtension() { installedId = null; }
export function discoverInstalledExtension(): Promise<string | null> {
  if (installedId) return Promise.resolve(installedId);
  if (typeof window === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const requestId = crypto.randomUUID();
    const finish = (id: string | null) => {
      window.clearTimeout(timer); window.removeEventListener("message", receive);
      if (id) installedId = id;
      resolve(id);
    };
    const receive = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== window.location.origin || event.data?.type !== "mirujima:extension-discovered" || event.data.requestId !== requestId || typeof event.data.extensionId !== "string" || !/^[a-p]{32}$/.test(event.data.extensionId)) return;
      finish(event.data.extensionId);
    };
    const timer = window.setTimeout(() => finish(null), 1200);
    window.addEventListener("message", receive);
    window.postMessage({ type: "mirujima:discover-extension", requestId }, window.location.origin);
  });
}
