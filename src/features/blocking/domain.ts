import type { BlockingMode, DomainRule, TemporaryAllow } from "../../shared/types/models";

export function normalizeHostname(input: string): string {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) throw new Error("도메인을 입력해 주세요.");
  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let hostname: string;
  try {
    hostname = new URL(candidate).hostname.toLowerCase();
  } catch {
    throw new Error("올바른 도메인 형식이 아닙니다.");
  }
  hostname = hostname.replace(/^www\./, "").replace(/\.$/, "");
  if (!hostname || hostname.includes(" ") || (!hostname.includes(".") && hostname !== "localhost")) {
    throw new Error("올바른 도메인 형식이 아닙니다.");
  }
  return hostname;
}

export function matchesDomain(hostname: string, rule: DomainRule): boolean {
  const normalized = normalizeHostname(hostname);
  return normalized === rule.hostname || (rule.includeSubdomains && normalized.endsWith(`.${rule.hostname}`));
}

export function dedupeDomainRules(rules: DomainRule[]): DomainRule[] {
  const map = new Map<string, DomainRule>();
  for (const rule of rules) {
    const hostname = normalizeHostname(rule.hostname);
    const existing = map.get(hostname);
    map.set(hostname, { hostname, includeSubdomains: Boolean(existing?.includeSubdomains || rule.includeSubdomains) });
  }
  return [...map.values()];
}

export function parseDomainList(value: string): DomainRule[] {
  const rules = dedupeDomainRules(
    value.split(/[\n,\s]+/).filter(Boolean).map((hostname) => ({
      hostname: normalizeHostname(hostname),
      includeSubdomains: true
    }))
  );
  if (rules.length > 200) throw new Error("한 일정에는 최대 200개 도메인을 등록할 수 있습니다.");
  return rules;
}

export function isTemporaryAllowActive(allow: TemporaryAllow, now = Date.now()): boolean {
  return allow.expiresAt === null || new Date(allow.expiresAt).getTime() > now;
}

export function shouldBlockHostname(
  hostname: string,
  mode: BlockingMode,
  allowed: DomainRule[],
  blocked: DomainRule[],
  temporaryAllows: TemporaryAllow[] = [],
  now = Date.now()
): boolean {
  if (mode === "off") return false;
  const normalized = normalizeHostname(hostname);
  if (temporaryAllows.some((allow) => allow.hostname === normalized && isTemporaryAllowActive(allow, now))) return false;
  if (mode === "allowlist") return !allowed.some((rule) => matchesDomain(normalized, rule));
  return blocked.some((rule) => matchesDomain(normalized, rule));
}
