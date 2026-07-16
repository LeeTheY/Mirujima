import { DNR_RULE_ID_END, DNR_RULE_ID_START } from "../shared/constants";
import { isTemporaryAllowActive } from "../features/blocking/domain";
import type { FocusSession, Schedule, TemporaryAllow } from "../shared/types/models";

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function domainRegex(hostname: string, includeSubdomains: boolean): string {
  const escaped = escapeRegex(hostname);
  const hostPattern = includeSubdomains ? `(?:[^/:]+\\.)*${escaped}` : escaped;
  return `^https?://(${hostPattern})(?::\\d+)?(?:/|$)`;
}

export function createBlockingRules(
  schedule: Schedule,
  session: FocusSession,
  temporaryAllows: TemporaryAllow[],
  extensionBaseUrl: string
): chrome.declarativeNetRequest.Rule[] {
  if (schedule.blockingMode === "off" || session.status !== "active") return [];
  const activeAllows = temporaryAllows
    .filter((item) => item.sessionId === session.id && isTemporaryAllowActive(item))
    .map((item) => ({ hostname: item.hostname, includeSubdomains: false }));
  const redirect = { regexSubstitution: `${extensionBaseUrl}blocked.html?host=\\1` };
  const resourceTypes = [chrome.declarativeNetRequest.ResourceType.MAIN_FRAME];
  const allowRules = [...schedule.allowedDomains, ...activeAllows].map((rule, index): chrome.declarativeNetRequest.Rule => ({
    id: DNR_RULE_ID_START + 1 + index,
    priority: 2,
    action: { type: chrome.declarativeNetRequest.RuleActionType.ALLOW },
    condition: { regexFilter: domainRegex(rule.hostname, rule.includeSubdomains), resourceTypes }
  }));
  if (schedule.blockingMode === "allowlist") {
    return [{
      id: DNR_RULE_ID_START,
      priority: 1,
      action: { type: chrome.declarativeNetRequest.RuleActionType.REDIRECT, redirect },
      condition: { regexFilter: "^https?://([^/:]+)(?::\\d+)?(?:/|$)", resourceTypes }
    }, ...allowRules];
  }
  const temporaryAllowRules = activeAllows.map((rule, index): chrome.declarativeNetRequest.Rule => ({
    id: DNR_RULE_ID_START + 1 + schedule.blockedDomains.length + index,
    priority: 2,
    action: { type: chrome.declarativeNetRequest.RuleActionType.ALLOW },
    condition: { regexFilter: domainRegex(rule.hostname, false), resourceTypes }
  }));
  const blockRules = schedule.blockedDomains.map((rule, index): chrome.declarativeNetRequest.Rule => ({
    id: DNR_RULE_ID_START + index,
    priority: 1,
    action: { type: chrome.declarativeNetRequest.RuleActionType.REDIRECT, redirect },
    condition: { regexFilter: domainRegex(rule.hostname, rule.includeSubdomains), resourceTypes }
  }));
  return [...blockRules, ...temporaryAllowRules];
}

export async function clearBlockingRules(): Promise<void> {
  const rules = await chrome.declarativeNetRequest.getSessionRules();
  const ids = rules.map((rule) => rule.id).filter((id) => id >= DNR_RULE_ID_START && id <= DNR_RULE_ID_END);
  if (ids.length) await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: ids });
}

export async function applyBlockingRules(
  schedule: Schedule,
  session: FocusSession,
  temporaryAllows: TemporaryAllow[]
): Promise<void> {
  await clearBlockingRules();
  const rules = createBlockingRules(schedule, session, temporaryAllows, chrome.runtime.getURL(""));
  if (rules.length) await chrome.declarativeNetRequest.updateSessionRules({ addRules: rules });
}
