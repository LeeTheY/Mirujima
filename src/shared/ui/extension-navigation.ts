export const EXTENSION_NAV_ITEMS = [
  { id: "focus", label: "집중" },
  { id: "tabs", label: "탭 정리" },
  { id: "web", label: "Web" },
] as const;

export type ExtensionPage = (typeof EXTENSION_NAV_ITEMS)[number]["id"];

export function extensionEntrySurface(legacyOnboardingCompleted: boolean): "agent" {
  void legacyOnboardingCompleted;
  return "agent";
}

export function webAppUrl(path: string, configuredOrigin = import.meta.env.VITE_WEB_APP_ORIGIN): string {
  const rawOrigin = configuredOrigin?.trim() ?? "";
  if (!rawOrigin || rawOrigin.includes("*")) throw new Error("유효한 Web origin이 필요합니다.");
  const url = new URL(rawOrigin);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("유효한 Web origin이 필요합니다.");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return new URL(normalizedPath, `${url.origin}/`).toString();
}

export function openWebApp(path: string): void {
  void chrome.tabs.create({ url: webAppUrl(path) });
}
