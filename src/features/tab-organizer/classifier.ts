import { matchesDomain, normalizeHostname } from "../blocking/domain";
import { ALLOWED_SITE_PRESETS, BLOCKED_SITE_PRESETS } from "../schedules/site-presets";
import type { TabCategory } from "../../shared/types/models";
import type { ClassificationReason, TabClassification, TabClassificationContext, TabContext, UserTabClassificationRule } from "./types";

export const MIN_CLASSIFICATION_SCORE = 40;
export const MIN_SCORE_GAP = 15;

const REFERENCE_DOMAINS = ["developer.mozilla.org", "react.dev", "stackoverflow.com", "wikipedia.org"];
const COMMUNICATION_DOMAINS = ["mail.google.com", "slack.com", "discord.com", "linear.app"];
const CONTEXT_SENSITIVE_DOMAINS = ["youtube.com", "youtu.be", "netflix.com", "notion.so"];

function domainMatches(hostname: string, candidate: string): boolean {
  return hostname === candidate || hostname.endsWith(`.${candidate}`);
}

function add(scores: Record<Exclude<TabCategory, "unclassified">, number>, reasons: ClassificationReason[], category: Exclude<TabCategory, "unclassified">, scoreDelta: number, code: string, label: string): void {
  scores[category] += scoreDelta;
  reasons.push({ code, label, scoreDelta });
}

export function hostnameFromTabUrl(url: string | null): string | null {
  if (!url || !/^https?:\/\//i.test(url)) return null;
  try { return normalizeHostname(new URL(url).hostname); } catch { return null; }
}

export function classifyTab(tab: TabContext, context: TabClassificationContext, rules: UserTabClassificationRule[] = [], openerCategory?: TabCategory): TabClassification {
  if (!tab.hostname) return { tabId: tab.tabId, category: "unclassified", score: 0, confidence: "low", reasons: [] };
  const allowed = context.allowedDomains.some((rule) => matchesDomain(tab.hostname!, rule));
  if (allowed) return { tabId: tab.tabId, category: "work", score: 100, confidence: "high", reasons: [{ code: "schedule-allowed", label: "현재 일정 허용 사이트", scoreDelta: 100 }] };
  if ((tab.url && context.workTabUrls?.includes(tab.url)) || context.workTabHostnames?.some((hostname) => domainMatches(tab.hostname!, hostname))) {
    return { tabId: tab.tabId, category: "work", score: 90, confidence: "high", reasons: [{ code: "work-tab-set", label: "현재 일정 작업 탭 세트", scoreDelta: 90 }] };
  }
  const scheduleRule = rules.find((rule) => rule.scope === "schedule" && rule.scheduleId === context.scheduleId && domainMatches(tab.hostname!, rule.hostname));
  const globalRule = rules.find((rule) => rule.scope === "global" && domainMatches(tab.hostname!, rule.hostname));
  const selectedRule = scheduleRule ?? globalRule;
  if (selectedRule && selectedRule.category !== "unclassified") return { tabId: tab.tabId, category: selectedRule.category, score: scheduleRule ? 85 : 75, confidence: "high", reasons: [{ code: scheduleRule ? "schedule-rule" : "global-rule", label: "사용자가 기억한 분류", scoreDelta: scheduleRule ? 85 : 75 }] };
  const blocked = context.blockedDomains.some((rule) => matchesDomain(tab.hostname!, rule));
  if (blocked) return { tabId: tab.tabId, category: "break", score: 100, confidence: "high", reasons: [{ code: "schedule-blocked", label: "현재 일정 방해 사이트", scoreDelta: 100 }] };

  const scores = { work: 0, reference: 0, communication: 0, break: 0 };
  const reasons: ClassificationReason[] = [];
  const sensitive = CONTEXT_SENSITIVE_DOMAINS.some((domain) => domainMatches(tab.hostname!, domain));
  if (tab.openedDuringMode === "break") add(scores, reasons, "break", 40, "opened-during-break", "휴식 중 열린 탭");
  if (REFERENCE_DOMAINS.some((domain) => domainMatches(tab.hostname!, domain))) add(scores, reasons, "reference", 45, "reference-domain", "문서·참고 사이트");
  if (COMMUNICATION_DOMAINS.some((domain) => domainMatches(tab.hostname!, domain))) add(scores, reasons, "communication", 50, "communication-domain", "메일·협업 사이트");
  if (!sensitive && BLOCKED_SITE_PRESETS.some((preset) => domainMatches(tab.hostname!, preset.hostname))) add(scores, reasons, "break", 50, "break-domain", "휴식 사이트 후보");
  if (!sensitive && ALLOWED_SITE_PRESETS.some((preset) => domainMatches(tab.hostname!, preset.hostname))) add(scores, reasons, "work", 40, "work-domain", "작업 사이트 후보");
  const text = `${tab.title ?? ""} ${tab.url ?? ""}`.toLocaleLowerCase();
  if (context.taskKeywords.some((keyword) => keyword.length >= 2 && text.includes(keyword.toLocaleLowerCase()))) add(scores, reasons, "work", 35, "schedule-keyword", "일정 키워드 일치");
  if (openerCategory === "work") add(scores, reasons, "reference", 25, "work-opener", "작업 탭에서 연 자료");

  const ranked = (Object.entries(scores) as Array<[Exclude<TabCategory, "unclassified">, number]>).sort((a, b) => b[1] - a[1]);
  const [first, second] = ranked;
  if (first[1] < MIN_CLASSIFICATION_SCORE || first[1] - second[1] < MIN_SCORE_GAP) return { tabId: tab.tabId, category: "unclassified", score: first[1], confidence: "low", reasons };
  return { tabId: tab.tabId, category: first[0], score: first[1], confidence: first[1] >= 75 ? "high" : "medium", reasons };
}

export function groupTitle(category: TabCategory, scheduleTitle?: string): string {
  if (category === "work") return scheduleTitle ? `🎯 ${scheduleTitle.slice(0, 24)}` : "🎯 현재 작업";
  if (category === "reference") return "📚 참고 자료";
  if (category === "communication") return "💬 커뮤니케이션";
  if (category === "break") return "☕ 휴식 탭";
  return "📦 분류 필요";
}
