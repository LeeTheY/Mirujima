import { normalizeHostname } from "../blocking/domain";

export interface SitePreset {
  label: string;
  hostname: string;
  mark: string;
}

export const ALLOWED_SITE_PRESETS: SitePreset[] = [
  { label: "Google", hostname: "google.com", mark: "G" },
  { label: "네이버", hostname: "naver.com", mark: "N" },
  { label: "GitHub", hostname: "github.com", mark: "GH" },
  { label: "Notion", hostname: "notion.so", mark: "N" },
  { label: "Gmail", hostname: "mail.google.com", mark: "M" },
  { label: "Slack", hostname: "slack.com", mark: "S" },
  { label: "ChatGPT", hostname: "chatgpt.com", mark: "AI" },
  { label: "Claude", hostname: "claude.ai", mark: "C" },
  { label: "YouTube", hostname: "youtube.com", mark: "▶" },
  { label: "MDN", hostname: "developer.mozilla.org", mark: "MDN" }
];

export const BLOCKED_SITE_PRESETS: SitePreset[] = [
  { label: "YouTube", hostname: "youtube.com", mark: "▶" },
  { label: "Instagram", hostname: "instagram.com", mark: "IG" },
  { label: "Facebook", hostname: "facebook.com", mark: "f" },
  { label: "X", hostname: "x.com", mark: "X" },
  { label: "TikTok", hostname: "tiktok.com", mark: "♪" },
  { label: "Netflix", hostname: "netflix.com", mark: "N" },
  { label: "Twitch", hostname: "twitch.tv", mark: "T" },
  { label: "Reddit", hostname: "reddit.com", mark: "R" },
  { label: "디시인사이드", hostname: "dcinside.com", mark: "DC" },
  { label: "에펨코리아", hostname: "fmkorea.com", mark: "FM" }
];

function entries(value: string): string[] {
  return value.split(/[\n,\s]+/).map((item) => item.trim()).filter(Boolean);
}

function normalizedOrNull(value: string): string | null {
  try {
    return normalizeHostname(value);
  } catch {
    return null;
  }
}

export function includesDomainText(value: string, hostname: string): boolean {
  return entries(value).some((item) => normalizedOrNull(item) === hostname);
}

export function toggleDomainText(value: string, hostname: string): string {
  const current = entries(value);
  if (includesDomainText(value, hostname)) {
    return current.filter((item) => normalizedOrNull(item) !== hostname).join("\n");
  }
  return [...current, hostname].join("\n");
}
